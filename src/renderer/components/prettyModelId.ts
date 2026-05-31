// Pure-Helper fuer kompakte Modell-IDs ("Opus 4.7", "Sonnet 4.6", …).
// In eigene Datei extrahiert (Zwischen-Review v0.1.2), um den Modul-Zyklus
// ModelsView ↔ StatsPane aufzuloesen.
export function prettyModelId(id: string): string {
  const match = id.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (match && match[1] && match[2] && match[3]) {
    const family = match[1][0]!.toUpperCase() + match[1].slice(1).toLowerCase();
    return `${family} ${match[2]}.${match[3]}`;
  }
  if (id.length <= 14) return id;
  return `…${id.slice(-12)}`;
}
