import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, IpcResult } from '@shared/types';
import { TabContainer } from './panels/TabContainer';
import { LeftSidebar } from './panels/LeftSidebar';
import { PlanPane } from './panels/PlanPane';
import { StatsPane } from './panels/StatsPane';
import { UsageDetailModal } from './modals/UsageDetailModal';
import { useUsageStore } from './stores/usage';
import { useUiStore } from './stores/ui';

// Renderer-Layout (Sprint 4 + Sprint-5-Bottom-Row):
//   Header
//   ├── LeftSidebar (240 px)  ┃  TabContainer (1 fr) — Tabs + Terminals + Notes
//   ───────────────────────────────────────────────────────────────────────────
//   StatsPane (1 fr) ┃ PlanPane (1 fr) — beide in der unteren Zeile (300 px)
//
// Architektur 4 zeichnet die untere Zeile mit Stats links + Plannutzung rechts.
// Right-Pane (Files + Notes) bleibt bis Sprint 7 ausgeblendet.

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dashboardDetailBarId = useUiStore((s) => s.dashboardDetailBarId);
  const setDashboardDetailBar = useUiStore((s) => s.setDashboardDetailBar);
  const usageBars = useUsageStore((s) => s.bars);

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
      <header className="td-app-header">
        <span className="td-app-title">TakumiDeck</span>
        <span className="td-app-meta">v{version} · Sprint 5 (Token-Dashboard)</span>
      </header>
      <main className="td-app-main">
        <LeftSidebar settings={settings} />
        <div className="td-app-content">
          <div className="td-app-row-top">
            <TabContainer settings={settings} />
          </div>
          <div className="td-app-row-bottom">
            <StatsPane />
            <PlanPane settings={settings} />
          </div>
        </div>
      </main>
      {detailBar && (
        <UsageDetailModal
          bar={detailBar}
          result={usageBars[detailBar.id] ?? null}
          onClose={() => setDashboardDetailBar(null)}
        />
      )}
    </div>
  );

  function handle<T>(res: IpcResult<T>, setter: (v: T) => void): void {
    if (res.ok) setter(res.data);
    else setError(res.error);
  }
}
