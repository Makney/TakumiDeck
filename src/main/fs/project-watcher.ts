import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { Logger } from '../logger';
import type { FsChangedEvent } from '@shared/types';

// Phase-2 Season-29 (Multi-Tab-Diff Auto-Refresh): chokidar-Watcher pro aktivem
// Projekt-Root. Renderer ruft `setProject(projectId, projectPath)` beim
// Projekt-Wechsel; der Watcher stoppt einen ggf. laufenden Watcher und startet
// einen neuen. `setProject(null, null)` stoppt nur.
//
// Skip-Liste analog zum fs:list-tree-Scanner aus Sprint 7 (node_modules/.git/
// dist/build/.vite/.next/.idea/.vscode/out/coverage). Ohne den Filter wuerde
// jedes `npm install` eine Lawine an Events ausloesen.
//
// Push-Strategie: Debounce 200 ms. Bei einem Editor-Save kommen oft mehrere
// chokidar-Events binnen ~50 ms — die buendeln wir zu einem Batch. Pfade
// werden auf Forward-Slash + projektrelativ normalisiert (gleiche Konvention
// wie FsTreeNode/fs:read).
//
// Pattern wie JsonlWatcher: thin chokidar-Wrapper, Logger fuer Diagnostic,
// `stop()` awaited damit alle pending Pushes durch sind bevor die DB
// schliesst (Push selbst ist sync, daher unkritisch — aber Konvention bleibt).

export interface ProjectFilesWatcherDeps {
  log: Logger;
  // Push-Funktion an den Renderer. Im realen Setup `mainWindow.webContents.send`,
  // in Tests ein vi.fn(). Synchron.
  push: (event: FsChangedEvent) => void;
  // Debounce-Schwelle in ms. Default 200; Tests koennen 0 setzen, um den
  // Buffer direkt zu flushen.
  debounceMs?: number;
}

// Skip-Liste laut Architektur 6.7-Konvention. Konstant exportieren, damit
// Tests denselben Set sehen koennen.
export const PROJECT_WATCH_SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.vite',
  '.next',
  '.idea',
  '.vscode',
  'out',
  'coverage',
]);

// Pure Helper fuer den chokidar-ignored-Predicate. Exportiert fuer Tests.
// Liefert true, wenn der absolute Pfad in einem geblockten Verzeichnis liegt.
// Wir checken nur die Pfad-Segmente; chokidar reicht sowohl Files als auch
// Directories durch denselben Filter.
export function isSkippedPath(absPath: string, projectPath: string): boolean {
  const rel = path.relative(projectPath, absPath);
  if (rel.startsWith('..')) return false; // ausserhalb des Roots — chokidar sollte das nicht passieren
  const segments = rel.split(/[\\/]/);
  for (const seg of segments) {
    if (PROJECT_WATCH_SKIP_DIRS.has(seg)) return true;
  }
  return false;
}

// Pure Helper: absolute chokidar-Pfade in projekt-relative Forward-Slash-
// Notation umwandeln (gleiche Konvention wie FsTreeNode).
export function toRelativePath(absPath: string, projectPath: string): string {
  const rel = path.relative(projectPath, absPath);
  return rel.split(path.sep).join('/');
}

export class ProjectFilesWatcher {
  private watcher: FSWatcher | null = null;
  private projectId: string | null = null;
  private projectPath: string | null = null;
  private buffer = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ProjectFilesWatcherDeps) {}

  // Hauptmethode. Wechselt das beobachtete Projekt. `projectPath=null` oder
  // ein leerer String stoppt nur. Mehrere Aufrufe in Folge sind idempotent —
  // ein Wechsel von Projekt A → A ist no-op (kein chokidar-Restart, weil das
  // sonst die ready-Phase nochmal durchlaufen wuerde).
  async setProject(projectId: string | null, projectPath: string | null): Promise<void> {
    if (projectId === this.projectId && projectPath === this.projectPath) {
      return; // idempotent
    }
    // Alten Watcher zuerst schliessen, damit kein Event aus dem alten Projekt
    // mehr durchrutscht und faelschlicherweise als neue Aenderung gepusht wird.
    await this.stopInternal();
    this.projectId = projectId;
    this.projectPath = projectPath;
    if (!projectId || !projectPath) {
      this.deps.log.info('[project-watcher] gestoppt (kein aktives Projekt)');
      return;
    }
    const watcher = chokidar.watch(projectPath, {
      // Initial-Scan ueberspringen — wir interessieren uns nur fuer Aenderungen
      // ab dem Zeitpunkt, an dem das Projekt aktiv wird. Sonst feuert chokidar
      // beim Mount tausende `add`-Events fuer den ganzen Tree.
      ignoreInitial: true,
      // Schneller als der JSONL-Default (100ms), weil Editor-Saves typischerweise
      // < 50 ms dauern. 50/30 reicht, der 200-ms-Debounce darunter buendelt eh.
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 30 },
      usePolling: false,
      // Tiefen-Limit: 8 Ebenen — bewusst tiefer als der fs:list-tree-Scanner-
      // Default (5), weil der Watcher auch tiefer verschachtelte Edits melden
      // soll. Mehr braucht der Daily-Use nicht; sehr tiefe Projekte hätten sonst
      // chokidar-Lag.
      depth: 8,
      // Skip-Filter: Verzeichnisse + Files in den Skip-Dirs aussperren.
      // chokidar ruft den Predicate sowohl mit Dirs als auch mit Files auf.
      ignored: (p) => isSkippedPath(p, projectPath),
    });
    watcher.on('add', (p) => this.enqueue(p));
    watcher.on('change', (p) => this.enqueue(p));
    watcher.on('unlink', (p) => this.enqueue(p));
    watcher.on('error', (e) =>
      this.deps.log.warn('[project-watcher] chokidar-error', e),
    );
    watcher.on('ready', () => {
      this.deps.log.info(
        `[project-watcher] ready projectId=${projectId} path=${projectPath}`,
      );
    });
    this.watcher = watcher;
  }

  async stop(): Promise<void> {
    await this.stopInternal();
    this.projectId = null;
    this.projectPath = null;
  }

  private async stopInternal(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer.clear();
    if (this.watcher) {
      const w = this.watcher;
      this.watcher = null;
      try {
        await w.close();
      } catch (e) {
        this.deps.log.warn('[project-watcher] close fehlgeschlagen', e);
      }
    }
  }

  private enqueue(absPath: string): void {
    if (!this.projectPath || !this.projectId) return;
    // Defensiv: ein Event aus einem Skip-Dir kann der chokidar-Filter selbst
    // in seltenen Faellen durchlassen (z.B. bei symbolischen Links). Doppel-
    // Check spart sinnlose Pushes.
    if (isSkippedPath(absPath, this.projectPath)) return;
    this.buffer.add(toRelativePath(absPath, this.projectPath));
    const debounceMs = this.deps.debounceMs ?? 200;
    if (debounceMs === 0) {
      this.flush();
      return;
    }
    if (this.flushTimer) return; // schon geplant
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, debounceMs);
  }

  private flush(): void {
    if (this.buffer.size === 0) return;
    if (!this.projectId) {
      this.buffer.clear();
      return;
    }
    const paths = Array.from(this.buffer);
    this.buffer.clear();
    this.deps.push({ projectId: this.projectId, paths });
  }
}
