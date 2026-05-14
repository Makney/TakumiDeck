-- Phase 2 Season 15: sessions.jsonl_path = vollstaendiger Pfad zur passenden
-- claude-code JSONL-Datei (~/.claude/projects/<encoded-cwd>/<claude-uuid>.jsonl).
--
-- Hintergrund: Bis Phase 2 Season 9 hat der Watcher Sessions ueber zwei Pfade
-- aufgeloest — primaer via sessions.claude_session_id (UUID-First, Season 9),
-- sekundaer via encodeCwd-Match auf running/idle-Sessions. Beide Pfade muessen
-- pro Watcher-Tick den Filename parsen und entweder eine Repo-Query laufen oder
-- mehrere Status-Listen scannen.
--
-- Mit der jsonl_path-Spalte kann der Watcher direkt per `WHERE jsonl_path = ?`
-- in einer einzigen Index-Lookup-Query treffen — gleichzeitig haelt sie die
-- Quelle der Wahrheit dafuer, gegen welchen Datei-Pfad eine Session geliefert
-- wird (relevant fuer den Polling-Ring aus dieser Season, der pro aktiver
-- Session einen fs.stat-Loop laufen laesst).
--
-- Befuellungs-Pfade:
-- 1. Beim Spawn AB Season-15-Patch sofort gesetzt — wir kennen den erwarteten
--    Pfad aus cwd + sessionId.
-- 2. Vom JSONL-Watcher rueckwirkend gesetzt, sobald er eine Session per UUID-
--    Match aufloest (vorher fehlte der Pfad bei Pre-Hotfix-Sessions).
-- 3. Vom Boot-One-Shot-Backfill dieser Season, der resume-tote Multi-Session-
--    Bestaende ueber den encodeCwd-Bucket plus mtime-Ordering nach started_at-
--    Reihenfolge verteilt.
--
-- Spalte ist nullable, weil (a) Legacy-Sessions ohne JSONL nie einen Pfad
-- bekommen koennen (Sprint-8-UX-Hint deckt das ab), und (b) der Boot-Pass
-- erst nach App-Start laeuft — bis dahin bleiben die noch nicht migrierten
-- Sessions auf NULL.
ALTER TABLE sessions ADD COLUMN jsonl_path TEXT;

-- Watcher-Hot-Path: pro chokidar-change / Polling-Tick ein Lookup per
-- jsonl_path. UNIQUE waere logisch korrekt (= 1:1-Mapping), wuerde aber den
-- Backfill bei Filename-Kollisionen blockieren (claude reused gelegentlich
-- dieselbe UUID nach einem Reset). Wir lassen den Index non-unique und
-- bilden Tie-Break = juengste Session wie beim Sprint-6-Hotfix nach.
CREATE INDEX IF NOT EXISTS idx_sessions_jsonl_path
  ON sessions(jsonl_path)
  WHERE jsonl_path IS NOT NULL;
