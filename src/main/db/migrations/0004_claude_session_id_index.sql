-- Sprint-9-Code-Review-Pass: Partial-Index für den Resume-Backfill-Watcher.
--
-- Hintergrund: nach dem Sprint-6-Hotfix laufen weiterhin Legacy-Sessions ohne
-- claude_session_id durch die DB. Der JSONL-Watcher matched pro Zeile gegen die
-- noch unaufgelösten Sessions (listMissingClaudeSessionId() + setClaudeSessionId()
-- in src/main/db/repos/sessions.ts). Mit wachsender sessions-Tabelle wird der
-- WHERE-Scan auf IS NULL spürbar — der Partial-Index enthält nur die noch zu
-- befüllenden Rows und schrumpft auf 0 Einträge, sobald das Backfill durch ist.
--
-- Idempotent via IF NOT EXISTS. Kein Daten-Migrations-Pass nötig — der Index
-- baut sich beim CREATE auf den Bestand auf.

CREATE INDEX IF NOT EXISTS idx_sessions_missing_claude_id
  ON sessions(id)
  WHERE claude_session_id IS NULL;
