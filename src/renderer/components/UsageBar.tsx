import type { UsageWindowResult } from '@shared/types';

// UsageBar (Sprint 5, Architektur 6.4).
//
// Pure CSS-Bar mit Schwellen-Farben aus settings.token_warning_thresholds:
//   gelb 70 %, orange 85 %, rot 95 %. Unterhalb gelb bleibt es grün.
// Recharts haben wir bewusst nicht für die Top-Level-Bars (Variante A): tokens.css
// liefert die Farben direkt, kein Wrestling mit Recharts-Theme-Defaults.
//
// Tooltip auf der Bar zeigt:
//   - Tokens / Limit
//   - Window-Größe (z.B. „letzte 5 h")
//   - Limit-Quelle ('p90' / 'fixed' / 'fallback')
// Click → Detail-Modal (geöffnet von außen via onOpenDetail-Callback).

interface Thresholds {
  yellow: number;
  orange: number;
  red: number;
}

interface Props {
  result: UsageWindowResult | null;
  thresholds: Thresholds;
  loading: boolean;
  onOpenDetail?: () => void;
}

export function UsageBar({ result, thresholds, loading, onOpenDetail }: Props) {
  if (!result) {
    return (
      <div className="td-usage-bar td-usage-bar-skeleton" aria-busy={loading}>
        <div className="td-usage-bar-row">
          <span className="td-usage-bar-label">…</span>
          <span className="td-usage-bar-value">—</span>
        </div>
        <div className="td-usage-bar-track">
          <div className="td-usage-bar-fill" style={{ width: '0%' }} />
        </div>
      </div>
    );
  }

  const percent = Math.max(0, result.percent);
  const clampedPercent = Math.min(percent, 100);
  const tone = toneForPercent(percent, thresholds);

  const sourceLabel = limitSourceLabel(result.limitSource);
  const tooltipLines = [
    `${formatTokens(result.tokens)} / ${formatTokens(result.limit)} (${percent.toFixed(1)} %)`,
    `Fenster: ${result.windowHours} h`,
    `Limit: ${sourceLabel}`,
  ];
  if (result.limitSource === 'p90') {
    tooltipLines.push('geschätzt aus den letzten 8 Tagen');
  }

  return (
    <button
      type="button"
      className={`td-usage-bar ${tone} ${onOpenDetail ? 'clickable' : ''}`}
      onClick={onOpenDetail}
      title={tooltipLines.join('\n')}
      disabled={!onOpenDetail}
    >
      <div className="td-usage-bar-row">
        <span className="td-usage-bar-label">{result.label}</span>
        <span className="td-usage-bar-value">
          {formatTokens(result.tokens)} / {formatTokens(result.limit)}
          <span className="td-usage-bar-percent"> · {percent.toFixed(0)} %</span>
        </span>
      </div>
      <div className="td-usage-bar-track">
        <div className="td-usage-bar-fill" style={{ width: `${clampedPercent}%` }} />
        {percent > 100 && (
          <div
            className="td-usage-bar-overflow"
            // Visualisiert das Über-Limit-Verhältnis — capped bei 50 % der Bar-Breite,
            // damit die Bar bei 200 % Verbrauch nicht aussieht wie 100 %.
            style={{ width: `${Math.min((percent - 100) / 2, 50)}%` }}
          />
        )}
      </div>
    </button>
  );
}

function toneForPercent(percent: number, t: Thresholds): 'green' | 'yellow' | 'orange' | 'red' {
  if (percent >= t.red) return 'red';
  if (percent >= t.orange) return 'orange';
  if (percent >= t.yellow) return 'yellow';
  return 'green';
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} k`;
  return `${(n / 1_000_000).toFixed(2)} M`;
}

function limitSourceLabel(source: UsageWindowResult['limitSource']): string {
  switch (source) {
    case 'p90':
      return 'P90 (geschätzt)';
    case 'fixed':
      return 'fest (Settings)';
    case 'fallback':
      return 'Fallback (Modell-Default)';
  }
}
