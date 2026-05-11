import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, IpcResult } from '@shared/types';
import { TabContainer } from './panels/TabContainer';
import { HistoryPane } from './panels/HistoryPane';
import { LeftSidebar } from './panels/LeftSidebar';
import { EditorPane } from './panels/EditorPane';
import { RightStack } from './panels/RightStack';
import { PlanPane } from './panels/PlanPane';
import { StatsPane } from './panels/StatsPane';
import { TitleBar } from './panels/TitleBar';
import { UsageDetailModal } from './modals/UsageDetailModal';
import { SettingsModal } from './modals/SettingsModal';
import { HistoryActionModal } from './modals/HistoryActionModal';
import { useUsageStore } from './stores/usage';
import { useProjectStore } from './stores/projects';
import { useUiStore } from './stores/ui';
import { useFileTabsStore } from './stores/fileTabs';

// Renderer-Layout — 4-Spalten-Grid nach docs/design/claude-export/styles.css
// (.td-main, Zeilen 122-195). Die ursprüngliche Sprint-7-Variante mit Editor
// im 232 px-Right-Pane war visuell zu eng; User-Feedback nach Phase-4-Test
// hat auf das Design-Vorlage-Layout zurückgeführt.
//
//   ┌────────┬──────────┬──────────┬─────────┐
//   │ Left   │ Terminal │ Editor / │ Files   │
//   │Sidebar │ (TabCont)│ Diff     │   +     │
//   │ 240 px │  1 fr    │ 1 fr     │ Notes   │
//   │        ├──────────┼──────────┤ 232 px  │
//   │ (full) │ Stats    │ PlanPane │ (full)  │
//   │        │ 300 px   │ 300 px   │         │
//   └────────┴──────────┴──────────┴─────────┘

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dashboardDetailBarId = useUiStore((s) => s.dashboardDetailBarId);
  const setDashboardDetailBar = useUiStore((s) => s.setDashboardDetailBar);
  const mainView = useUiStore((s) => s.mainView);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const usageBars = useUsageStore((s) => s.bars);
  const projects = useProjectStore((s) => s.projects);
  const hydrateFileTabs = useFileTabsStore((s) => s.hydrateFromStorage);
  const fileTabsHydrateRef = useRef(false);
  const showSettingsModal = useUiStore((s) => s.showSettingsModal);
  const setShowSettingsModal = useUiStore((s) => s.setShowSettingsModal);
  // Sprint 9 (C2) — Toast-Slot, statisch im MVP (kein automatischer Trigger).
  // Phase 2 ruft useUiStore.getState().flashToast(msg) aus relevanten Stellen.
  const toastMessage = useUiStore((s) => s.toastMessage);
  // Sprint 9 — Sidebar-Verlauf-Klick öffnet das Action-Modal (Resume/
  // Archivieren/Verlauf öffnen) statt direkt die HistoryPane zu wechseln.
  const historyActionEntry = useUiStore((s) => s.historyActionEntry);
  const setHistoryActionEntry = useUiStore((s) => s.setHistoryActionEntry);
  const activeProject = useMemo(
    () =>
      activeProjectId ? projects.find((p) => p.id === activeProjectId) ?? null : null,
    [projects, activeProjectId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [versionRes, settingsRes] = await Promise.all([
        window.api.app.getVersion(),
        window.api.settings.get(),
      ]);
      if (cancelled) return;
      handle(versionRes, setVersion);
      handle(settingsRes, setSettings);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  // Sprint-8-Hydrate: Datei-Tab-Stack aus localStorage rekonstruieren. Idempotent
  // via useRef-Guard (StrictMode-Pattern), damit der zweite Mount im Dev-Mode den
  // Hydrate nicht doppelt triggert (Hydrate selbst ist auch idempotent, aber der
  // Ref macht's billig sichtbar).
  useEffect(() => {
    if (fileTabsHydrateRef.current) return;
    fileTabsHydrateRef.current = true;
    hydrateFileTabs();
  }, [hydrateFileTabs]);

  // Sprint 8 — globale Ctrl+K-Bindung für den Settings-Dialog (Architektur 6.0.2).
  // Browser-Default für Ctrl+K (URL-Bar fokussieren) gibt's in Electron nicht,
  // wir können den Shortcut frei greifen.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      if (e.key !== 'k' && e.key !== 'K') return;
      e.preventDefault();
      setShowSettingsModal(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setShowSettingsModal]);

  const detailBar = useMemo(() => {
    if (!settings || !dashboardDetailBarId) return null;
    return settings.limit_bars.find((b) => b.id === dashboardDetailBarId) ?? null;
  }, [settings, dashboardDetailBarId]);

  if (error) {
    return (
      <div className="td-bootstrap">
        <h1>TakumiDeck</h1>
        <pre>Fehler: {error}</pre>
      </div>
    );
  }

  if (!settings || !version) {
    return (
      <div className="td-bootstrap">
        <h1>TakumiDeck</h1>
        <div className="td-meta">lädt…</div>
      </div>
    );
  }

  return (
    <div className="td-app">
      <TitleBar version={version} />
      <main className="td-main">
        {/* Spalte 1: LeftSidebar, full-height */}
        <div className="td-col-left">
          <LeftSidebar settings={settings} />
        </div>

        {/* Spalte 2 oben: Terminal-Tabs (oder HistoryPane bei mainView=history).
            Sprint-3-Variante-A: alle xterm dauerhaft mounted, CSS-Toggle für die
            Sichtbarkeit. HistoryPane mountet/unmountet (read-only IPC, billig). */}
        <div className="td-col-mid-top">
          <div
            className="td-view-slot"
            style={{ display: mainView === 'terminals' ? 'flex' : 'none' }}
          >
            <TabContainer settings={settings} />
          </div>
          {mainView === 'history' && activeProject && (
            <div className="td-view-slot">
              <HistoryPane project={activeProject} settings={settings} />
            </div>
          )}
        </div>

        {/* Spalte 3 oben: Editor / Diff (ehemals RightPane-Top, jetzt eigene
            breite Spalte) */}
        <div className="td-col-right-top">
          <EditorPane />
        </div>

        {/* Spalte 2 unten: Stats (Sprint 5) */}
        <div className="td-col-mid-bottom">
          <StatsPane />
        </div>

        {/* Spalte 3 unten: PlanPane (von der Mitte-unten umgezogen, weil das
            Design-Layout PlanPane unter dem Editor zeichnet) */}
        <div className="td-col-right-bottom">
          <PlanPane settings={settings} />
        </div>

        {/* Spalte 4: Files + Notes als schmaler Stack, full-height */}
        <RightStack />
      </main>
      {detailBar && (
        <UsageDetailModal
          bar={detailBar}
          result={usageBars[detailBar.id] ?? null}
          onClose={() => setDashboardDetailBar(null)}
        />
      )}
      {showSettingsModal && (
        <SettingsModal
          initialSettings={settings}
          appVersion={version}
          onSettingsUpdated={(next) => setSettings(next)}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
      {historyActionEntry && (
        <HistoryActionModal
          entry={historyActionEntry}
          defaultModel={settings?.default_model ?? null}
          onClose={() => setHistoryActionEntry(null)}
        />
      )}
      {/* Sprint 9 (C2) — Toast-Render (Vorlage app.jsx 365-369). */}
      {toastMessage && (
        <div className="td-toast" role="status" aria-live="polite">
          <span aria-hidden style={{ color: 'var(--td-accent)' }}>●</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );

  function handle<T>(res: IpcResult<T>, setter: (v: T) => void): void {
    if (res.ok) setter(res.data);
    else setError(res.error);
  }
}
