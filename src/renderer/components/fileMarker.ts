import type { GitFileStatus } from '@shared/types';

// Pure-Helper fuer den Datei-Browser-Marker (Phase-2 Season-29.5).
//
// Konflikt-Regel: Editor-Dirty (lokale, ungespeicherte Edits am File-Tab)
// schlaegt Git-Status. Begruendung: wenn der User aktiv im Editor an einem
// File arbeitet, ist die Dirty-Info aktueller und persoenlicher als der
// Git-Snapshot — und der gleiche `M`-Slot zwei Wahrheiten darzustellen ware
// im 232-px-Stack visuell nicht zu trennen. Sobald der User speichert, ist
// die Dirty-Flag weg und der Git-Marker uebernimmt.
//
// Renames werden bewusst als `R` separat angezeigt (zusaetzlich zum
// Modified-Slot), damit ein git mv im Browser sichtbar wird.

export interface FileMarker {
  // Sichtbares Zeichen in der Marker-Pille (1 Zeichen typischerweise).
  label: string;
  // CSS-Modifier in `.td-file-mark-{kind}` — steuert die Farb-Tonung. Wir
  // mappen Git-Status auf vier visuelle Buckets: dirty/modified, added,
  // deleted, info (Renames, Unmerged, Copy etc.). Mehr Bucket-Splits
  // brauchen wir im Daily-Use nicht.
  kind: 'dirty' | 'added' | 'deleted' | 'info';
  // Tooltip / aria-label fuer Screen-Reader. Lang ausformuliert, weil das
  // sichtbare Label nur ein Zeichen ist.
  title: string;
}

export function pickFileMarker(
  isDirty: boolean,
  gitStatus: GitFileStatus | null,
): FileMarker | null {
  if (isDirty) {
    return {
      label: 'M',
      kind: 'dirty',
      title: 'Ungespeicherte Aenderungen im Editor',
    };
  }
  if (gitStatus === null || gitStatus === 'unchanged') return null;
  switch (gitStatus) {
    case 'modified':
      return {
        label: 'M',
        kind: 'dirty',
        title: 'Datei im Working-Tree veraendert',
      };
    case 'added':
      return {
        label: 'A',
        kind: 'added',
        title: 'Neue Datei (gestaged)',
      };
    case 'untracked':
      return {
        label: 'A',
        kind: 'added',
        title: 'Neue Datei (untracked)',
      };
    case 'deleted':
      return {
        label: 'D',
        kind: 'deleted',
        title: 'Datei geloescht',
      };
    case 'renamed':
      return {
        label: 'R',
        kind: 'info',
        title: 'Datei umbenannt',
      };
    case 'copied':
      return {
        label: 'C',
        kind: 'info',
        title: 'Datei kopiert',
      };
    case 'unmerged':
      return {
        label: 'U',
        kind: 'info',
        title: 'Merge-Konflikt',
      };
    default:
      // TypeScript-Exhaustiveness: dieser Pfad sollte nie greifen, aber wir
      // bleiben defensiv (neuer Status aus simple-git ohne Code-Update darf
      // den Renderer nicht killen).
      return null;
  }
}
