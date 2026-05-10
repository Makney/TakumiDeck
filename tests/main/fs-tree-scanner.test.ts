import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  scanProjectTree,
  type FsTreeLikeDriver,
} from '../../src/main/fs/treeScanner';

// Sprint 7 — Tests für den hierarchischen Datei-Browser-Scanner.
// Wir fahren gegen einen Plain-Object-FakeFs (gleiches Pattern wie der
// Workspace-Scanner und der Template-Reader). Kein echter Filesystem-Roundtrip.

class FakeFs implements FsTreeLikeDriver {
  // Map: dir → Set of entries (name + isDirectory).
  private readonly tree = new Map<
    string,
    Array<{ name: string; isDir: boolean }>
  >();

  // Hilfs-Setter: legt einen Pfad an. dir darf bereits existieren.
  add(dir: string, name: string, isDir: boolean): void {
    const norm = path.normalize(dir);
    const list = this.tree.get(norm) ?? [];
    list.push({ name, isDir });
    this.tree.set(norm, list);
  }

  async readdir(dir: string) {
    const norm = path.normalize(dir);
    const entries = this.tree.get(norm) ?? [];
    return entries.map((e) => ({
      name: e.name,
      isDirectory: () => e.isDir,
      isFile: () => !e.isDir,
    }));
  }
}

describe('scanProjectTree', () => {
  it('liefert flache Files an der Wurzel sortiert', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, 'README.md', false);
    fs.add(root, 'CLAUDE.md', false);
    fs.add(root, 'package.json', false);
    const tree = await scanProjectTree({ rootPath: root }, fs);
    expect(tree.map((n) => n.name)).toEqual([
      'CLAUDE.md',
      'package.json',
      'README.md',
    ]);
    expect(tree.every((n) => n.kind === 'file')).toBe(true);
  });

  it('Verzeichnisse vor Files sortiert (case-insensitive)', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, 'src', true);
    fs.add(root, 'README.md', false);
    fs.add(root, 'docs', true);
    fs.add(root, 'apps', true);
    const tree = await scanProjectTree({ rootPath: root }, fs);
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual([
      'dir:apps',
      'dir:docs',
      'dir:src',
      'file:README.md',
    ]);
  });

  it('rekursiv mit relPath in Forward-Slash-Form', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, 'docs', true);
    fs.add(path.join(root, 'docs'), 'CHANGELOG.md', false);
    fs.add(path.join(root, 'docs'), 'roadmap', true);
    fs.add(path.join(root, 'docs', 'roadmap'), 'PHASE1.md', false);
    const tree = await scanProjectTree({ rootPath: root }, fs);
    expect(tree).toHaveLength(1);
    const docs = tree[0]!;
    expect(docs.relPath).toBe('docs');
    expect(docs.children).toHaveLength(2);
    const roadmap = docs.children!.find((c) => c.name === 'roadmap')!;
    expect(roadmap.relPath).toBe('docs/roadmap');
    expect(roadmap.children).toHaveLength(1);
    expect(roadmap.children![0]!.relPath).toBe('docs/roadmap/PHASE1.md');
  });

  it('überspringt node_modules, .git, dist, build, .vite, .next', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, 'node_modules', true);
    fs.add(root, '.git', true);
    fs.add(root, 'dist', true);
    fs.add(root, 'build', true);
    fs.add(root, '.vite', true);
    fs.add(root, '.next', true);
    fs.add(root, 'src', true);
    const tree = await scanProjectTree({ rootPath: root }, fs);
    expect(tree.map((n) => n.name)).toEqual(['src']);
  });

  it('überspringt versteckte Files (.startsWith("."))', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, '.env', false);
    fs.add(root, '.hidden', false);
    fs.add(root, 'public.md', false);
    const tree = await scanProjectTree({ rootPath: root }, fs);
    expect(tree.map((n) => n.name)).toEqual(['public.md']);
  });

  it('aber zeigt .gitignore / .gitattributes / .editorconfig (Konfig-relevant)', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, '.gitignore', false);
    fs.add(root, '.gitattributes', false);
    fs.add(root, '.editorconfig', false);
    fs.add(root, '.something-else', false);
    const tree = await scanProjectTree({ rootPath: root }, fs);
    expect(tree.map((n) => n.name).sort()).toEqual([
      '.editorconfig',
      '.gitattributes',
      '.gitignore',
    ]);
  });

  it('respektiert maxDepth (Verzeichnis hat children=[] bei Limit)', async () => {
    const fs = new FakeFs();
    const root = path.normalize('C:/repo');
    fs.add(root, 'a', true);
    fs.add(path.join(root, 'a'), 'b', true);
    fs.add(path.join(root, 'a', 'b'), 'c.md', false);
    const tree = await scanProjectTree({ rootPath: root, maxDepth: 1 }, fs);
    const a = tree[0]!;
    expect(a.children).toHaveLength(1);
    const b = a.children![0]!;
    // depth 1 erreicht: b ist sichtbar (depth 0 = root, depth 1 = a's children),
    // b.children muss leer sein, weil depth+1 nicht mehr < maxDepth ist.
    expect(b.name).toBe('b');
    expect(b.children).toEqual([]);
  });
});
