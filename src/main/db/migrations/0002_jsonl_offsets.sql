-- Sprint-5-Schema-Erweiterung für das Token-Dashboard.
--
-- 1. messages.project_id: denormalisierte Spalte, damit Per-Projekt-Aggregate ohne
--    JOIN über sessions möglich sind (Burn-Rate-Charts pro Projekt). Wird beim
--    Insert aus dem zugehörigen session.project_id mitgeschrieben. Sessions, die
--    bereits in der Tabelle hängen würden, gibt es noch nicht — Sprint 5 ist der
--    erste Sprint, der messages-Rows anlegt.
-- 2. jsonl_offsets: Watcher-Persistenz. file_path ist der absolute Dateipfad zur
--    JSONL-Datei in ~/.claude/projects/. offset_bytes ist die zuletzt verarbeitete
--    Position (Tail-Read ab dort). last_seen_at = epoch-ms des letzten Reads, damit
--    wir verwaiste Offsets bei sehr alten Files später aufräumen können (Phase 2).
-- 3. Indizes: idx_messages_project_ts für die Per-Projekt-Aggregations-Queries
--    (5h-Bar pro Projekt, Burn-Rate-Diagramm). idx_messages_session_ts existiert
--    aus 0001_init und wird für die Per-Session-Kontext-Bar weiterverwendet.

ALTER TABLE messages ADD COLUMN project_id TEXT;

CREATE TABLE IF NOT EXISTS jsonl_offsets (
  file_path TEXT PRIMARY KEY,
  offset_bytes INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_project_ts ON messages(project_id, ts);
