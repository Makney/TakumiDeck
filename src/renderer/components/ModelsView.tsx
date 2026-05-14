import { useEffect, useRef } from 'react';
import { useUiStore } from '../stores/ui';
import { useStatsStore } from '../stores/stats';
import { fmtTokens } from './fmtTokens';
import { prettyModelId } from '../panels/StatsPane';

// ModelsView (Phase-2 Season-14).
//
// Per-Modell-Aufschluesselung als zweiter Tab in der Stats-Pane. Zwei Bloecke:
// - oben horizontale CSS-Bars pro Modell mit Anteil-%-Tonung (color-mix ueber
//   --td-accent), Stil bewusst konsistent zur ActivityHeatmap und den
//   UsageBars aus Sprint 5 — kein Recharts-Fremdkoerper.
// - unten eine Tabelle (Modell · Sessions · Tokens · ⌀ pro Session).
//
// Scope/Range kommen vom geteilten Stats-Header-Toggle. Refresh laeuft im
// gleichen Pattern wie OverviewView: Initial-Pull + auto-Refresh bei Toggle/
// Projekt-Wechsel + debounced auf usage:update.

export function ModelsView() {
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const scope = useStatsStore((s) => s.scope);
  const range = useStatsStore((s) => s.range);
  const models = useStatsStore((s) => s.models);
  const modelsError = useStatsStore((s) => s.modelsError);
  const refreshModels = useStatsStore((s) => s.refreshModels);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void refreshModels(activeProjectId);
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refreshModels, activeProjectId, scope, range]);

  useEffect(() => {
    const unsubscribe = window.api.usage.onUpdate(() => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void refreshModels(activeProjectId);
      }, 600);
    });
    return () => unsubscribe();
  }, [refreshModels, activeProjectId]);

  if (modelsError) {
    return (
      <div className="td-stats-placeholder">
        <p>Modelle konnten nicht geladen werden</p>
        <p className="td-stats-placeholder-meta">{modelsError}</p>
      </div>
    );
  }

  if (!models || models.rows.length === 0) {
    return (
      <div className="td-stats-placeholder">
        <p>Keine Modell-Daten im aktuellen Filter</p>
        <p className="td-stats-placeholder-meta">
          Tipp: Scope auf „Global“ oder Range auf „Alle“ stellen.
        </p>
      </div>
    );
  }

  return (
    <div className="td-models-view">
      <section className="td-models-bars" aria-label="Token-Verteilung pro Modell">
        <div className="td-models-section-head">Token-Verteilung</div>
        <ul className="td-models-bar-list">
          {models.rows.map((row) => {
            const pct = Math.round(row.tokens_share * 1000) / 10;
            return (
              <li key={row.model} className="td-models-bar-row">
                <span className="td-models-bar-name" title={row.model}>
                  {prettyModelId(row.model)}
                </span>
                <span
                  className="td-models-bar-track"
                  aria-label={`${pct.toFixed(1)} Prozent`}
                >
                  <span
                    className="td-models-bar-fill"
                    style={{ width: `${Math.max(row.tokens_share * 100, 0.5)}%` }}
                  />
                </span>
                <span className="td-models-bar-pct">{formatPct(pct)}</span>
                <span className="td-models-bar-tok">{fmtTokens(row.tokens)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="td-models-table-wrap" aria-label="Modell-Details">
        <div className="td-models-section-head">Details</div>
        <table className="td-models-table">
          <thead>
            <tr>
              <th scope="col">Modell</th>
              <th scope="col" className="num">Sessions</th>
              <th scope="col" className="num">Tokens</th>
              <th scope="col" className="num">⌀ pro Session</th>
            </tr>
          </thead>
          <tbody>
            {models.rows.map((row) => (
              <tr key={row.model}>
                <td title={row.model}>{prettyModelId(row.model)}</td>
                <td className="num">{row.sessions}</td>
                <td className="num">{fmtTokens(row.tokens)}</td>
                <td className="num">
                  {row.tokens_per_session !== null ? fmtTokens(row.tokens_per_session) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// Eine Nachkommastelle bis 9.9 %, ab 10 % nur Ganzzahlen — die Bar-Liste
// soll bei dominantem Modell (z.B. 95 %) keine unnoetigen Dezimalen zeigen,
// kleine Anteile bleiben aber unterscheidbar.
function formatPct(pct: number): string {
  if (pct >= 10) return `${Math.round(pct)} %`;
  return `${pct.toFixed(1)} %`;
}
