// localStorage-Round-Trip fuer die Filter-Wahl des Right-Pane-Datei-Browsers
// (Phase-2 Season-29.5). Speichert Such-Query und aktive Endungs-Toggles
// projekt-uebergreifend pro Installation.
//
// Konventionsanker: td.heatmapWeeks, td.statsRange — UI-Memory-State lebt im
// localStorage, nicht in settings.json (das ist Konfigurations-State).
// Bewusst keine Schema-Migration in `src/main/settings/migrations.ts`, weil das
// hier reiner UX-Erinnerungs-Wert ist und der Default `.md`/leere Endungs-
// Menge greift, sobald der Key fehlt oder Schrott enthaelt.

const STORAGE_KEY = 'td.fileBrowserFilter';

// Wir bieten genau diese Endungen als Toggle-Pillen an. Liste curated nach
// echtem TakumiDeck-Stack (TS-Renderer, Markdown-Docs, JSON-Configs, Python-
// Build-Skripte, YAML fuer CI/Frontmatter, CSS fuer Tokens) — nicht
// erschoepfend, sondern auf das ausgerichtet, was im Daily-Use auftaucht.
// Aufrufer koennen via Suchfeld („.rs", „.toml") jede beliebige Endung
// trotzdem matchen — die Pillen sind der Schnellzugriff, nicht das Limit.
export const TOGGLEABLE_EXTENSIONS: ReadonlyArray<string> = [
  '.md',
  '.ts',
  '.tsx',
  '.json',
  '.css',
  '.html',
  '.py',
  '.yml',
];

export interface FileBrowserPrefs {
  query: string;
  // Aktiv-Liste statt Set, damit JSON-serialisierbar. Reihenfolge irrelevant —
  // der Konsument baut ein Set drueber.
  extensions: string[];
}

const DEFAULT_PREFS: FileBrowserPrefs = {
  // Phase-1 Q2-B Default: `.md` als initialer Substring-Match. Bleibt als
  // Default, damit Phase-1-User keinen Verhaltens-Bruch sehen.
  query: '.md',
  extensions: [],
};

export function loadFileBrowserPrefs(): FileBrowserPrefs {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_PREFS;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalize(parsed);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveFileBrowserPrefs(prefs: FileBrowserPrefs): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota oder privater Modus → wir scheitern still. localStorage ist
    // hier reines Komfort-Feature; ein Schreib-Fehler darf den
    // Datei-Browser nicht killen.
  }
}

// Defensives Parsen: alles, was nicht der erwarteten Form entspricht, faellt
// auf die Defaults zurueck. Wir wollen NICHT, dass ein manuell editierter
// localStorage-Wert den Renderer crasht.
export function normalize(value: unknown): FileBrowserPrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const obj = value as Record<string, unknown>;
  const query = typeof obj.query === 'string' ? obj.query : DEFAULT_PREFS.query;
  const extensions = Array.isArray(obj.extensions)
    ? obj.extensions.filter((e): e is string => typeof e === 'string' && e.length > 0)
    : [];
  return { query, extensions };
}
