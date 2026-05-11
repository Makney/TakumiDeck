import { useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { LimitBar, UsageWindowResult } from '@shared/types';

// UsageDetailModal (Sprint 5, Architektur 6.4).
//
// Wird auf Klick einer UsageBar geöffnet. Zeigt:
//   - Aktuelle Window-Werte (Tokens / Limit / Quelle)
//   - Per-Modell-Breakdown
//   - Burn-Rate-Diagramm: Tokens pro Stunde über das aktive Bar-Fenster
//     (Recharts LineChart, weil hier eine echte Zeitreihe sinnvoll ist —
//     Top-Level-Bars sind reines CSS, Architektur-Variante A).
//
// Datenquelle für die Burn-Rate ist eine separate IPC-Antwort, die wir nachladen
// können — Sprint 5 erweitert dafür den vorhandenen usage:window-Channel mit dem
// per-bucket-Detail nicht; stattdessen synthetisieren wir die Linie aus dem
// Tooltip-Total der einzelnen Bars (= 1 Datenpunkt pro Bar). Das ist im MVP
// ausreichend; eine Per-Hour-Burn-Rate ist Phase 2.

interface Props {
  bar: LimitBar;
  result: UsageWindowResult | null;
  onClose: () => void;
}

export function UsageDetailModal({ bar, result, onClose }: Props) {
  // Esc schließt das Modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Burn-Rate-Reihe: ein Punkt pro Modell als Vereinfachung. Bei Per-Bucket-
  // Resolution würde man das Server-seitig rechnen (Sprint-5-Stub akzeptiert).
  // useMemo statt useState, weil `result` async eintrifft — useState-Initializer
  // hätte nur den Initial-null-Wert eingefroren und die Burn-Rate wäre leer geblieben.
  const burnSeries = useMemo(
    () =>
      (result?.perModel ?? []).map((m) => ({
        model: m.model,
        tokens: m.tokens,
      })),
    [result],
  );

  return (
    <div className="td-modal-backdrop" onClick={onClose}>
      <div
        className="td-modal td-modal-wide"
        role="dialog"
        aria-label={`Detail · ${bar.label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="td-modal-header">
          <h2 className="td-modal-title">{bar.label}</h2>
          <button
            type="button"
            className="td-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="td-modal-body">
          {!result && <div className="td-modal-loading">Daten werden geladen…</div>}
          {result && (
            <>
              <SummaryRow result={result} />
              <PerModelTable result={result} />
              <h3 className="td-detail-section-title">Burn-Rate (Tokens pro Modell)</h3>
              <div className="td-detail-chart">
                {burnSeries.length === 0 ? (
                  <p className="td-detail-empty">Noch keine Token-Daten in diesem Fenster.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={burnSeries}>
                      <CartesianGrid stroke="#232826" strokeDasharray="3 3" />
                      <XAxis dataKey="model" stroke="#5b605b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#5b605b" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: '#15191b',
                          border: '1px solid #2c322f',
                          color: '#d8dad6',
                          fontSize: 11,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tokens"
                        stroke="#4ade80"
                        strokeWidth={2}
                        dot={{ fill: '#4ade80', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ result }: { result: UsageWindowResult }) {
  const sourceLabel =
    result.limitSource === 'p90'
      ? 'P90 (geschätzt aus 8 Tagen)'
      : result.limitSource === 'fixed'
        ? 'Fest aus settings.json'
        : 'Fallback aus model_limits';
  return (
    <div className="td-detail-summary">
      <div>
        <span className="td-detail-label">Tokens</span>
        <span className="td-detail-value">{Math.round(result.tokens).toLocaleString()}</span>
      </div>
      <div>
        <span className="td-detail-label">Limit</span>
        <span className="td-detail-value">{Math.round(result.limit).toLocaleString()}</span>
      </div>
      <div>
        <span className="td-detail-label">Auslastung</span>
        <span className="td-detail-value">{result.percent.toFixed(1)} %</span>
      </div>
      <div>
        <span className="td-detail-label">Fenster</span>
        <span className="td-detail-value">{result.windowHours} h</span>
      </div>
      <div>
        <span className="td-detail-label">Limit-Quelle</span>
        <span className="td-detail-value">{sourceLabel}</span>
      </div>
    </div>
  );
}

function PerModelTable({ result }: { result: UsageWindowResult }) {
  if (result.perModel.length === 0) return null;
  return (
    <table className="td-detail-table">
      <thead>
        <tr>
          <th>Modell</th>
          <th>Tokens</th>
        </tr>
      </thead>
      <tbody>
        {result.perModel.map((row) => (
          <tr key={row.model}>
            <td>{row.model}</td>
            <td>{Math.round(row.tokens).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
