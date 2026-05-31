-- Code-Review-Pass DB (2026-05-31): zwei Index-Additionen aus OFFEN_DB.
--
-- (1) idx_messages_ts — Auflösung von P-3 (ursprünglich nur timestampsInRange).
--     Seit den Stats-/Heatmap-/Model-Stats-Repos filtern mehrere globale
--     Hot-Path-Queries (q.projectId === null) nur nach `ts >= ?` bzw.
--     `ts BETWEEN ? AND ?`. Die vorhandenen Indizes (session_id, ts) und
--     (project_id, ts) haben `ts` nicht als Leading-Column und decken einen
--     reinen ts-Range nicht ab → Full-Table-Scan bei jedem globalen
--     Stats-/Heatmap-Refresh. Dieser Index bedient alle vier Pfade
--     (timestampsInRange, stats.sumTokens/countMessages, heatmap, model-stats).
--
-- (2) idx_sessions_missing_claude_cwd — schärft den Partial-Index aus 0004.
--     0004 indiziert sessions(id) WHERE claude_session_id IS NULL und bedient
--     damit listMissingClaudeSessionId(). Der zweite Backfill-Pfad
--     listMissingClaudeIdForCwd() filtert zusätzlich `cwd = ?` und sortiert
--     `started_at ASC` — dieser Composite-Partial-Index deckt beide ab und
--     bleibt durch das WHERE-Prädikat auf die noch unaufgelösten Rows klein
--     (schrumpft auf 0 Einträge, sobald das Backfill durch ist).
--
-- Idempotent via IF NOT EXISTS. Kein Daten-Migrations-Pass nötig — die Indizes
-- bauen sich beim CREATE auf den Bestand auf.

CREATE INDEX IF NOT EXISTS idx_messages_ts
  ON messages(ts);

CREATE INDEX IF NOT EXISTS idx_sessions_missing_claude_cwd
  ON sessions(cwd, started_at)
  WHERE claude_session_id IS NULL;
