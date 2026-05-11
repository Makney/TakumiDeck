import { useEffect, useMemo } from 'react';
import type { AppSettings } from '@shared/types';
import { useUsageStore } from '../stores/usage';
import { useUiStore } from '../stores/ui';
import { UsageBar } from '../components/UsageBar';

// PlanPane (Sprint 5, Architektur 6.4).
//
// Untere Zeile (LAYOUT.ROW_BOTTOM_HEIGHT = 300 px), immer sichtbar. Rendert eine
// UsageBar pro settings.limit_bars-Eintrag plus eine Per-Session-Kontext-Bar für
// den aktiven Tab. Klick auf eine Bar öffnet das UsageDetailModal (gesteuert via
// useUiStore.dashboardDetailBarId).

interface Props {
  settings: AppSettings;
}

export function PlanPane({ settings }: Props) {
  const bars = useUsageStore((s) => s.bars);
  const refreshBars = useUsageStore((s) => s.refreshBars);
  const refreshContext = useUsageStore((s) => s.refreshContext);

  const setDashboardDetailBar = useUiStore((s) => s.setDashboardDetailBar);

  // IDs der konfigurierten Bars — Memoized für stabile Effect-Deps. limit_bars
  // ist eine Settings-Liste; Sprint 8 bringt die UI dafür, Sprint 5 nimmt sie
  // unverändert hin.
  const barIds = useMemo(
    () => settings.limit_bars.map((b) => b.id),
    [settings.limit_bars],
  );

  // Initial-Load + Live-Push-Listener.
  //
  // KEIN useRef-Guard (Memory-Konvention: Guard nur bei Server-Side-Effect-IPCs
  // wie pty:create, fs:write, git:commit). usage:window/context sind read-only —
  // ein StrictMode-Doppel-Refresh ist harmlos. Wichtiger ist, dass der Listener
  // nach jedem Mount frisch registriert wird, sonst feuert der Push nach dem
  // ersten StrictMode-Cleanup ins Leere.
  //
  // Sprint 9 — die ContextBar (Per-Session-Kontext) lebt jetzt im Action-Bar-
  // ctx-Slot (C1, TabContainer.ContextSlot). Wir behalten den context-Listener
  // aber hier, weil PlanPane sowieso schon mountet und dafür sorgt, dass
  // refreshContext für alle aktiven Sessions weiterläuft. Das vermeidet einen
  // doppelten Listener im TabContainer und hält die Sprint-5-Pipeline intakt.
  //
  // Bereich-7-Review: `barIds` muss in den Deps stehen, damit ein Settings-UI-
  // Edit (limit_bars add/remove) den Listener-Fallback frisch capturet —
  // sonst feuert ein Push ohne explizite `event.barIds` weiterhin auf den
  // stale Initial-Snapshot. `barIds` ist via useMemo referenz-stabil, also
  // re-subscribed der Listener nur bei echten Settings-Wechseln.
  useEffect(() => {
    void refreshBars(barIds);
    const unsubscribe = window.api.usage.onUpdate((event) => {
      if (event.kind === 'global') {
        const targetIds = event.barIds && event.barIds.length > 0 ? event.barIds : barIds;
        void refreshBars(targetIds);
      } else if (event.kind === 'context' && event.sessionId) {
        void refreshContext(event.sessionId);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [barIds, refreshBars, refreshContext]);

  return (
    <section className="td-plan-pane" aria-label="Plannutzung">
      <header className="td-plan-pane-header">
        <span className="td-plan-pane-title">Plannutzung</span>
        <span className="td-plan-pane-meta">
          P90 · {settings.p90_window_hours} h Fenster
        </span>
      </header>
      <div className="td-plan-pane-body">
        {settings.limit_bars.map((bar) => (
          <UsageBar
            key={bar.id}
            result={bars[bar.id] ?? null}
            thresholds={settings.token_warning_thresholds}
            loading={!bars[bar.id]}
            resetSchedule={bar.reset_schedule}
            onOpenDetail={() => setDashboardDetailBar(bar.id)}
          />
        ))}
      </div>
    </section>
  );
}
