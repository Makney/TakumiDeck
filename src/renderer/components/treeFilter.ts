import type { FsTreeNode } from '@shared/types';

// Pure-Logik: Tree-Filter für den Datei-Browser (Sprint 7, Phase 5, Q2 Variante B).
//
// Q2 Variante B: alle Files anzeigen, Filter-Suchfeld vorbelegt mit „.md".
// Der User sieht beim Öffnen .md-Files, kann aber den Filter leeren oder
// auf eine andere Endung wechseln, ohne dass der Browser hartcoded wäre.
//
// Filter-Verhalten (Standard-Tree-Filter-UX):
//   - Leerer Query → Tree unverändert.
//   - Non-leerer Query → behalten:
//       (a) Files, deren Name den Query (case-insensitive) enthält.
//       (b) Verzeichnisse, die mindestens einen passenden Nachfahren enthalten.
//   - Verzeichnisse OHNE matchenden Nachfahren werden komplett weggeschnitten,
//     damit der Browser nicht voll mit leeren Ordnern ist.
//
// Wir mutieren keine Node-Refs — neuer Tree wird produziert, bestehender bleibt
// unangetastet. Damit ist die Funktion idempotent und für React-Memoization fit.

export function filterTree(nodes: FsTreeNode[], query: string): FsTreeNode[] {
  const trimmed = query.trim();
  if (trimmed === '') return nodes;
  const needle = trimmed.toLowerCase();
  const out: FsTreeNode[] = [];
  for (const node of nodes) {
    const filtered = filterNode(node, needle);
    if (filtered !== null) out.push(filtered);
  }
  return out;
}

function filterNode(node: FsTreeNode, needle: string): FsTreeNode | null {
  if (node.kind === 'file') {
    return matches(node.name, needle) ? node : null;
  }
  // Directory: rekursiv filtern. Wenn das Verzeichnis SELBST matcht, bleiben alle
  // Children sichtbar — das macht Filter wie „docs" intuitiv (User will den
  // ganzen docs-Ordner sehen, nicht nur Files namens „docs.md").
  const dirSelfMatches = matches(node.name, needle);
  const filteredChildren: FsTreeNode[] = [];
  for (const child of node.children ?? []) {
    if (dirSelfMatches) {
      filteredChildren.push(child);
    } else {
      const f = filterNode(child, needle);
      if (f !== null) filteredChildren.push(f);
    }
  }
  if (filteredChildren.length === 0 && !dirSelfMatches) return null;
  return { ...node, children: filteredChildren };
}

function matches(name: string, needle: string): boolean {
  return name.toLowerCase().includes(needle);
}
