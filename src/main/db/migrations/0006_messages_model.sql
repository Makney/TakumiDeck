-- Phase 2 Season 10: messages.model traegt das pro Message in der JSONL
-- gemeldete Modell.
--
-- Hintergrund: Der JSONL-Parser (parser.ts) liest das Feld seit Sprint 5
-- aus, aber der Watcher-Insert hat es bis Season 10 verworfen — die
-- messages-Tabelle hatte keine model-Spalte. Phase-2-Season-10 baut den
-- Modell-Filter im Verlauf-Panel und braucht zusaetzlich eine
-- Aggregations-Sicht "wie oft kam welches Modell in dieser Session vor"
-- im Detail-Pane. Beides braucht die Spalte hier.
--
-- Nullable, weil (a) externe Sessions, deren JSONL kein message.model
-- liefert, weiterhin als NULL landen, und (b) der Backfill unten nur
-- Sessions trifft, die einen current_model-Wert haben.

ALTER TABLE messages ADD COLUMN model TEXT;

-- Backfill: alle bestehenden messages bekommen das current_model der
-- jeweiligen Session als Approximation zugewiesen. Das ist historisch
-- ungenau bei Sessions mit Modell-Wechsel (es gibt nur einen Wert pro
-- Session), aber der einzige verfuegbare Hint fuer Pre-Migration-Daten.
-- Ab dem Watcher-Patch dieser Season schreiben neue Messages das exakte
-- per-Message-Modell mit; die Verzerrung waechst sich also mit der Zeit
-- aus den aktiven Sessions heraus. TECH_SCHULDEN-Eintrag dokumentiert
-- die historische Ungenauigkeit.
UPDATE messages
SET model = (
  SELECT current_model FROM sessions WHERE sessions.id = messages.session_id
)
WHERE model IS NULL;
