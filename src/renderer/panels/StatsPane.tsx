import { useState } from 'react';
import { useUsageStore } from '../stores/usage';
import { useSessionStore } from '../stores/sessions';

// StatsPane (Sprint 5 Skeleton, Architektur Roadmap PHASE1.md).
//
// Toggle „Übersicht" / „Modelle" unter dem Terminal-Bereich. Im MVP:
// - „Übersicht": 3-4 Mini-Token-Stats — aktuelle Session, heute, diese Woche.
// - „Modelle": Hinweis-Pille „In Phase 2 verfügbar".
// Volle Heatmap und Per-Modell-Stats-Cards folgen mit Phase 2.

type View = 'overview' | 'models';

export function StatsPane() {
  const [view, setView] = useState<View>('overview');
  return (
    <section className="td-stats-pane" aria-label="Statistik">
      <header className="td-stats-pane-header">
        <div className="td-stats-toggle">
          <button
            type="button"
            className={`td-pill ${view === 'overview' ? 'active' : ''}`}
            onClick={() => setView('overview')}
          >
            Übersicht
          </button>
          <button
            type="button"
            className={`td-pill ${view === 'models' ? 'active' : ''}`}
            onClick={() => setView('models')}
          >
            Modelle
          </button>
        </div>
      </header>
      <div className="td-stats-pane-body">
        {view === 'overview' ? <OverviewView /> : <ModelsPlaceholder />}
      </div>
    </section>
  );
}

function OverviewView() {
  const activeId = useSessionStore((s) => s.activeId);
  const contextBySession = useUsageStore((s) => s.contextBySession);
  const bars = useUsageStore((s) => s.bars);

  const activeContext = activeId ? contextBySession[activeId] ?? null : null;
  // Sprint-5-Mini-Stats: wir greifen die bereits berechneten Bars wieder,
  // statt eigene Aggregationen zu fahren.
  const fiveHour = bars['5h'] ?? null;
  const weekly = bars['weekly_all'] ?? null;

  return (
    <div className="td-stats-grid">
      <Stat
        label="Aktuelle Session"
        value={
          activeContext
            ? `${Math.round(activeContext.tokens.total).toLocaleString()} Tokens`
            : '—'
        }
        sub={activeContext?.model ?? null}
      />
      <Stat
        label="Letzte 5 h"
        value={fiveHour ? `${Math.round(fiveHour.tokens).toLocaleString()} Tokens` : '—'}
        sub={fiveHour ? `${fiveHour.percent.toFixed(0)} % Limit` : null}
      />
      <Stat
        label="Letzte 168 h"
        value={weekly ? `${Math.round(weekly.tokens).toLocaleString()} Tokens` : '—'}
        sub={weekly ? `${weekly.percent.toFixed(0)} % Limit` : null}
      />
    </div>
  );
}

function ModelsPlaceholder() {
  return (
    <div className="td-stats-placeholder">
      <p>In Phase 2 verfügbar</p>
      <p className="td-stats-placeholder-meta">
        Heatmap, Per-Modell-Karten, Modell-Wechsel-Detection — Phase 2 (siehe Architektur 8).
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <div className="td-stats-card">
      <div className="td-stats-card-label">{label}</div>
      <div className="td-stats-card-value">{value}</div>
      {sub && <div className="td-stats-card-sub">{sub}</div>}
    </div>
  );
}
