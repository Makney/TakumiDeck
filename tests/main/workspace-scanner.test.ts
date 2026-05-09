import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  scanWorkspace,
  type FsLikeDriver,
} from '../../src/main/workspace/scanner';

// Fake-FS-Driver, gefüttert über eine flache Tree-Struktur:
// keys sind Verzeichnis-Pfade, Werte sind Listen aus { name, isDir? }.
// "files" außerhalb der Tree-Struktur prüft fileExists() per Set-Lookup.
//
// Pfade verwenden POSIX-Slash; das Modul nutzt path.join, das auf Windows automatisch
// `\` produziert — dieselben Tests laufen daher auf Win32 und POSIX gleich (path.sep
// kommt vom Test-Host, alle anderen Operationen sind separator-agnostisch).

interface FakeNode {
  name: string;
  isDir: boolean;
}

function makeFakeFs(opts: {
  dirs: Record<string, FakeNode[]>;
  files: Set<string>;
}): FsLikeDriver {
  return {
    async readdir(dir: string) {
      // Normalisierung: path.resolve im Modul verändert Trailing-Slashes; wir
      // matchen nur exakte Schlüssel hier, weil die Tests dieselben Schlüssel
      // benutzen, die der Scanner erzeugt.
      const entries = opts.dirs[dir] ?? [];
      return entries.map((e) => ({
        name: e.name,
        isDirectory: () => e.isDir,
      }));
    },
    async fileExists(filePath: string) {
      return opts.files.has(filePath);
    },
  };
}

describe('scanWorkspace', () => {
  it('erkennt ein Single-Project im Wurzel-Verzeichnis', async () => {
    const root = path.resolve('/ws');
    const driver = makeFakeFs({
      dirs: {
        [root]: [{ name: 'CLAUDE.md', isDir: false }],
      },
      files: new Set([path.join(root, 'CLAUDE.md')]),
    });
    const result = await scanWorkspace(root, driver);
    expect(result).toEqual([
      { name: 'ws', path: root, has_git: false },
    ]);
  });

  it('stoppt bei CLAUDE.md (keine weitere Recurse in den Sub-Tree)', async () => {
    const root = path.resolve('/ws');
    const projectA = path.join(root, 'projA');
    const projectAInner = path.join(projectA, 'inner');
    const driver = makeFakeFs({
      dirs: {
        [root]: [{ name: 'projA', isDir: true }],
        [projectA]: [
          { name: 'CLAUDE.md', isDir: false },
          { name: 'inner', isDir: true },
        ],
        [projectAInner]: [{ name: 'CLAUDE.md', isDir: false }], // sollte NICHT erkannt werden
      },
      files: new Set([
        path.join(projectA, 'CLAUDE.md'),
        path.join(projectAInner, 'CLAUDE.md'),
      ]),
    });
    const result = await scanWorkspace(root, driver);
    expect(result).toEqual([{ name: 'projA', path: projectA, has_git: false }]);
  });

  it('markiert has_git=true, wenn .git/ neben CLAUDE.md liegt', async () => {
    const root = path.resolve('/ws');
    const proj = path.join(root, 'proj');
    const driver = makeFakeFs({
      dirs: {
        [root]: [{ name: 'proj', isDir: true }],
        [proj]: [
          { name: 'CLAUDE.md', isDir: false },
          { name: '.git', isDir: true },
        ],
      },
      files: new Set([path.join(proj, 'CLAUDE.md')]),
    });
    const result = await scanWorkspace(root, driver);
    expect(result).toEqual([{ name: 'proj', path: proj, has_git: true }]);
  });

  it('stoppt bei .git ohne CLAUDE.md (kein Projekt erkannt, keine Recurse)', async () => {
    const root = path.resolve('/ws');
    const gitDir = path.join(root, 'git-only');
    const gitDirInner = path.join(gitDir, 'inner');
    const driver = makeFakeFs({
      dirs: {
        [root]: [{ name: 'git-only', isDir: true }],
        [gitDir]: [
          { name: '.git', isDir: true },
          { name: 'inner', isDir: true },
        ],
        [gitDirInner]: [{ name: 'CLAUDE.md', isDir: false }],
      },
      files: new Set([path.join(gitDirInner, 'CLAUDE.md')]),
    });
    const result = await scanWorkspace(root, driver);
    expect(result).toEqual([]);
  });

  it('respektiert max-depth', async () => {
    const root = path.resolve('/ws');
    const a = path.join(root, 'a');
    const b = path.join(a, 'b');
    const c = path.join(b, 'c');
    const d = path.join(c, 'd');
    const driver = makeFakeFs({
      dirs: {
        [root]: [{ name: 'a', isDir: true }],
        [a]: [{ name: 'b', isDir: true }],
        [b]: [{ name: 'c', isDir: true }],
        [c]: [{ name: 'd', isDir: true }],
        // d enthält CLAUDE.md, aber d liegt auf depth=4 vom Root aus, mit max-depth=3
        // wird es NICHT mehr inspiziert.
        [d]: [{ name: 'CLAUDE.md', isDir: false }],
      },
      files: new Set([path.join(d, 'CLAUDE.md')]),
    });
    const result = await scanWorkspace(root, driver, { maxDepth: 3 });
    expect(result).toEqual([]);
  });

  it('ignoriert versteckte Verzeichnisse und node_modules', async () => {
    const root = path.resolve('/ws');
    const hidden = path.join(root, '.cache');
    const nm = path.join(root, 'node_modules');
    const real = path.join(root, 'real');
    const driver = makeFakeFs({
      dirs: {
        [root]: [
          { name: '.cache', isDir: true },
          { name: 'node_modules', isDir: true },
          { name: 'real', isDir: true },
        ],
        [hidden]: [{ name: 'CLAUDE.md', isDir: false }],
        [nm]: [{ name: 'CLAUDE.md', isDir: false }],
        [real]: [{ name: 'CLAUDE.md', isDir: false }],
      },
      files: new Set([
        path.join(hidden, 'CLAUDE.md'),
        path.join(nm, 'CLAUDE.md'),
        path.join(real, 'CLAUDE.md'),
      ]),
    });
    const result = await scanWorkspace(root, driver);
    expect(result).toEqual([{ name: 'real', path: real, has_git: false }]);
  });

  it('liefert mehrere Projekte sortiert nach Pfad', async () => {
    const root = path.resolve('/ws');
    const za = path.join(root, 'zeta');
    const al = path.join(root, 'alpha');
    const driver = makeFakeFs({
      dirs: {
        [root]: [
          { name: 'zeta', isDir: true },
          { name: 'alpha', isDir: true },
        ],
        [za]: [{ name: 'CLAUDE.md', isDir: false }],
        [al]: [{ name: 'CLAUDE.md', isDir: false }],
      },
      files: new Set([
        path.join(za, 'CLAUDE.md'),
        path.join(al, 'CLAUDE.md'),
      ]),
    });
    const result = await scanWorkspace(root, driver);
    // path.localeCompare sortiert alphabetisch — alpha vor zeta.
    expect(result.map((p) => p.name)).toEqual(['alpha', 'zeta']);
  });

  it('schluckt fs-Errors in nicht-lesbaren Subordnern (EACCES) und liefert Best-Effort', async () => {
    const root = path.resolve('/ws');
    const denied = path.join(root, 'denied');
    const ok = path.join(root, 'ok');
    const driver: FsLikeDriver = {
      async readdir(dir: string) {
        if (dir === root) {
          return [
            { name: 'denied', isDirectory: () => true },
            { name: 'ok', isDirectory: () => true },
          ];
        }
        if (dir === ok) return [{ name: 'CLAUDE.md', isDirectory: () => false }];
        if (dir === denied) {
          // Simuliert das Verhalten von realFsDriver: schluckt EACCES intern und
          // liefert leeres Listing zurück. Tests sollen nicht abbrechen.
          return [];
        }
        return [];
      },
      async fileExists(filePath: string) {
        return filePath === path.join(ok, 'CLAUDE.md');
      },
    };
    const result = await scanWorkspace(root, driver);
    expect(result).toEqual([{ name: 'ok', path: ok, has_git: false }]);
  });
});
