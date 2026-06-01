// Token-Tracking (Sprint 5): JSONL-Parsing, messages/usage-Inserts, Usage-Bars.

// Geparste JSONL-Zeile, gefiltert auf das, was wir tatsächlich brauchen.
// timestamp wird vom Parser zu epoch-ms normalisiert (ISO-String → Date.parse).
export interface ParsedJsonlMessage {
  ts: number;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  // Summe input + cache_creation + cache_read — der Sprint-5-Konsum-Wert.
  totalTokens: number;
  // Roh-Zeilen-Inhalt für messages.content (kein Parsing-Aufwand für die Anzeige
  // im Verlauf-Panel, Sprint 6 entscheidet das endgültige Format).
  rawLine: string;
  // Sprint-6-Hotfix: claude-codes eigene Session-UUID, sofern in der JSONL-Zeile
  // angegeben. Wird vom Watcher genutzt, um Legacy-Sessions rückwirkend in
  // sessions.claude_session_id zu mappen (Resume-Bug-Fix Variante C).
  sessionId: string | null;
}

// Repository-Insert für eine messages-Row.
export interface MessageInsert {
  session_id: string;
  project_id: string | null;
  role: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  ts: number;
  // Phase-2 Season-10: per-Message-Modell aus message.model in der JSONL-Zeile
  // (parser.ts liefert das Feld). NULL fuer externe Sessions ohne Modell-Info
  // bzw. fuer Pre-Migration-Backfill, der die Session nicht aufloesen kann.
  // Optional, damit aeltere Caller (z.B. State-Detection-Tests, die nur den
  // Last-Event-Pfad brauchen) das Feld weglassen koennen — die Driver mappen
  // undefined auf null.
  model?: string | null;
  // Phase-2 Season Flacsh: getrennte Cache-Token-Anteile aus
  // message.usage.cache_creation_input_tokens / cache_read_input_tokens.
  // `tokens_in` bleibt die Summe aus input + cache_creation + cache_read
  // (Backward-Compat); diese Felder erlauben die Cache-Hit-Rate-Aggregation.
  // Optional, damit aeltere Caller das Feld weglassen koennen — Driver
  // mappen undefined auf 0.
  tokens_cache_creation?: number;
  tokens_cache_read?: number;
}

// Repository-Insert/Upsert für einen usage_buckets-Row.
// PRIMARY KEY ist (bucket_start, model) → Upsert mit `tokens = tokens + excluded.tokens`.
export interface UsageBucketUpsert {
  bucket_start: number; // epoch-Stunde (= floor(ts_ms / 3_600_000))
  model: string;
  tokens: number;
}

// Persistierter Lese-Offset pro JSONL-Datei.
export interface JsonlOffsetRow {
  file_path: string;
  offset_bytes: number;
  last_seen_at: number;
}

// IPC-Output von usage:window. Renderer rendert eine UsageBar pro Bar-Definition.
export interface UsageWindowResult {
  barId: string;
  label: string;
  tokens: number;
  limit: number;
  percent: number; // 0..100+ (kann >100 sein, wenn das Limit gerissen ist)
  // Wie wurde das Limit ermittelt? 'p90' (geschätzt aus den letzten N Stunden),
  // 'fixed' (fester Wert aus settings.fixed_limit), 'fallback' (model_limits-Default,
  // wenn der P90-Datensatz zu klein ist).
  limitSource: 'p90' | 'fixed' | 'fallback';
  windowHours: number;
  // Per-Modell-Aufschlüsselung (für Tooltips + Detail-Modal).
  perModel: Array<{ model: string; tokens: number }>;
  generatedAt: number;
  // Phase 2 Season Flacsh: Reset-Zeitstempel des aktiven Windows fuer die
  // Footer-Anzeige unter der Bar. Beide null fuer rolling-Bars ohne
  // reset_schedule (keine fixe Reset-Zeit).
  //   - session_block: windowStartAt = erster Token im aktiven Block,
  //                    windowEndAt = windowStartAt + window_hours*3600000.
  //   - reset_schedule: windowStartAt = letzter Reset-Zeitpunkt,
  //                     windowEndAt = naechster Reset-Zeitpunkt.
  windowStartAt: number | null;
  windowEndAt: number | null;
}

// IPC-Output von usage:context. Per-Session-Kontext der zuletzt aktiven Message,
// vergleicht den letzten Stand gegen das Per-Modell-Limit.
export interface UsageContextResult {
  sessionId: string;
  model: string | null;
  tokens: {
    input: number;
    cache_creation: number;
    cache_read: number;
    total: number; // = input + cache_creation + cache_read
  };
  limit: number;
  percent: number;
  // epoch-ms der letzten message.usage-Zeile in der Session.
  lastEventAt: number | null;
}

// Phase-2-Stub für die Heatmap. Sprint 5 reserviert nur den Channel.
export interface UsageHeatmapResult {
  stub: true;
  message: string;
}

export interface UsageWindowInput {
  barId: string;
  asOf?: number;
}

export interface UsageContextInput {
  sessionId: string;
}

// Event-Push aus dem Watcher → Renderer. Architektur 4 trennt Live-Push (Per-Session
// sofort) vs. Debounced (globale Bars max 2/Sek). Der Renderer reagiert pro Kanal:
// `context` re-fetcht die Per-Session-Kontext-Bar, `global` re-fetcht alle limit_bars
// (oder gezielt die im scope angegebenen).
export interface UsageUpdateEvent {
  kind: 'global' | 'context';
  // Optional: betroffene Session (kind === 'context') oder Liste von Bar-IDs
  // (kind === 'global', leer = alle).
  sessionId?: string;
  barIds?: string[];
}
