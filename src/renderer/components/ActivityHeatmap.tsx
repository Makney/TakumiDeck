import { useMemo } from 'react';
import type { StatsHeatmapDay, StatsHeatmapResult, StatsHeatmapWeeks } from '@shared/types';
import { fmtTokens } from './fmtTokens';

// ActivityHeatmap (Phase-2 Season-13).
//
// GitHub-Style Kalender-Grid mit 7 Reihen (Wochentage Mo..So) und N Spalten
// (Wochen). Jede Zelle ist ein Tag, gefuellt nach `level` (0..4). Die Daten
// kommen aus dem `stats:heatmap`-IPC; der Renderer-Store haelt sie im
// useStatsStore.heatmap. Cells nach „heute" (gibt es nur in der ganz rechten
// Spalte, wenn heute nicht Sonntag ist) bleiben transparent — sie sind im
// Backend-Output gar nicht enthalten.
//
// Tooltip ist `title=` auf jeder Zelle (nativer Browser-Tooltip) — fuer ein
// IDE-Tool reicht das, ohne eine eigene Tooltip-Infrastruktur einzufuehren.

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

export interface ActivityHeatmapProps {
  data: StatsHeatmapResult | null;
  weeks: StatsHeatmapWeeks;
  onWeeksChange: (weeks: StatsHeatmapWeeks) => void;
  error: string | null;
}

export function ActivityHeatmap({ data, weeks, onWeeksChange, error }: ActivityHeatmapProps) {
  // Lookup `date → day` plus die zeitliche Untergrenze des Fensters
  // (= Datum des ersten gelieferten Tages, gleich dem Montag der linken
  // Spalte). Beides erlaubt uns, die Position jeder Zelle deterministisch
  // aus (Wochen-Spalte, Wochentag) zu berechnen.
  const lookup = useMemo(() => buildLookup(data?.days ?? []), [data]);
  const startDate = data?.days[0]?.date ?? null;
  const monthLabels = useMemo(() => computeMonthLabels(startDate, weeks), [startDate, weeks]);

  return (
    <div className="td-heatmap-wrap">
      <div className="td-heatmap-head">
        <span className="td-heatmap-title">Aktivität</span>
        <div className="td-heatmap-weeks" role="group" aria-label="Heatmap-Fenster">
          {([30, 52] as const).map((w) => (
            <button
              key={w}
              type="button"
              className={weeks === w ? 'active' : ''}
              onClick={() => onWeeksChange(w)}
            >
              {w}W
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="td-heatmap-empty">
          <p>Heatmap konnte nicht geladen werden</p>
          <p className="td-heatmap-empty-meta">{error}</p>
        </div>
      ) : (
        <div className="td-heatmap-grid-wrap">
          <div className="td-heatmap-months" aria-hidden style={{ '--weeks': weeks } as React.CSSProperties}>
            {monthLabels.map((label, idx) => (
              <span key={idx} className="td-heatmap-month" style={{ gridColumn: label.column + 1 }}>
                {label.text}
              </span>
            ))}
          </div>
          <div className="td-heatmap-body">
            <div className="td-heatmap-weekdays" aria-hidden>
              {WEEKDAY_LABELS.map((wd, idx) => (
                <span key={wd} className={`td-heatmap-weekday${idx % 2 === 1 ? ' visible' : ''}`}>
                  {wd}
                </span>
              ))}
            </div>
            <div
              className="td-heatmap-grid"
              role="img"
              aria-label={
                data
                  ? `Aktivitäts-Heatmap der letzten ${weeks} Wochen, ${data.days.filter((d) => d.tokens > 0).length} aktive Tage`
                  : 'Aktivitäts-Heatmap (lädt)'
              }
              style={{ '--weeks': weeks } as React.CSSProperties}
            >
              {Array.from({ length: weeks * 7 }, (_, i) => {
                const col = Math.floor(i / 7);
                const row = i % 7;
                const date = dateForCell(startDate, col, row);
                const day = date ? lookup.get(date) : undefined;
                return (
                  <div
                    key={i}
                    className={`td-heatmap-cell l${day?.level ?? 0}${day ? '' : ' empty'}`}
                    title={tooltipFor(date, day)}
                  />
                );
              })}
            </div>
          </div>
          {data && data.thresholds.p75 > 0 && (
            <div className="td-heatmap-legend" aria-label="Heatmap-Legende">
              <span>weniger</span>
              {[0, 1, 2, 3, 4].map((lvl) => (
                <span key={lvl} className={`td-heatmap-cell l${lvl}`} />
              ))}
              <span>mehr</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildLookup(days: StatsHeatmapDay[]): Map<string, StatsHeatmapDay> {
  const map = new Map<string, StatsHeatmapDay>();
  for (const d of days) map.set(d.date, d);
  return map;
}

interface MonthLabel {
  column: number;
  text: string;
}

// Sucht in der Reihe der Wochen (Montage) den ersten Auftritt jedes Monats
// und legt das Label genau in dieser Wochen-Spalte ab. Wenn der erste Tag
// des Monats nicht der Montag ist, sitzt das Label trotzdem in der Spalte
// dieses Montags — gleicher Pragmatismus wie das GitHub-Original.
function computeMonthLabels(startDate: string | null, weeks: number): MonthLabel[] {
  if (startDate === null) return [];
  const start = parseLocal(startDate);
  if (start === null) return [];
  const out: MonthLabel[] = [];
  let prevMonth = -1;
  for (let col = 0; col < weeks; col++) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + col * 7);
    const month = monday.getMonth();
    if (month !== prevMonth) {
      // Erste Spalte zeigen wir nicht, weil das Label sonst direkt am Rand
      // sitzt und mit der Wochentag-Spalte kollidiert.
      if (col > 0) out.push({ column: col, text: MONTH_LABELS[month]! });
      prevMonth = month;
    }
  }
  return out;
}

function dateForCell(startDate: string | null, col: number, row: number): string | null {
  if (startDate === null) return null;
  const start = parseLocal(startDate);
  if (start === null) return null;
  const d = new Date(start);
  d.setDate(start.getDate() + col * 7 + row);
  return localDayStr(d);
}

function tooltipFor(date: string | null, day: StatsHeatmapDay | undefined): string {
  if (date === null) return '';
  const human = humanDate(date);
  if (!day) return `${human} · keine Daten`;
  if (day.tokens === 0) return `${human} · 0 Tokens`;
  return `${human} · ${fmtTokens(day.tokens)}`;
}

function humanDate(s: string): string {
  // YYYY-MM-DD → "DD.MM.YYYY" (deutsche Konvention, kompakt fuer den Tooltip).
  if (s.length !== 10) return s;
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

function parseLocal(s: string): Date | null {
  if (s.length !== 10) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function localDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
