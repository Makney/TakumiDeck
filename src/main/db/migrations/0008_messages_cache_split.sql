-- Phase 2 Season Flacsh — Cache-Hit-Statistik: getrennte Cache-Token-Spalten.
--
-- Hintergrund: Der JSONL-Watcher hat bis hier `tokens_in` als Summe aus
--   input_tokens + cache_creation_input_tokens + cache_read_input_tokens
-- in eine einzige Spalte geschrieben. Die drei Anteile waren auf Datenbank-
-- Ebene nicht mehr unterscheidbar — eine Cache-Hit-Rate-Statistik braucht
-- aber genau das Verhaeltnis `cache_read / tokens_in`.
--
-- Neue Spalten:
--   tokens_cache_creation: Tokens, die in einen NEUEN Prompt-Cache geschrieben
--     wurden (~Cache-Miss, der den Cache aufbaut).
--   tokens_cache_read:     Tokens, die aus dem bestehenden Cache GELESEN
--     wurden (~Cache-Hit, der Eingabe-Tokens spart).
-- Beide NOT NULL DEFAULT 0 — historische Rows landen damit auf 0, der
-- Watcher schreibt ab dem Patch dieser Season getrennt mit. `tokens_in`
-- bleibt aus Backward-Compat-Gruenden die Summe (alle Aggregate aus
-- Season 12/13/14 bleiben ungeschoren).
--
-- Backfill historischer Daten:
-- Wir leeren `messages`, `usage_buckets` und `jsonl_offsets`. Beim naechsten
-- App-Start liest der JSONL-Watcher (`ignoreInitial:false`) alle existierenden
-- JSONL-Dateien neu von Offset 0 und schreibt die getrennten Cache-Anteile
-- mit. Der Re-Scan ist einmalig (Migration laeuft nur einmal via
-- PRAGMA user_version).
--
-- Tradeoff: Pre-Hotfix-Sessions OHNE JSONL-Datei (dauerhaft resume-tot, siehe
-- Sprint-8-UX-Hint + Season-15-SEASON_LOG) verlieren ihre tokens_in/tokens_out-
-- Aggregate, weil der Re-Scan keine Quelle dafuer hat. Diese Sessions sind
-- aber ohnehin nicht mehr resume-faehig — wer sie noch im Verlauf-Panel hat,
-- sieht ab jetzt Token-Counts auf 0. Dokumentiert in TECH_SCHULDEN.md.

ALTER TABLE messages ADD COLUMN tokens_cache_creation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN tokens_cache_read INTEGER NOT NULL DEFAULT 0;

DELETE FROM messages;
DELETE FROM usage_buckets;
DELETE FROM jsonl_offsets;
