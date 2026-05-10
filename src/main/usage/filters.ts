import type { LimitBar } from '@shared/types';

// Bar-Filter-Logik (Sprint 5, Architektur 4).
//
// Aus settings.limit_bars[].filter wird beim Aggregations-Query entweder ein SQL-
// Pattern (für die ratenbeschränkende WHERE-Klausel auf usage_buckets.model) oder
// eine pure JS-Match-Funktion (für In-Memory-Tests) abgeleitet. Beide Wege kommen
// aus *einer* Definition unten, damit ein neuer Filter nicht an zwei Stellen
// auseinanderdriften kann.
//
// Architektur 4 nennt 'top_tier' als „Opus-Familie". Die heutigen Modell-IDs sind
// `claude-opus-4-7` etc., daher matchen wir Substring statt Prefix — falls
// claude-code später `opus-4-8` ohne `claude-`-Prefix liefert, klappt es weiter.

export type BarFilter = LimitBar['filter'];

export interface FilterDefinition {
  // SQL-LIKE-Pattern, wenn der Filter einer entspricht. null = „kein Filter, alle Modelle".
  sqlLike: string | null;
  // Pure-JS-Test, identisch zur SQL-LIKE-Semantik.
  matches: (model: string) => boolean;
}

export function resolveBarFilter(
  filter: BarFilter,
  customPattern: string | undefined,
): FilterDefinition {
  switch (filter) {
    case 'all':
      return { sqlLike: null, matches: () => true };
    case 'top_tier':
      return likeFilter('%opus%');
    case 'sonnet':
      return likeFilter('%sonnet%');
    case 'haiku':
      return likeFilter('%haiku%');
    case 'custom': {
      const pattern = customPattern?.trim();
      if (!pattern || pattern.length === 0) {
        // Kein Pattern → keine Treffer (sicherer Default als „alle"). Wir wollen,
        // dass eine schief konfigurierte custom-Bar leer rendert, nicht versehentlich
        // den all-Filter ersetzt.
        return { sqlLike: '__no_match__', matches: () => false };
      }
      // Custom-Pattern wird als exaktes Modell-ID-Match interpretiert (Architektur 4
      // gibt `model_pattern: 'claude-opus-4-7'` als Beispiel an). Wer Substring will,
      // packt selbst `%` rein — wir reichen das Pattern unverändert an LIKE durch.
      return likeFilter(pattern);
    }
  }
}

function likeFilter(pattern: string): FilterDefinition {
  // SQL-LIKE → Regex: `%` wird zu `.*`, `_` zu `.`. Andere Zeichen werden
  // case-insensitively literal verglichen (claude-code schreibt Modell-IDs
  // immer kleingeschrieben, aber wir sind defensiv).
  const regex = likeToRegex(pattern);
  return {
    sqlLike: pattern,
    matches: (model) => regex.test(model),
  };
}

function likeToRegex(pattern: string): RegExp {
  let body = '';
  for (const char of pattern) {
    if (char === '%') body += '.*';
    else if (char === '_') body += '.';
    else body += escapeRegex(char);
  }
  return new RegExp(`^${body}$`, 'i');
}

function escapeRegex(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
