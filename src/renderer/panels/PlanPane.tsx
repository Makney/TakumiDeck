import { useEffect, useMemo, useRef } from 'react';
import type { AppSettings } from '@shared/types';
import { useUsageStore } from '../stores/usage';
import { useSessionStore } from '../stores/sessions';
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
  const contextBySession = useUsageStore((s) => s.contextBySession);
  const refreshBars = useUsageStore((s) => s.refreshBars);
  const refreshContext = useUsageStore((s) => s.refreshContext);

  const activeId = useSessionStore((s) => s.activeId);
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
    // barIds-Wechsel ist Sprint-8-Settings-UI-Sache; Sprint 5 lädt einmal beim Mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-Session-Kontext-Bar für den aktiven Tab. Bei Tab-Wechsel re-fetchen.
  const contextLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId) return;
    if (contextLoadedFor.current === activeId) return;
    contextLoadedFor.current = activeId;
    void refreshContext(activeId);
  }, [activeId, refreshContext]);

  const activeContext = activeId ? contextBySession[activeId] ?? null : null;

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
            onOpenDetail={() => setDashboardDetailBar(bar.id)}
          />
        ))}
        {/* Per-Session-Kontext-Bar (Architektur 6.4): aktive Session vs. Per-Modell-Limit. */}
        {activeId && (
          <ContextBar
            session={activeContext}
            thresholds={settings.token_warning_thresholds}
          />
        )}
      </div>
    </section>
  );
}

interface ContextBarProps {
  session: ReturnType<typeof useUsageStore.getState>['contextBySession'][string] | null;
  thresholds: AppSettings['token_warning_thresholds'];
}

function ContextBar({ session, thresholds }: ContextBarProps) {
  if (!session) {
    return (
      <div className="td-usage-bar td-usage-bar-skeleton" aria-label="Aktueller Kontext">
        <div className="td-usage-bar-row">
          <span className="td-usage-bar-label">Aktueller Kontext</span>
          <span className="td-usage-bar-value">—</span>
        </div>
        <div className="td-usage-bar-track">
          <div className="td-usage-bar-fill" style={{ width: '0%' }} />
        </div>
      </div>
    );
  }
  const percent = Math.max(0, session.percent);
  const clamped = Math.min(percent, 100);
  const tone =
    percent >= thresholds.red
      ? 'red'
      : percent >= thresholds.orange
        ? 'orange'
        : percent >= thresholds.yellow
          ? 'yellow'
          : 'green';
  return (
    <div
      className={`td-usage-bar ${tone}`}
      title={`${session.tokens.total.toLocaleString()} / ${session.limit.toLocaleString()} Tokens · Modell: ${session.model ?? '—'}`}
    >
      <div className="td-usage-bar-row">
        <span className="td-usage-bar-label">
          Aktueller Kontext{session.model ? ` · ${session.model}` : ''}
        </span>
        <span className="td-usage-bar-value">
          {Math.round(session.tokens.total).toLocaleString()} /{' '}
          {Math.round(session.limit).toLocaleString()}
          <span className="td-usage-bar-percent"> · {percent.toFixed(0)} %</span>
        </span>
      </div>
      <div className="td-usage-bar-track">
        <div className="td-usage-bar-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
