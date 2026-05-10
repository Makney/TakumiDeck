// Sprint 9 (L5) — Token-Formatter, Vorlage-`fmtNum` (components.jsx 13-17).
//
// Wandelt große Token-Zahlen in kompakte Suffixe um:
//   1.659.187.205 → 1.7G
//   277.250.657   → 277.3M
//   8.421         → 8.4k
//   42            → 42
//
// Wird von der Action-Bar-`ContextSlot` und der StatsPane-`Stat`-Karte
// genutzt; der Plan-Pane-`UsageBar` bringt sein eigenes Format mit (Werte
// kommen schon mit M-Suffix aus `usage:window`).

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}G`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
