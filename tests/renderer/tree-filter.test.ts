import { describe, it, expect } from 'vitest';
import { filterTree } from '../../src/renderer/components/treeFilter';
import type { FsTreeNode } from '../../src/shared/types';

// Sprint 7 — Tests für den Tree-Filter (Q2 Variante B: Default „.md" im
// Suchfeld; Filter wirkt auf den vom Scanner gelieferten Tree).

const tree: FsTreeNode[] = [
  {
    name: 'docs',
    relPath: 'docs',
    kind: 'dir',
    children: [
      { name: 'CHANGELOG.md', relPath: 'docs/CHANGELOG.md', kind: 'file' },
      { name: 'FEATURES.md', relPath: 'docs/FEATURES.md', kind: 'file' },
      {
        name: 'roadmap',
        relPath: 'docs/roadmap',
        kind: 'dir',
        children: [
          { name: 'PHASE1.md', relPath: 'docs/roadmap/PHASE1.md', kind: 'file' },
        ],
      },
    ],
  },
  {
    name: 'src',
    relPath: 'src',
    kind: 'dir',
    children: [
      { name: 'main.ts', relPath: 'src/main.ts', kind: 'file' },
      { name: 'index.html', relPath: 'src/index.html', kind: 'file' },
    ],
  },
  { name: 'CLAUDE.md', relPath: 'CLAUDE.md', kind: 'file' },
  { name: 'package.json', relPath: 'package.json', kind: 'file' },
];

describe('filterTree', () => {
  it('leerer Query: Tree unverändert (gleiche Refs)', () => {
    const result = filterTree(tree, '');
    expect(result).toBe(tree);
    const result2 = filterTree(tree, '   ');
    expect(result2).toBe(tree);
  });

  it('Query „.md" zeigt alle .md-Files inkl. Pfad-Hierarchie', () => {
    const result = filterTree(tree, '.md');
    // Top-Level: docs, src (gefiltert auf nichts → weg!), CLAUDE.md
    // Wait — src enthält keine .md → src komplett raus.
    expect(result.map((n) => n.name)).toEqual(['docs', 'CLAUDE.md']);
    const docs = result[0]!;
    expect(docs.children!.map((c) => c.name)).toEqual([
      'CHANGELOG.md',
      'FEATURES.md',
      'roadmap',
    ]);
    const roadmap = docs.children!.find((c) => c.name === 'roadmap')!;
    expect(roadmap.children!.map((c) => c.name)).toEqual(['PHASE1.md']);
  });

  it('Query „phase" findet PHASE1.md über die Tiefe', () => {
    const result = filterTree(tree, 'phase');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('docs');
    expect(result[0]!.children!.map((c) => c.name)).toEqual(['roadmap']);
  });

  it('Query „src" matched das Verzeichnis selbst → behält ALLE children', () => {
    const result = filterTree(tree, 'src');
    expect(result.map((n) => n.name)).toEqual(['src']);
    expect(result[0]!.children!.map((c) => c.name)).toEqual([
      'main.ts',
      'index.html',
    ]);
  });

  it('case-insensitive: „CLAUDE" und „claude" liefern identische Treffer', () => {
    const upper = filterTree(tree, 'CLAUDE');
    const lower = filterTree(tree, 'claude');
    expect(upper.map((n) => n.name)).toEqual(lower.map((n) => n.name));
    expect(upper.map((n) => n.name)).toEqual(['CLAUDE.md']);
  });

  it('Query ohne Treffer → leeres Array', () => {
    const result = filterTree(tree, 'definitely-not-a-file');
    expect(result).toEqual([]);
  });

  it('Filter ist non-mutativ: Original-Tree bleibt unverändert', () => {
    const before = JSON.stringify(tree);
    filterTree(tree, '.md');
    expect(JSON.stringify(tree)).toBe(before);
  });
});
