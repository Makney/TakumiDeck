import type { FsTreeNode } from '@shared/types';

// Pure-Logik: Tree-Filter für den Datei-Browser (Sprint 7, Phase 5, Q2 Variante B).
//
// Q2 Variante B: alle Files anzeigen, Filter-Suchfeld vorbelegt mit „.md".
// Der User sieht beim Öffnen .md-Files, kann aber den Filter leeren oder
// auf eine andere Endung wechseln, ohne dass der Browser hartcoded wäre.
//
// Phase-2 Season-29.5: zusaetzlicher Endungs-Filter ueber Toggle-Pillen. Wenn
// `extensions` nicht leer ist, muss eine File-Endung in der Menge liegen,
// damit der File durchgelassen wird. Mehrere Endungen wirken als OR. Endungs-
// und Text-Filter werden mit AND kombiniert (Datei muss beides erfuellen).
//
// Filter-Verhalten (Standard-Tree-Filter-UX):
//   - Leerer Query + leere extensions → Tree unverändert (gleiche Ref).
//   - Non-leerer Query → behalten:
//       (a) Files, deren Name den Query (case-insensitive) enthält.
//       (b) Verzeichnisse, die mindestens einen passenden Nachfahren enthalten.
//   - Verzeichnisse OHNE matchenden Nachfahren werden komplett weggeschnitten,
//     damit der Browser nicht voll mit leeren Ordnern ist.
//
// Wir mutieren keine Node-Refs — neuer Tree wird produziert, bestehender bleibt
// unangetastet. Damit ist die Funktion idempotent und für React-Memoization fit.

export function filterTree(
  nodes: FsTreeNode[],
  query: string,
  extensions: ReadonlySet<string> = EMPTY_SET,
): FsTreeNode[] {
  const trimmed = query.trim();
  if (trimmed === '' && extensions.size === 0) return nodes;
  const needle = trimmed.toLowerCase();
  // Endungen werden case-insensitive verglichen; der Aufrufer kann sie in
  // beliebiger Casing reinreichen.
  const exts = extensions.size === 0 ? null : normalizeExtensions(extensions);
  const out: FsTreeNode[] = [];
  for (const node of nodes) {
    const filtered = filterNode(node, needle, exts);
    if (filtered !== null) out.push(filtered);
  }
  return out;
}

function filterNode(
  node: FsTreeNode,
  needle: string,
  exts: ReadonlySet<string> | null,
): FsTreeNode | null {
  if (node.kind === 'file') {
    if (exts !== null && !matchesExtension(node.name, exts)) return null;
    if (needle === '') return node;
    return matches(node.name, needle) ? node : null;
  }
  // Directory: rekursiv filtern. Wenn das Verzeichnis SELBST matcht, bleiben alle
  // Children sichtbar — das macht Filter wie „docs" intuitiv (User will den
  // ganzen docs-Ordner sehen, nicht nur Files namens „docs.md"). Endungs-Filter
  // wirkt aber weiterhin: ein Pillen-Filter `.md` und Query „docs" zeigt im
  // docs-Ordner nur .md-Files, nicht auch die .ts-Files.
  const dirSelfMatches = needle !== '' && matches(node.name, needle);
  const filteredChildren: FsTreeNode[] = [];
  for (const child of node.children ?? []) {
    if (dirSelfMatches) {
      // Dir-Self-Match: Query-Treffer am Ordner selbst zieht alle Children
      // mit, aber der Endungs-Filter bleibt strikt — sonst hebelt ein
      // Query-Match das File-Type-Toggle aus.
      if (child.kind === 'file' && exts !== null && !matchesExtension(child.name, exts)) {
        continue;
      }
      filteredChildren.push(child);
    } else {
      const f = filterNode(child, needle, exts);
      if (f !== null) filteredChildren.push(f);
    }
  }
  if (filteredChildren.length === 0 && !dirSelfMatches) return null;
  return { ...node, children: filteredChildren };
}

function matches(name: string, needle: string): boolean {
  return name.toLowerCase().includes(needle);
}

function matchesExtension(name: string, exts: ReadonlySet<string>): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  // Files ohne Endung (z.B. „LICENSE", „Makefile") fliegen bei aktivem
  // Endungs-Filter raus — sie haben keinen Endungs-Match.
  if (dot < 0) return false;
  return exts.has(lower.slice(dot));
}

function normalizeExtensions(extensions: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of extensions) {
    const lower = raw.toLowerCase();
    out.add(lower.startsWith('.') ? lower : `.${lower}`);
  }
  return out;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
