import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ScannedProject } from '@shared/types';

// Workspace-Scanner — pure Logik mit Driver-Injection.
//
// Ablauf (Architektur 6.1):
// 1. Ausgangs-Verzeichnis = settings.workspace_path.
// 2. Rekursiv readdir, max-depth 5.
// 3. Trifft der Walker einen Ordner, der `CLAUDE.md` enthält → Projekt erkannt,
//    Stop-Marker, kein weiterer Recurse in diesen Sub-Tree (Architektur 6.1:
//    „CLAUDE.md = Pflicht, .git = optional").
// 4. Trifft er einen Ordner mit `.git/` (aber ohne CLAUDE.md) → Stop, kein Projekt.
//    `.git`-Ordner allein qualifiziert nicht — der CLAUDE.md-Marker ist Pflicht.
//    Wenn ein Projekt sowohl CLAUDE.md *als auch* .git/ hat, gilt has_git=true.
// 5. EACCES, ENOTDIR und ENOENT werden geschluckt — das Scan-Ergebnis bleibt eine
//    Best-Effort-Liste.
//
// Konkurrenz: ein einfacher Promise-Pool (default-Limit 4) verarbeitet Subordner
// parallel, ohne den Event-Loop zu fluten. Für 1–3 Projekte ist das overkill, aber
// die Variante-A-Empfehlung war explizit: skaliert mit, wenn der Workspace mal
// viele Subordner hat.

export const DEFAULT_MAX_DEPTH = 5;
export const DEFAULT_CONCURRENCY = 4;

// Phase-2 Season-18: Boot-Skip-Predicate fuer den initialen Workspace-Scan.
// Pure Funktion — kein FS-Zugriff, nur das Settings-Snapshot.
//
//   1. Wizard noch nicht durchlaufen → kein Scan, der Renderer zeigt erst den
//      Welcome-Screen. Andernfalls wuerde der Default-`<home>/Projekte` doch
//      wieder still gescannt.
//   2. `workspace_path` leer (Skip-Pfad im Wizard) → kein Scan. Der User hat
//      sich aktiv gegen einen Workspace-Pfad entschieden.
//
// `trim()` faengt User-Edits in den Settings ab, die nur Whitespace
// hinterlassen — funktional kein Pfad.
export function shouldRunInitialWorkspaceScan(settings: {
  workspace_wizard_completed: boolean;
  workspace_path: string;
}): boolean {
  if (!settings.workspace_wizard_completed) return false;
  if (settings.workspace_path.trim().length === 0) return false;
  return true;
}

export interface FsLikeDriver {
  // Liefert die Dirent-ähnlichen Einträge eines Verzeichnisses. `name` ohne Pfad,
  // `isDirectory()` als Methode (kompatibel zu `fs.Dirent`).
  readdir(dir: string): Promise<Array<{ name: string; isDirectory: () => boolean }>>;
  // Existenz-Check für eine Datei, idempotent.
  fileExists(filePath: string): Promise<boolean>;
}

export interface ScanOptions {
  maxDepth?: number;
  concurrency?: number;
}

export const realFsDriver: FsLikeDriver = {
  async readdir(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      // Dirent-Objekte haben isDirectory(); wir mappen auf das schmale Interface,
      // damit Tests mit reinen Plain-Objects auskommen.
      return entries.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory(),
      }));
    } catch (e) {
      // EACCES / ENOENT / ENOTDIR → leeres Listing, kein Crash. Andere Fehler
      // werfen wir weiter, damit echte IO-Probleme sichtbar sind.
      if (isExpectedFsError(e)) return [];
      throw e;
    }
  },
  async fileExists(filePath: string) {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch (e) {
      if (isExpectedFsError(e)) return false;
      throw e;
    }
  },
};

function isExpectedFsError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === 'EACCES' || code === 'ENOENT' || code === 'ENOTDIR' || code === 'EPERM';
}

// Hauptfunktion: scannt ein Wurzelverzeichnis und liefert die erkannten Projekte.
// Reine Daten-Funktion — keine DB-Schreiben, kein Logging-Side-Effect.
export async function scanWorkspace(
  rootDir: string,
  driver: FsLikeDriver,
  options: ScanOptions = {},
): Promise<ScannedProject[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const found: ScannedProject[] = [];

  // Schmaler Promise-Pool: speist `concurrency` Worker, die aus einer Queue ziehen.
  // Vermeidet das Anti-Pattern eines unbegrenzten Promise.all über einen breiten Tree.
  type Task = { dir: string; depth: number };
  const queue: Task[] = [{ dir: rootDir, depth: 0 }];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) return;
      await visit(task);
    }
  }

  async function visit(task: Task): Promise<void> {
    const { dir, depth } = task;

    // Prüfen, ob dir ein Projekt ist (CLAUDE.md vorhanden). Falls ja: Stop-Marker.
    const hasClaudeMd = await driver.fileExists(path.join(dir, 'CLAUDE.md'));
    if (hasClaudeMd) {
      // .git ist optional — checken, aber der Recurse stoppt so oder so.
      const entries = await driver.readdir(dir);
      const hasGit = entries.some((e) => e.name === '.git' && e.isDirectory());
      found.push({
        name: path.basename(dir) || dir,
        path: dir,
        has_git: hasGit,
      });
      return;
    }

    // Wurzelverzeichnis selbst kann auch Stop-Marker `.git` enthalten — wenn ja,
    // ohne CLAUDE.md ist es trotzdem kein Projekt; recurse stoppt.
    if (depth >= maxDepth) return;

    const entries = await driver.readdir(dir);
    let stoppedByGit = false;
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === '.git') {
        // Stop-Marker: Sub-Tree wird nicht weiter erkundet, auch wenn CLAUDE.md
        // fehlt. Schützt gegen Worktrees/Submodul-Tiefen.
        stoppedByGit = true;
        break;
      }
    }
    if (stoppedByGit) return;

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      // Versteckte Verzeichnisse (mit Punkt-Präfix außer `.git`, das oben behandelt ist)
      // ignorieren — node_modules etc. sind ohnehin nicht Projekt-Marker, und wir wollen
      // keine 50.000-Datei-Walks.
      if (e.name.startsWith('.')) continue;
      if (e.name === 'node_modules') continue;
      queue.push({ dir: path.join(dir, e.name), depth: depth + 1 });
    }
  }

  // Zuerst die Wurzel selbst behandeln (synchron in der Queue), dann den Pool starten.
  // Wenn rootDir selbst eine CLAUDE.md hat, fungiert das als Single-Project-Workspace.
  const initial = queue.shift();
  if (initial) await visit(initial);

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  // Stabile Sortierung nach Pfad — testbar und UI-konsistent.
  found.sort((a, b) => a.path.localeCompare(b.path));
  return found;
}
