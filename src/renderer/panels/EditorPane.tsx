import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../stores/ui';
import { useFileTabsStore, type FileTab } from '../stores/fileTabs';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { buildQuickAccessList } from '../components/quickAccess';
import { DiffViewer } from '../components/DiffViewer';
import type { GitStatusResult } from '@shared/types';

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

export function EditorPane() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const frontmatter = useUiStore((s) => s.activeProjectFrontmatter);

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

  const quickAccess = useMemo(() => buildQuickAccessList(frontmatter), [frontmatter]);

  // git:status nur laden, wenn der Diff-Tab offen UND aktiv ist.
  const diffTabOpen = tabs.some((t) => t.id === 'diff');
  const diffActive = activeId === 'diff';
  const { status, loading, loadError, hasGit } = useGitStatus(
    projectId,
    diffTabOpen && diffActive,
  );

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
                onDirtyChange={(dirty) => setDirty(projectId, tab.id, dirty)}
                onSave={(content) =>
                  handleSave(projectId, tab.id, tab.relPath ?? '', content)
                }
              />
            </div>
          );
        })}
        {diffTabOpen && diffActive && (
          <div className="td-code-pane">
            <DiffViewer
              projectId={projectId}
              status={status}
              loading={loading}
              loadError={loadError}
              hasGit={hasGit}
            />
          </div>
        )}
      </div>

      {tabs.length > 0 && (
        <QuickAccessFooter
          entries={quickAccess}
          openIds={new Set(tabs.map((t) => t.id))}
          onPick={(relPath, label) => void openFile(projectId, relPath, label)}
          onOpenDiff={() => openDiffTab(projectId)}
        />
      )}
    </div>
  );
}

// ============================================================ Git-Status-Hook

interface GitStatusState {
  status: GitStatusResult | null;
  loading: boolean;
  loadError: string | null;
  hasGit: boolean;
}

function useGitStatus(projectId: string | null, enabled: boolean): GitStatusState {
  const [state, setState] = useState<GitStatusState>({
    status: null,
    loading: false,
    loadError: null,
    hasGit: true,
  });

  useEffect(() => {
    if (!projectId || !enabled) {
      setState({ status: null, loading: false, loadError: null, hasGit: true });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, loadError: null }));
    void window.api.git.status({ projectId }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ status: result.data, loading: false, loadError: null, hasGit: true });
      } else if (result.code === 'NOT_A_GIT_REPO') {
        setState({ status: null, loading: false, loadError: null, hasGit: false });
      } else {
        setState({
          status: null,
          loading: false,
          loadError: result.error,
          hasGit: true,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);

  return state;
}

// ============================================================ Editor-Wrapper

interface FileTabEditorProps {
  tab: FileTab & { kind: 'file' };
  isClaudeMd: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function FileTabEditor({ tab, isClaudeMd, onDirtyChange, onSave }: FileTabEditorProps) {
  return (
    <MarkdownEditor
      filePath={tab.relPath ?? ''}
      initialContent={tab.savedContent ?? ''}
      isClaudeMd={isClaudeMd}
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

interface QuickAccessFooterProps extends QuickAccessProps {
  openIds: Set<string>;
  onOpenDiff: () => void;
}

function QuickAccessFooter({
  entries,
  openIds,
  onPick,
  onOpenDiff,
}: QuickAccessFooterProps) {
  const remaining = entries.filter((e) => !openIds.has(`file:${e.relPath}`));
  const showDiffPill = !openIds.has('diff');
  if (remaining.length === 0 && !showDiffPill) return null;
  return (
    <div className="td-code-quick-foot">
      {showDiffPill && (
        <button
          type="button"
          className="td-code-quick-pill"
          onClick={onOpenDiff}
          title="Working-Tree-Diff öffnen"
        >
          Δ Diff
        </button>
      )}
      {remaining.map((entry) => (
        <button
          key={entry.relPath}
          type="button"
          className="td-code-quick-pill"
          onClick={() => onPick(entry.relPath, entry.label)}
          title={entry.relPath}
        >
          + {entry.label}
        </button>
      ))}
    </div>
  );
}
