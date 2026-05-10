import { useState } from 'react';
import { useUsageStore } from '../stores/usage';
import { useSessionStore } from '../stores/sessions';
import { fmtTokens } from '../components/fmtTokens';

// StatsPane (Sprint 5 Skeleton, Architektur Roadmap PHASE1.md).
//
// Toggle „Übersicht" / „Modelle" unter dem Terminal-Bereich. Im MVP:
// - „Übersicht": 3-4 Mini-Token-Stats — aktuelle Session, heute, diese Woche.
// - „Modelle": Hinweis-Pille „In Phase 2 verfügbar".
// Volle Heatmap und Per-Modell-Stats-Cards folgen mit Phase 2.
//
// Sprint 9 (C4): Range-Toggle „Alle / 30d / 7d" als UI-Slot vorbereitet
// (components.jsx 330-334). Lokaler State `range` ist da, aber die Mini-Stats
// filtern noch nicht — in Phase 2 wird der `range`-Wert an die Token-
// Aggregation durchgereicht (heatmap.ts + usage:bucket-Filter).

type View = 'overview' | 'models';
type Range = 'all' | '30d' | '7d';

const RANGE_LABELS: Record<Range, string> = {
  all: 'Alle',
  '30d': '30d',
  '7d': '7d',
};

export function StatsPane() {
  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState<Range>('all');
  return (
    <section className="td-dash-pane" aria-label="Statistik">
      <header className="td-dash-head">
        <div className="td-dash-tabs">
          <button
            type="button"
            className={`td-dash-tab ${view === 'overview' ? 'active' : ''}`}
            onClick={() => setView('overview')}
          >
            Übersicht
          </button>
          <button
            type="button"
            className={`td-dash-tab ${view === 'models' ? 'active' : ''}`}
            onClick={() => setView('models')}
          >
            Modelle
          </button>
        </div>
        {/* Sprint 9 (C4) — Range-Toggle, statisch im MVP. Phase 2 reicht
            den Wert an die Token-Aggregation durch. */}
        <div className="td-dash-range" role="group" aria-label="Zeitraum">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? 'active' : ''}
              onClick={() => setRange(r)}
              title="Filter ist Phase-2-Slot"
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </header>
      <div className="td-dash-body">
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
    <div className="td-ueb-stats">
      {/* Sprint 9 (L5) — Werte mit `fmtTokens` (k/M/G), Vorlage-Code
          components.jsx 13-17. Vermeidet 9-stellige Zahlen, die das
          Card-Layout pressen. */}
      <Stat
        label="Aktuelle Session"
        value={activeContext ? `${fmtTokens(activeContext.tokens.total)} Tokens` : '—'}
        sub={activeContext?.model ?? null}
      />
      <Stat
        label="Letzte 5 h"
        value={fiveHour ? `${fmtTokens(fiveHour.tokens)} Tokens` : '—'}
        sub={fiveHour ? `${fiveHour.percent.toFixed(0)} % Limit` : null}
      />
      <Stat
        label="Letzte 168 h"
        value={weekly ? `${fmtTokens(weekly.tokens)} Tokens` : '—'}
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
    <div className="td-stat">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
