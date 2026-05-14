// Reset-Footer-Format (Phase 2 Season Flacsh).
//
// Liefert den dezenten Hinweis unter der UsageBar im Format
//   „Zurücksetzung in 2 Std. 37 Min. → 15:00 Uhr"        (Session-Block 5 h)
//   „Zurücksetzung in 3 Tagen → So., 10:00 Uhr"          (Wochen-Reset)
//
// Pure Funktion: Tests injizieren `now`, der Renderer ruft sie mit `Date.now()`.

const WEEKDAY_SHORT = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'] as const;

export function formatResetFooter(windowEndAt: number, now: number): string | null {
  const deltaMs = windowEndAt - now;
  if (deltaMs <= 0) return null;

  const minutes = Math.floor(deltaMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const target = new Date(windowEndAt);
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');

  let durationPart: string;
  if (days >= 1) {
    durationPart = days === 1 ? 'in 1 Tag' : `in ${days} Tagen`;
  } else if (hours >= 1) {
    const remainMin = minutes - hours * 60;
    durationPart =
      remainMin > 0
        ? `in ${hours} Std. ${remainMin} Min.`
        : `in ${hours} Std.`;
  } else if (minutes >= 1) {
    durationPart = `in ${minutes} Min.`;
  } else {
    // Letzte Sekunden — abrunden auf "weniger als 1 Min.", damit der Hint
    // nicht auf „in 0 Min." steht, was wie ein abgelaufenes Window wirkt.
    durationPart = 'in weniger als 1 Min.';
  }

  const whenPart =
    days >= 1
      ? `${WEEKDAY_SHORT[target.getDay()]}, ${hh}:${mm} Uhr`
      : `${hh}:${mm} Uhr`;

  return `Zurücksetzung ${durationPart} → ${whenPart}`;
}
