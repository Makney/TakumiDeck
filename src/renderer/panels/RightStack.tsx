import { useMemo } from 'react';
import { useSessionStore } from '../stores/sessions';
import { useUiStore } from '../stores/ui';
import { useFileTabsStore, type FileTab } from '../stores/fileTabs';
import { NotesPanel } from '../components/NotesPanel';
import { RightPaneFilesPanel } from './RightPaneFilesPanel';

// RightStack (Sprint 7, post-User-Feedback Layout-Umstellung).
//
// Schmaler 232 px-Stack ganz rechts (4. Spalte des Grids), full-height,
// zwei Sektionen vertikal:
//   - Files (top, ~55 % der Höhe) — Datei-Browser mit Filter (Phase 5)
//   - Notes (bottom, ~45 %) — aus Sprint-3-NotesFooter migriert (Q8 Variante A)
//
// Ersetzt die ursprüngliche RightPane.tsx, die Editor + Files + Notes alle
// in einem Stack hatte. Editor wandert ins eigene EditorPane (3. Spalte des
// Grids), wie es die Design-Vorlage (claude-export/app.jsx) zeichnet.

const EMPTY_TAB_ARRAY: ReadonlyArray<FileTab> = [];
const EMPTY_SET: Set<string> = new Set();

export function RightStack() {
  const activeSessionId = useSessionStore((s) => s.activeId);
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  // Stable EMPTY-Refs im Selector — ohne diese würde Zustand bei jedem
  // Render eine neue [] zurückgeben und einen infinite-loop triggern
  // (siehe Memory: zustand-selector-stable-ref).
  const tabsForActiveProject = useFileTabsStore((s) =>
    activeProjectId ? s.tabs[activeProjectId] ?? EMPTY_TAB_ARRAY : EMPTY_TAB_ARRAY,
  );
  const openFile = useFileTabsStore((s) => s.openFile);

  // dirtyRelPaths: Set wird im Body via useMemo gebaut, NICHT im Selector
  // (sonst neue Ref pro Render → endless loop).
  const dirtyRelPaths = useMemo(() => {
    if (tabsForActiveProject.length === 0) return EMPTY_SET;
    const out = new Set<string>();
    for (const t of tabsForActiveProject) {
      if (t.kind === 'file' && t.dirty && t.relPath !== null) out.add(t.relPath);
    }
    return out.size === 0 ? EMPTY_SET : out;
  }, [tabsForActiveProject]);

  return (
    <aside className="td-right-stack">
      <RightPaneFilesPanel
        projectId={activeProjectId}
        dirtyRelPaths={dirtyRelPaths}
        onOpenFile={(relPath, label) => {
          if (!activeProjectId) return;
          void openFile(activeProjectId, relPath, label);
        }}
      />
      <NotesPanel sessionId={activeSessionId} />
    </aside>
  );
}
