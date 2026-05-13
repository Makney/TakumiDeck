"""Lokaler DB-Inspektor fuer die TakumiDeck-Dev-Datenbank.

Liest read-only aus %APPDATA%/TakumiDeck-dev/data.sqlite und gibt Diagnose-
Bloecke aus (Row-Counts, aktive Sessions, Top-Sessions nach Message-Count,
Schema der messages-Tabelle, letzte Messages global). Read-only-URI
verhindert versehentliches Schreiben durch eine fehlerhafte Erweiterung.

Hinweis: better-sqlite3 nutzt im Main-Prozess WAL-Modus. Wenn `npm start`
parallel laeuft, kann der Snapshot hier den letzten Insert nicht enthalten —
fuer konsistente Reads die App vor dem Inspect schliessen.
"""

import os
import sqlite3

db_path = os.path.join(os.environ['APPDATA'], 'TakumiDeck-dev', 'data.sqlite')
# Read-only-Connection via URI. `immutable=1` waere noch strenger (kein
# WAL-Read), wuerde aber bei laufender App schiefgehen — `mode=ro` reicht
# als Schutz gegen versehentliche Mutation.
db = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
c = db.cursor()

print('=== Counts ===')
for t in ['sessions', 'messages', 'usage_buckets', 'jsonl_offsets', 'projects']:
    print(f'{t}:', c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0])
print()
print('=== Active sessions (running/idle) ===')
for r in c.execute("SELECT id, status, current_model, cwd, started_at FROM sessions WHERE status IN ('running', 'idle')"):
    print(r)
print()
print('=== messages by session_id (top 10) ===')
for r in c.execute('SELECT session_id, COUNT(*) AS cnt, SUM(tokens_in) AS tin, MAX(ts) AS last_ts FROM messages GROUP BY session_id ORDER BY cnt DESC LIMIT 10'):
    print(r)
print()
print('=== messages columns ===')
for r in c.execute('PRAGMA table_info(messages)'):
    print(r)
print()
print('=== last 3 messages overall ===')
for r in c.execute('SELECT session_id, project_id, tokens_in, ts FROM messages ORDER BY ts DESC LIMIT 3'):
    print(r)
