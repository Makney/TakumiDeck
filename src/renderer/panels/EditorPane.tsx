import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../stores/ui';
import { useFileTabsStore, type FileTab } from '../stores/fileTabs';
import { useSessionStore } from '../stores/sessions';
import { MarkdownEditor, type MarkdownEditorLayout } from '../components/MarkdownEditor';
import { buildQuickAccessList } from '../components/quickAccess';
import { DiffViewer } from '../components/DiffViewer';
import { useGitStatusStore, EMPTY_GIT_STATUS_ENTRY } from '../stores/gitStatus';
import type { AppSettings } from '@shared/types';

// EditorPane (Sprint 7, post-User-Feedback Layout-Umstellung).
//
// Lebt jetzt als EIGENE breite Spalte im 4-Spalten-Grid (oberes 1fr-Slot,
// dritte Spalte). Das ursprüngliche Briefing hatte den Editor in den 232px-
// Right-Pane gesteckt — visuell zu eng. User-Feedback: „in der Vorlage sieht
// es besser aus" → wir folgen dem Design-Handoff-Layout (4 Spalten, Editor +
// Diff in eigener breiter Spalte, Files + Notes als schmaler 232px-Stack
// ganz rechts).
//
// Phase-4-Inhalt unverändert:
//   - Datei-Tab-Stack pro Projekt (useFileTabsStore, Q6 Variante B)
//   - Schnellzugriff-Liste aus workbench.on_demand_files + Standards
//   - Eine MarkdownEditor-Instanz pro Tab (CSS-Toggle, Buffer überlebt
//     Tab-Wechsel — Sprint-3-xterm-Pattern)
// Phase 6: Diff-Tab via @codemirror/merge.unifiedMergeView pro Datei.

const EMPTY_TAB_ARRAY: ReadonlyArray<FileTab> = [];

interface EditorPaneProps {
  settings: AppSettings;
}

export function EditorPane({ settings }: EditorPaneProps) {
  const projectId = useUiStore((s) => s.activeProjectId);
  const frontmatter = useUiStore((s) => s.activeProjectFrontmatter);
  const initialLayout: MarkdownEditorLayout = settings.markdown_editor_layout;

  const tabs = useFileTabsStore((s) =>
    projectId ? s.tabs[projectId] ?? EMPTY_TAB_ARRAY : EMPTY_TAB_ARRAY,
  );
  const activeId = useFileTabsStore((s) =>
    projectId ? s.activeId[projectId] ?? null : null,
  );
  const openFile = useFileTabsStore((s) => s.openFile);
  const openDiffTab = useFileTabsStore((s) => s.openDiffTab);
  const closeTab = useFileTabsStore((s) => s.closeTab);
  const setActive = useFileTabsStore((s) => s.setActive);
  const setDirty = useFileTabsStore((s) => s.setDirty);
  const setSaved = useFileTabsStore((s) => s.setSaved);

  // Phase-2 Season-29: aktive Terminal-Session fuer den Session-Diff-Modus.
  // Wir filtern auf „Session gehoert zum aktiven Projekt", damit der Session-
  // Diff nicht versehentlich gegen ein fremdes Repo aufgeloest wird, wenn der
  // User zwischen Projekten zappt aber den Tab nicht wechselt.
  const activeSessionId = useSessionStore((s) => {
    if (!s.activeId || !projectId) return null;
    const tab = s.tabs.find((t) => t.sessionId === s.activeId);
    if (!tab || tab.projectId !== projectId) return null;
    return s.activeId;
  });

  const quickAccess = useMemo(() => buildQuickAccessList(frontmatter), [frontmatter]);

  // git:status nur laden, wenn der Diff-Tab offen UND aktiv ist.
  const diffTabOpen = tabs.some((t) => t.id === 'diff');
  const diffActive = activeId === 'diff';

  // Phase-2 Season-29 (Auto-Refresh): pro fs:changed-Push erhoeht der Effect
  // unten den refreshKey. Diff + Editor reagieren ueber Dep-Listen.
  const [refreshKey, setRefreshKey] = useState(0);

  // Bereich-PANELS-Review 2.2: git:status kommt aus dem gemeinsamen Store, der
  // zentral fuers aktive Projekt laedt (App → useGitStatusSync). Damit faellt
  // der zweite, redundante Fetch weg, den EditorPane und RightPaneFilesPanel
  // bisher unabhaengig voneinander abgesetzt haben. Der Status bleibt fuer das
  // aktive Projekt dauerhaft geladen — der DiffViewer (unten per display-Toggle
  // gemountet, Review 2.4) bleibt damit zustandsstabil ueber Tab-Wechsel.
  const gitEntry = useGitStatusStore((s) =>
    projectId ? s.byProject[projectId] ?? EMPTY_GIT_STATUS_ENTRY : EMPTY_GIT_STATUS_ENTRY,
  );
  const { status, loading, loadError, hasGit } = gitEntry;

  const handleSave = useCallback(
    async (
      pid: string,
      tabId: string,
      relPath: string,
      content: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const result = await window.api.fs.write({ projectId: pid, relPath, content });
      if (!result.ok) return { ok: false, error: result.error };
      setSaved(pid, tabId, content);
      return { ok: true };
    },
    [setSaved],
  );

  // Phase-2 Season-29: Auto-Open-Pairing-Handler fuer den DiffViewer.
  // Wir oeffnen die Datei als Tab in der Stack, aktivieren sie aber NICHT —
  // der User bleibt auf der Diff-Pane. openFile aktiviert intern den neuen
  // Tab synchron; direkt danach setzen wir zurueck auf 'diff', damit der
  // Diff sichtbar bleibt. Der User kann den File-Tab dann jederzeit per Klick
  // in der Tab-Bar holen.
  const handleOpenInEditorFromDiff = useCallback(
    (relPath: string, label: string) => {
      if (!projectId) return;
      void openFile(projectId, relPath, label);
      setActive(projectId, 'diff');
    },
    [projectId, openFile, setActive],
  );

  // Phase-2 Season-29: aktives Projekt beim Datei-Watcher im Main hinterlegen.
  // Wechselt der User das Projekt, schaltet der Watcher den chokidar-Root um.
  useEffect(() => {
    void window.api.fs.setWatchedProject({ projectId });
  }, [projectId]);

  // Phase-2 Season-29: Auto-Open des Diff-Tabs beim Projekt-Wechsel, sofern
  // das Projekt ein Git-Repo ist. User-Beschwerde: „aktuell muss ich es
  // immer erst anklicken" — der Diff-Tab soll fuer Git-Projekte by default
  // sichtbar sein.
  //
  // Sentinel-Ref pro projectId: einmal pro Projekt-Visite triggern, damit
  // das Schliessen des Tabs den Auto-Open NICHT erneut ausloest. Hintergrund:
  // useGitStatus resettet hasGit auf true sobald enabled=false (Tab zu) wird,
  // wodurch die alten dep-getriggerten Effects in einer Endlosschleife immer
  // wieder aufmachten — der x-Button war damit effektiv tot.
  const autoOpenedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId) {
      autoOpenedForRef.current = null;
      return;
    }
    if (autoOpenedForRef.current === projectId) return;
    if (!hasGit) return;
    if (diffTabOpen) return;
    autoOpenedForRef.current = projectId;
    openDiffTab(projectId);
  }, [projectId, hasGit, diffTabOpen, openDiffTab]);

  // Phase-2 Season-29: Auto-Refresh fuer Editor + Diff. Wir subscribieren auf
  // den fs:changed-Push und reagieren in zwei Schritten:
  //   1. refreshKey hochzaehlen → DiffViewer + useGitStatus refetchen
  //   2. Pro Pfad: pruefen, ob ein File-Tab existiert und CLEAN ist; wenn ja,
  //      Content neu laden + setSaved aufrufen, sodass der MarkdownEditor den
  //      neuen Inhalt rendert. Dirty Tabs lassen wir bewusst in Ruhe — dort
  //      hat der User noch ungespeicherte Aenderungen, die nicht durch eine
  //      externe Modifikation ueberschrieben werden duerfen.
  // Auf den fileTabs-Store greifen wir via getState() zu, damit der Effect
  // nicht bei jedem Tab-State-Wechsel neu abonnieren muss.
  const refreshKeyRef = useRef(refreshKey);
  refreshKeyRef.current = refreshKey;
  useEffect(() => {
    const unsubscribe = window.api.fs.onChanged((event) => {
      // Stale Pushes aus einem laengst gewechselten Projekt verwerfen.
      if (event.projectId !== projectId) return;
      setRefreshKey((k) => k + 1);
      const tabsForProject = useFileTabsStore.getState().tabs[event.projectId] ?? [];
      for (const path of event.paths) {
        const tab = tabsForProject.find(
          (t): t is FileTab & { kind: 'file' } => t.kind === 'file' && t.relPath === path,
        );
        if (!tab) continue;
        if (tab.dirty) continue; // unsaved local edits gewinnen — kein Overwrite
        void window.api.fs
          .read({ projectId: event.projectId, relPath: path })
          .then((res) => {
            if (!res.ok) return;
            // Auf dem juengsten Tab-State pruefen, ob inzwischen dirty geworden
            // (User hat zwischen Push und fs:read eine Taste gedrueckt).
            const current = useFileTabsStore
              .getState()
              .tabs[event.projectId]?.find((t) => t.id === tab.id);
            if (!current || current.dirty) return;
            useFileTabsStore.getState().setSaved(event.projectId, tab.id, res.data.content);
          })
          // Bereich-PANELS-Review 2.1: hartes Reject (z.B. IPC-Kanal weg beim
          // Quit-Race) abfangen, damit der Auto-Reload-Pfad keine Unhandled-
          // Rejection wirft. Der Tab behaelt einfach seinen alten Inhalt.
          .catch((e) => {
            console.warn('[EditorPane] fs:read im Auto-Reload fehlgeschlagen', e);
          });
      }
    });
    return unsubscribe;
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="td-code">
        <div className="td-code-tabs td-code-tabs-empty" />
        <div className="td-code-body td-skeleton">
          Wähle links ein Projekt, um Dateien zu öffnen.
        </div>
      </div>
    );
  }

  const fileTabs = tabs.filter(
    (t): t is FileTab & { kind: 'file' } => t.kind === 'file',
  );

  return (
    <div className="td-code">
      <div className="td-code-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`td-code-tab${isActive ? ' active' : ''}`}
              onClick={() => setActive(projectId, tab.id)}
              title={tab.relPath ?? tab.label}
            >
              <span className={`td-tab-kind ${tab.kind === 'diff' ? 'diff' : 'md'}`}>
                {tab.kind === 'diff' ? 'Δ' : 'M'}
              </span>
              <span className="td-code-tab-label">{tab.label}</span>
              {tab.dirty && (
                <span className="td-code-tab-dirty" title="ungespeichert">
                  ●
                </span>
              )}
              <button
                type="button"
                className="td-tab-x"
                title="Tab schließen"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(projectId, tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="td-code-body">
        {tabs.length === 0 && (
          <QuickAccessEmpty
            entries={quickAccess}
            onOpenDiff={() => openDiffTab(projectId)}
            onPick={(relPath, label) => void openFile(projectId, relPath, label)}
          />
        )}
        {fileTabs.map((tab) => {
          const isActive = tab.id === activeId;
          if (tab.loading) {
            return (
              <div
                key={tab.id}
                className="td-code-pane"
                style={{ display: isActive ? 'flex' : 'none' }}
              >
                <div className="td-skeleton">Lade {tab.relPath}…</div>
              </div>
            );
          }
          if (tab.loadError !== null) {
            return (
              <div
                key={tab.id}
                className="td-code-pane"
                style={{ display: isActive ? 'flex' : 'none' }}
              >
                <div className="td-md-error">
                  Datei konnte nicht geladen werden: {tab.loadError}
                </div>
              </div>
            );
          }
          if (tab.savedContent === null) return null;
          const isClaudeMd = tab.relPath === 'CLAUDE.md';
          return (
            <div
              key={tab.id}
              className="td-code-pane"
              style={{ display: isActive ? 'flex' : 'none' }}
            >
              <FileTabEditor
                tab={tab}
                isClaudeMd={isClaudeMd}
                initialLayout={initialLayout}
                onDirtyChange={(dirty) => setDirty(projectId, tab.id, dirty)}
                onSave={(content) =>
                  handleSave(projectId, tab.id, tab.relPath ?? '', content)
                }
              />
            </div>
          );
        })}
        {/* Bereich-PANELS-Review 2.4: DiffViewer bleibt gemountet, solange der
            Diff-Tab offen ist, und wird nur per display-Toggle verborgen —
            analog zum File-Tab-Stack daruber. So ueberleben Mode-Auswahl,
            aktive Datei und CodeMirror-Scroll einen Tab-Wechsel. */}
        {diffTabOpen && (
          <div
            className="td-code-pane"
            style={{ display: diffActive ? 'flex' : 'none' }}
          >
            <DiffViewer
              projectId={projectId}
              status={status}
              loading={loading}
              loadError={loadError}
              hasGit={hasGit}
              activeSessionId={activeSessionId}
              refreshKey={refreshKey}
              onOpenInEditor={handleOpenInEditorFromDiff}
            />
          </div>
        )}
      </div>

      {/* Sprint 9 — QuickAccessFooter unter dem Editor entfernt: der
          rechte FilesPanel-Tree übernimmt die Schnellzugriff-Funktion.
          QuickAccessEmpty bleibt als Empty-State im Body, weil es ohne
          offene Tabs noch eine sinnvolle Anker-Liste rendert. */}
    </div>
  );
}

// ============================================================ Editor-Wrapper

interface FileTabEditorProps {
  tab: FileTab & { kind: 'file' };
  isClaudeMd: boolean;
  initialLayout: MarkdownEditorLayout;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function FileTabEditor({ tab, isClaudeMd, initialLayout, onDirtyChange, onSave }: FileTabEditorProps) {
  return (
    <MarkdownEditor
      filePath={tab.relPath ?? ''}
      initialContent={tab.savedContent ?? ''}
      isClaudeMd={isClaudeMd}
      initialLayout={initialLayout}
      onSave={onSave}
      onDirtyChange={onDirtyChange}
    />
  );
}

// ============================================================ Quick-Access

interface QuickAccessProps {
  entries: ReturnType<typeof buildQuickAccessList>;
  onPick: (relPath: string, label: string) => void;
}

interface QuickAccessEmptyProps extends QuickAccessProps {
  onOpenDiff: () => void;
}

function QuickAccessEmpty({ entries, onPick, onOpenDiff }: QuickAccessEmptyProps) {
  return (
    <div className="td-code-empty">
      <div className="td-code-empty-title">Schnellzugriff</div>
      <div className="td-code-empty-list">
        <button
          type="button"
          className="td-code-empty-item source-diff"
          onClick={onOpenDiff}
          title="Working-Tree-Diff öffnen"
        >
          <span className="td-tab-kind diff">Δ</span>
          <span className="td-code-empty-name">Diff</span>
          <span className="td-code-empty-path">git status · working tree</span>
        </button>
        {entries.map((entry) => (
          <button
            key={entry.relPath}
            type="button"
            className={`td-code-empty-item source-${entry.source}`}
            onClick={() => onPick(entry.relPath, entry.label)}
            title={entry.relPath}
          >
            <span className="td-tab-kind md">M</span>
            <span className="td-code-empty-name">{entry.label}</span>
            <span className="td-code-empty-path">{entry.relPath}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

