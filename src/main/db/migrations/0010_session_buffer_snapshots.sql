-- Phase 2 Season 32: Terminal-Buffer-Persistierung ueber Resume (Option 2 —
-- nur Terminal-Sessions). Eigene Tabelle statt einer Spalte auf `sessions`,
-- weil
--   (a) der Snapshot bis 256 KiB pro Session gross werden kann und die
--       Verlauf-Listing-Query in `listHistoryForProject` ein `SELECT s.*`
--       macht — die Spalte wuerde bei 50+ Sessions im Verlauf-Panel pro
--       Klick mehrere MB durch SQLite ziehen, obwohl die Anzeige sie nie
--       braucht.
--   (b) Nur Terminal-Sessions schreiben hier rein (claude-Sessions rendern
--       ihren Verlauf beim --resume aus der JSONL ohnehin neu). Eine
--       optionale Spalte waere im Datenmodell unehrlich — Tabelle macht
--       die Zugehoerigkeit explizit.
--
-- FK ON DELETE CASCADE haengt den Snapshot an die Session: ein
-- `DELETE FROM sessions` (z.B. `project:remove` -> Bulk-Update auf
-- Default-Bucket — der wirft Sessions nicht, der `removeProjectTxn`-Pfad)
-- raeumt den Snapshot mit ab; manuelles Cleanup ist nicht noetig.
--
-- Schreib-Pfad: TerminalTab-Cleanup im Renderer serialisiert via
-- @xterm/addon-serialize, trimt auf Last-N-Zeilen + Byte-Cap und ruft den
-- terminal:save-buffer-IPC. Lese-Pfad: TerminalTab-Mount fuer
-- terminal-Sessions mit needsSpawn=false ruft terminal:load-buffer und
-- spielt das Ergebnis vor dem ersten PTY-Frame in xterm zurueck.
CREATE TABLE IF NOT EXISTS session_buffer_snapshots (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
