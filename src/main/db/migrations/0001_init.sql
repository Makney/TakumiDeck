-- Initial-Schema für TakumiDeck (Architektur Kapitel 4).
-- Sprint 1 erstellt nur die Tabellen; Befüllung folgt in späteren Sprints.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  added_manually BOOLEAN DEFAULT 0,
  has_git BOOLEAN DEFAULT 0,
  next_season_number INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  season_number INTEGER,
  status TEXT NOT NULL,
  current_model TEXT,
  worktree_branch TEXT,
  notes_md TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_buckets (
  bucket_start INTEGER NOT NULL,
  model TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  PRIMARY KEY (bucket_start, model)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_ts ON messages(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_usage_bucket ON usage_buckets(bucket_start);
