import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../stores/ui';
import { useStatsStore, type StatsScope } from '../stores/stats';
import type { StatsOverviewResult, StatsRange } from '@shared/types';
import { fmtTokens } from '../components/fmtTokens';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { ModelsView } from '../components/ModelsView';
import { prettyModelId } from '../components/prettyModelId';
import {
  computeEasterEggComparisons,
  formatEasterEggFactor,
} from '@shared/easter-egg-works';

// StatsPane (Phase-2 Season-12 + Season-13 + Season-14).
//
// Übersicht-View: acht Aggregat-Karten (Volumen + Verhalten) aus dem Main-
// Aggregat (stats:project-overview) plus die GitHub-Style Aktivitaets-
// Heatmap (Season 13). Layout: Cards als 2×4-Block links, Heatmap fuellt
// die rechte Haelfte. Im Header drei Toggle-Gruppen: View (Übersicht/
// Modelle), Scope (Aktiv/Global), Range (Alle/30d/7d). Range wirkt nur
// auf die Cards — die Heatmap hat ihren eigenen 30W/52W-Toggle in der
// Heatmap-Komponente, weil ein 7d-Range-Cut die Heatmap zertruemmern
// wuerde.
//
// Modelle-View (Season 14): Per-Modell-Aufschluesselung mit Token-Anteil-
// Bars + Detail-Tabelle. Verwendet Scope+Range vom geteilten Header-Toggle,
// kein eigener Filter.

type View = 'overview' | 'models';

const RANGE_LABELS: Record<StatsRange, string> = {
  all: 'Alle',
  '30d': '30d',
  '7d': '7d',
};

const SCOPE_LABELS: Record<StatsScope, string> = {
  project: 'Aktiv',
  global: 'Global',
};

export function StatsPane({
  easterEggEnabled,
}: {
  // Phase-2 Season-19: Toggle aus settings.easter_egg_enabled. Steuert
  // ausschliesslich den Streifen unter der Heatmap in der Uebersicht-
  // View — die Modelle-View bleibt davon unberuehrt.
  easterEggEnabled: boolean;
}) {
  const [view, setView] = useState<View>('overview');
  const scope = useStatsStore((s) => s.scope);
  const range = useStatsStore((s) => s.range);
  const setScope = useStatsStore((s) => s.setScope);
  const setRange = useStatsStore((s) => s.setRange);

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
        <div className="td-dash-scope" role="group" aria-label="Sichtbereich">
          {(Object.keys(SCOPE_LABELS) as StatsScope[]).map((s) => (
            <button
              key={s}
              type="button"
              className={scope === s ? 'active' : ''}
              onClick={() => setScope(s)}
              title={s === 'project' ? 'Nur aktives Projekt' : 'Über alle Projekte'}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="td-dash-range" role="group" aria-label="Zeitraum">
          {(Object.keys(RANGE_LABELS) as StatsRange[]).map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? 'active' : ''}
              onClick={() => setRange(r)}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </header>
      <div className="td-dash-body">
        {view === 'overview' ? (
          <OverviewView easterEggEnabled={easterEggEnabled} />
        ) : (
          <ModelsView />
        )}
      </div>
    </section>
  );
}

function OverviewView({ easterEggEnabled }: { easterEggEnabled: boolean }) {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const scope = useStatsStore((s) => s.scope);
  const range = useStatsStore((s) => s.range);
  const heatmapWeeks = useStatsStore((s) => s.heatmapWeeks);
  const setHeatmapWeeks = useStatsStore((s) => s.setHeatmapWeeks);
  const overview = useStatsStore((s) => s.overview);
  const heatmap = useStatsStore((s) => s.heatmap);
  const error = useStatsStore((s) => s.error);
  const heatmapError = useStatsStore((s) => s.heatmapError);
  const refresh = useStatsStore((s) => s.refresh);
  const refreshHeatmap = useStatsStore((s) => s.refreshHeatmap);
  // Debounce-Handle fuer den usage:update-Listener: das Watcher-Event feuert
  // potenziell mehrfach pro Sekunde (Sprint 5: Coalesced auf max. 2/s, aber
  // wir wollen nicht jeden Token-Tick aggregieren). 600 ms reichen, damit
  // typische Tipp-Cadences zusammengefasst werden, ohne dass der User die
  // Verzoegerung spuert. Cards und Heatmap teilen sich den Timer — beide
  // gehen nach demselben Watcher-Tick raus, ein Round-Trip ist effizient
  // genug.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void refresh(activeProjectId);
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refresh, activeProjectId, scope, range]);

  // Heatmap-Refresh laeuft auf eigenem Effekt mit den Heatmap-spezifischen
  // Abhaengigkeiten (Wochen), damit ein Range-Wechsel auf die Cards die
  // Heatmap nicht unnoetig nachzieht — sie ignoriert Range ohnehin.
  useEffect(() => {
    void refreshHeatmap(activeProjectId);
  }, [refreshHeatmap, activeProjectId, scope, heatmapWeeks]);

  useEffect(() => {
    const unsubscribe = window.api.usage.onUpdate(() => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void refresh(activeProjectId);
        void refreshHeatmap(activeProjectId);
      }, 600);
    });
    return () => unsubscribe();
  }, [refresh, refreshHeatmap, activeProjectId]);

  if (error) {
    return (
      <div className="td-stats-placeholder">
        <p>Stats konnten nicht geladen werden</p>
        <p className="td-stats-placeholder-meta">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="td-overview-split">
        <div className="td-stats-cards td-stats-cards-compact">
          <Stat label="Sitzungen" value={overview ? String(overview.sessions_total) : '—'} />
          <Stat
            label="Nachrichten"
            value={overview ? formatCount(overview.messages_total) : '—'}
          />
          <Stat
            label="Tokens"
            value={overview ? fmtTokens(overview.tokens_total) : '—'}
          />
          <Stat
            label="Aktive Tage"
            value={overview ? String(overview.active_days) : '—'}
          />
          <Stat
            label="Streak"
            value={overview ? `${overview.current_streak_days} Tg` : '—'}
            sub={overview && overview.current_streak_days > 0 ? 'in Folge' : null}
            accent={overview ? overview.current_streak_days > 0 : false}
          />
          <Stat
            label="Längste Streak"
            value={overview ? `${overview.longest_streak_days} Tg` : '—'}
          />
          <Stat
            label="Spitzenstunde"
            value={overview ? formatHour(overview.peak_hour) : '—'}
            sub={overview && overview.peak_hour !== null ? `${overview.peak_hour_count}×` : null}
          />
          <Stat
            label="Lieblingsmodell"
            value={overview ? formatFavoriteModel(overview) : '—'}
            sub={
              overview && overview.favorite_model
                ? `${overview.favorite_model_count} Msgs`
                : null
            }
          />
        </div>
        <ActivityHeatmap
          data={heatmap}
          weeks={heatmapWeeks}
          onWeeksChange={setHeatmapWeeks}
          error={heatmapError}
        />
      </div>
      {easterEggEnabled && overview && (
        <EasterEggStrip tokensTotal={overview.tokens_total} />
      )}
    </>
  );
}

// Phase-2 Season-19: Easter-Egg-Streifen unter der Heatmap. Rendert sich
// selbst NULL, wenn computeEasterEggComparisons keine Treffer liefert
// (z.B. tokensTotal=0 beim ersten Start oder factor < 0.1 fuer alle
// Werke). Pure Render — kein Effekt, kein Listener; der Refresh laeuft
// ueber den `usage:update`-Push-Pfad des Parents (overview.tokens_total
// aendert sich → Komponente rendert neu).
function EasterEggStrip({ tokensTotal }: { tokensTotal: number }) {
  const comparisons = useMemo(
    () => computeEasterEggComparisons(tokensTotal),
    [tokensTotal],
  );
  if (comparisons.length === 0) return null;

  // Sprach-Fluss: 1 Werk → „A geschrieben", 2 Werke → „A und B
  // geschrieben", 3+ → „A, B und C geschrieben". Faktor + Werk in
  // einem <span class="factor"> gebuendelt fuer die tabular-nums-
  // Tonung im CSS.
  const parts = comparisons.map((c, idx) => {
    const sep =
      idx === 0
        ? ''
        : idx === comparisons.length - 1
          ? ' und '
          : ', ';
    return (
      <span key={c.work.name}>
        {sep}
        <span className="factor">{formatEasterEggFactor(c.factor)}</span>{' '}
        {c.work.name}
      </span>
    );
  });

  return (
    <div className="td-easter-egg-strip" title="Spielerischer Vergleich — Werk-Token-Counts sind grobe Schaetzungen">
      📚 Du hast etwa {parts} geschrieben.
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string | null;
  accent?: boolean;
}) {
  return (
    <div className="td-stat">
      <div className="lbl">{label}</div>
      <div className={`val${accent ? ' accent' : ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// Nachrichten-Count bekommt eigene k/M-Abkuerzung. fmtTokens passt fuer
// Token-Volumen (k/M/G), Messages-Count ueberspringt G — selbst eine
// Daily-Heavy-Use-Session erreicht keine Milliarden Messages.
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatHour(hour: number | null): string {
  if (hour === null) return '—';
  // 24-h-Format mit Doppelpunkt, kompakt: "14:00".
  return `${String(hour).padStart(2, '0')}:00`;
}

// Kurzdarstellung der Modell-IDs, damit sie in die schmale Card passen.
// claude-opus-4-7 → Opus 4.7, claude-sonnet-4-6 → Sonnet 4.6, etc. Unbekannte
// IDs werden auf die letzten 12 Zeichen gekuerzt — kein hartes Fail bei neuen
// Modell-Familien.
function formatFavoriteModel(overview: StatsOverviewResult): string {
  if (!overview.favorite_model) return '—';
  return prettyModelId(overview.favorite_model);
}

