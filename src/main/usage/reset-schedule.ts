import type { LimitBar } from '@shared/types';

// Reset-Schedule-Aggregation (Phase 2 Season Flacsh).
//
// Pure Helper: berechnet den letzten Reset-Zeitpunkt vor `now` aus einem
// wochentlichen Schedule (day_of_week, hour, minute). Lokale Zeit, weil der
// User in seiner Zeitzone "Montag 00:00" erwartet — nicht UTC.
//
// `day_of_week`: 0=Sonntag, 1=Montag, ..., 6=Samstag (= JS-`Date.getDay()`).
// Returnt epoch-ms; der Caller umwandelt zum `hourBucket` fuer die SQLite-
// Aggregat-Query.

export function computeResetWindowStart(
  schedule: NonNullable<LimitBar['reset_schedule']>,
  now: number,
): number {
  const d = new Date(now);
  const todayDow = d.getDay();
  // Tage zurueck zum letzten matching Wochentag (0..6).
  const dayDelta = (todayDow - schedule.day_of_week + 7) % 7;
  const cand = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() - dayDelta,
    schedule.hour,
    schedule.minute,
    0,
    0,
  );
  // Wenn dayDelta=0 (heute ist Reset-Tag) und die Reset-Zeit noch in der
  // Zukunft liegt, liegt der letzte Reset eine Woche vorher. Date-Arithmetik
  // mit lokaler Tages-Differenz (statt `- 7 * MS_PER_DAY`) bleibt DST-immun.
  if (cand.getTime() > now) {
    const prev = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() - dayDelta - 7,
      schedule.hour,
      schedule.minute,
      0,
      0,
    );
    return prev.getTime();
  }
  return cand.getTime();
}
