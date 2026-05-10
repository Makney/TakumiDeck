import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { FsTreeNode } from '@shared/types';

// Hierarchischer Project-Scanner für den Right-Pane-Datei-Browser (Sprint 7,
// Phase 5). Liefert pro Aufruf den kompletten Tree bis maxDepth, sodass der
// Renderer ohne weitere IPC-Roundtrips expand/collapse + Filter umsetzen kann.
//
// Skip-Liste: typische Build/Tool-Verzeichnisse, die für die Dokumentations-
// und CLAUDE.md-Editor-UX irrelevant sind und den Tree sonst zumüllen würden.
// Versteckte Verzeichnisse (.start) werden global übersprungen — `.git` ist
// abgedeckt, `.vscode` etc. ebenso.
//
// Driver-Injection wie workspace/scanner.ts: Tests fahren gegen einen Plain-
// Object-FakeFs, kein echter Filesystem-Roundtrip.

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.vite',
  'dist',
  'build',
  '.next',
  '.cache',
  '.turbo',
  '.idea',
  '.vscode',
  'out',
  'coverage',
]);

export interface FsTreeLikeDriver {
  // Liefert Datei- + Verzeichnis-Einträge eines Pfads. Bei nicht-existentem
  // Pfad → leeres Array (kein Throw), damit ein Project-Pfad ohne docs/-Ordner
  // einfach unterschlagen wird.
  readdir(dir: string): Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>>;
}

export const realFsTreeDriver: FsTreeLikeDriver = {
  async readdir(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory(),
        isFile: () => e.isFile(),
      }));
    } catch (e) {
      if (isExpectedFsError(e)) return [];
      throw e;
    }
  },
};

export interface ScanProjectTreeInput {
  // Absoluter Pfad zur Project-Wurzel.
  rootPath: string;
  // Maximale Tiefe relativ zur Wurzel. 0 = nur Wurzel-Inhalt, 1 = +1 Ebene Sub-Dirs etc.
  // Defaults auf 5 — gleiche Tiefe wie der Sprint-4-Workspace-Scanner.
  maxDepth?: number;
}

export async function scanProjectTree(
  input: ScanProjectTreeInput,
  driver: FsTreeLikeDriver,
): Promise<FsTreeNode[]> {
  const maxDepth = input.maxDepth ?? 5;
  return walk(input.rootPath, '', 0, maxDepth, driver);
}

async function walk(
  absRoot: string,
  relPrefix: string,
  depth: number,
  maxDepth: number,
  driver: FsTreeLikeDriver,
): Promise<FsTreeNode[]> {
  const absDir = relPrefix === '' ? absRoot : path.join(absRoot, relPrefix);
  const entries = await driver.readdir(absDir);
  const out: FsTreeNode[] = [];
  // Stabile Sortierung: Verzeichnisse zuerst, dann Files; alphabetisch case-
  // insensitive. Render-Schicht muss nicht selbst sortieren.
  const sorted = entries.slice().sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
  for (const entry of sorted) {
    if (shouldSkip(entry.name, entry.isDirectory())) continue;
    const relPath = relPrefix === '' ? entry.name : `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      // Bei erreichter maxDepth: Verzeichnis ohne children listen (visuell
      // sichtbar, aber nicht aufklappbar). Renderer entscheidet, was er damit
      // macht — typischerweise einen … -Hinweis zeigen.
      // Vertrag: depth=0 verarbeitet die Root-Entries, depth=1 die
      // Direkt-Children einer Root-Dir, usw. „maxDepth = N Sub-Dir-Levels":
      // wir rekursieren, solange depth < maxDepth — der nächste Aufruf landet
      // dann auf depth+1, was höchstens maxDepth erreicht.
      const children =
        depth < maxDepth
          ? await walk(absRoot, relPath, depth + 1, maxDepth, driver)
          : [];
      out.push({ name: entry.name, relPath, kind: 'dir', children });
    } else if (entry.isFile()) {
      out.push({ name: entry.name, relPath, kind: 'file' });
    }
  }
  return out;
}

function shouldSkip(name: string, isDir: boolean): boolean {
  // Versteckte Files und Dirs überspringen — bis auf die paar, die der User
  // im Editor wirklich sehen will (.gitignore z.B. ist konfigurations-relevant).
  if (name.startsWith('.')) {
    if (name === '.gitignore' || name === '.gitattributes' || name === '.editorconfig') {
      return false;
    }
    return true;
  }
  if (isDir && SKIP_DIRS.has(name)) return true;
  return false;
}

function isExpectedFsError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR' || code === 'EPERM';
}
