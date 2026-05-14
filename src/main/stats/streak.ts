// Phase-2 Season-12 — Streak-Berechnung als reine Funktion.
//
// Input ist eine ASC-sortierte Liste von Tagen im Format "YYYY-MM-DD" (lokale
// Zeitzone des Mains, geliefert von SQLite via strftime('%Y-%m-%d', ts/1000,
// 'unixepoch', 'localtime')). Ausgabe sind die zwei Streak-Zahlen, die
// das Verhalten-Reihe-Pair der Stats-Cards rendert.
//
// Definition (User-Antwort zur Klarfrage): die aktuelle Streak ist intakt,
// solange der letzte aktive Tag heute ODER gestern war. Erst wenn zwei volle
// Kalendertage ohne Aktivitaet vergangen sind, bricht sie. Damit kann man
// abends ohne Panik schlafen gehen, ohne die Streak am Vormittag des
// naechsten Tages bei 0 zu sehen.

export interface StreakResult {
  current: number;
  longest: number;
}

export function computeStreaks(
  sortedDistinctDays: string[],
  todayDateStr: string,
): StreakResult {
  if (sortedDistinctDays.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Longest: ein Linear-Scan ueber die sortierte Liste. Wir zaehlen, wie viele
  // aufeinanderfolgende Tage am Stueck vorkommen, und merken uns das Maximum.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDistinctDays.length; i++) {
    const prev = sortedDistinctDays[i - 1];
    const curr = sortedDistinctDays[i];
    if (prev === undefined || curr === undefined) continue;
    if (isNextDay(prev, curr)) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current: nur intakt, wenn der letzte Aktivitaetstag heute oder gestern war.
  // Sonst ist die Streak auf 0 — der Renderer rendert die Zelle dann mit
  // gedaempftem "0 Tg" statt der laufenden Zahl.
  const lastDay = sortedDistinctDays[sortedDistinctDays.length - 1];
  if (lastDay === undefined) return { current: 0, longest };
  const yesterday = subtractOneDay(todayDateStr);
  let current = 0;
  if (lastDay === todayDateStr || lastDay === yesterday) {
    current = 1;
    for (let i = sortedDistinctDays.length - 1; i > 0; i--) {
      const prev = sortedDistinctDays[i - 1];
      const curr = sortedDistinctDays[i];
      if (prev === undefined || curr === undefined) break;
      if (isNextDay(prev, curr)) current += 1;
      else break;
    }
  }

  return { current, longest };
}

// "YYYY-MM-DD"-Strings vergleichen: parsen wir als UTC-Mittag, damit DST-
// Uebergaenge keine 23/25-h-Tage erzeugen (lokale Zeit haette in beiden
// Faellen einen Off-by-one-Fehler an der Sommerzeit-Grenze).
export function isNextDay(prevStr: string, currStr: string): boolean {
  const prev = parseDayUtc(prevStr);
  const curr = parseDayUtc(currStr);
  if (prev === null || curr === null) return false;
  return curr - prev === MS_PER_DAY;
}

const MS_PER_DAY = 86_400_000;

function parseDayUtc(s: string): number | null {
  // Format YYYY-MM-DD. Ungueltige Eingaben (z.B. leere Strings) geben null
  // zurueck — die Aufrufer behandeln das wie "kein Folgetag".
  if (s.length !== 10) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return Date.UTC(y, m - 1, d);
}

export function subtractOneDay(s: string): string {
  const t = parseDayUtc(s);
  if (t === null) return s;
  const d = new Date(t - MS_PER_DAY);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

// Liefert den heutigen Tag in lokaler Zeit als "YYYY-MM-DD". Spiegel der
// SQLite-Ausgabe von date('now', 'localtime') — wichtig, damit "lastDay ===
// today" auch wirklich matcht, wenn die heute geschriebenen messages.ts
// schon vorhanden sind.
export function todayLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
