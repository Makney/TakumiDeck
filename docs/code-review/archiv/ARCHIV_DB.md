# Code-Review · Datenschicht (better-sqlite3) · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_DB.md`](../OFFEN_DB.md) — Status **Behoben** oder **Gegenstandslos**.

---

## Erst-Review 2026-05-11 (B-1, B-2, D-1, D-2, P-1, K-1, K-4)

### ✅ B-1 – `SqliteSessionDriver.patch` kompiliert Statement bei jedem Call neu
**Datei:** `src/main/db/repos/sessions.ts:262-268` – **NEU**

`patch()` ruft jedes Mal `this.db.prepare(...)` und schmeißt das Statement nach
einem `run` weg. Alle anderen Methoden der Klasse cachen ihre Statements im
Constructor. Inkonsistenz + bei Bulk-Patches (z.B. `before-quit`-Handler patcht
alle `running`-Sessions auf `interrupted`) unnötiger Compile-Overhead pro Row.

→ Mögliche Fixe: (a) auf festen `UPDATE … SET title=COALESCE(@title,title), notes_md=COALESCE(@notes_md,notes_md), …`-Pattern wechseln und einmalig preparen; (b) Statement-Cache nach `keys.sort().join(',')` als Cache-Key.

### ✅ B-2 – `SqliteSessionDriver.listHistoryForProject` kompiliert ebenfalls jedes Statement neu
**Datei:** `src/main/db/repos/sessions.ts:209-258` – **NEU**

Selbe Klasse, gleiches Anti-Pattern: jeder History-Aufruf (= jeder Filter-Wechsel
und jeder Tastendruck in der Volltext-Suche, sofern der Renderer kein Debounce
hat) re-kompiliert die Query inklusive LEFT-JOIN-Aggregat. Bei einer
gewachsenen Messages-Tabelle merkbar.

→ Optionen: gleicher Statement-Cache wie B-1 (Cache-Key = Permutation der
gesetzten Filter); oder Prepared-Statement-Pool für die 8 fixen Kombinationen
(types-set/-leer × statuses-set/-leer × query-set/-leer).

### ✅ D-1 – `SqliteSessionDriver.patch` baut SQL aus den Object-Keys ohne Whitelist im Driver
**Datei:** `src/main/db/repos/sessions.ts:262-268` – **NEU**

Der Comment behauptet: „SQL-Spalten sind aus dem statischen
PatchKey-Whitelist-Universum, keine Injection."

Die Whitelist (`PATCHABLE_COLUMNS`) wird aber NUR in `SessionRepository.update`
(Zeile 127-133) angewandt. Der Driver selbst trifft keine Vorkehrung: wer
`SqliteSessionDriver.patch(id, {} as SessionPatch)` mit zur Compile-Zeit
ge-castetem Schund ruft, kommt durch — `keys.map(k => `${k} = @${k}`)` baut
das resultierende SQL.

Heute ist `SqliteSessionDriver` nur intern vom `SessionRepository` instanziert
(verifiziert: Grep), trotzdem würde ich die Whitelist im Driver wiederholen
oder den Driver `private` halten (Indirektion zur Klasse blockieren).

→ Vorschlag: identische `PATCHABLE_COLUMNS`-Filterung als Guard im
Driver-`patch`, oder `SessionPatch`-Type so eng schneidern, dass nur die
sechs erlaubten Properties typing-seitig setzbar sind (eigener Branded-Type).

### ✅ D-2 – `listAllStmt` interpoliert `DEFAULT_PROJECT_ID` als String-Literal in den ORDER-BY-Teil
**Datei:** `src/main/db/repos/projects.ts:207-210` – **NEU**

```ts
db.prepare<[], ProjectRow>(
  `${PROJECT_SELECT_WITH_COUNT}
   ORDER BY (p.id = '${DEFAULT_PROJECT_ID}') ASC, p.name COLLATE NOCASE ASC`,
);
```

Die Konstante ist hartcoded und kein User-Input — daher *kein heutiger
Injection-Vektor*. Aber:

- Stil-Drift: alle anderen Statements bevorzugen Bind-Parameter.
- Wenn die Konstante jemals durch ein Setting-Wert / Env-Var überschrieben
  wird, wird daraus ein echtes Loch.

→ Fix in 2 Minuten: Konstante per `?`-Bind übergeben, Statement nur einmal
preparen wie alle anderen.

### ✅ P-1 – Kein Index auf `sessions.claude_session_id`, obwohl `listMissingClaudeSessionId` und der Watcher danach lookupen
**Datei:** `src/main/db/migrations/0003_claude_session_id.sql` – **NEU**

`listMissingClaudeSessionId` (`sessions.ts:192`) macht
`SELECT * FROM sessions WHERE claude_session_id IS NULL`. Bei kleinen
Session-Mengen unkritisch, aber:

- Watcher liest pro JSONL-Zeile gegen `sessions` (Resume-Backfill).
- `setClaudeSessionId` (`sessions.ts:189-191`) ist ein Update via `id` (PK,
  schnell).
- Aber jede Backfill-Iteration triggert einen Full-Scan, solange `IS NULL`
  noch matched.

→ Vorschlag: `CREATE INDEX IF NOT EXISTS idx_sessions_missing_claude_id ON sessions(claude_session_id) WHERE claude_session_id IS NULL;` (Partial-Index, nur die unaufgelösten Sessions).

### ✅ K-1 – Cross-File-„Duplikat" `SessionInsert` ↔ `SessionRow` ist gewollt, aber Drift-anfällig
**Datei:** `src/main/db/repos/sessions.ts:15-31` ↔ `src/shared/types.ts:81-99` – **Tooling-Flag verifiziert**

Befund des `fallow dupes`-Passes bestätigt sich strukturell: beide Typen haben
identische Felder. Trennung ist konzeptuell sauber (Domain-Type für IPC vs.
Insert-Shape für DB-Schicht), aktuell aber redundant. Ein zukünftig neues Feld
muss an *beiden* Stellen ergänzt werden, oder die Schicht driftet.

→ Pragmatischer Fix: `export type SessionInsert = SessionRow` im Repo
(Insert-Shape erbt die Domain-Form). Architektur-Prinzip „Persistenz ≠
Domain" wird *nicht* verletzt, weil die DB-Spalten 1:1 mit den IPC-Feldern
identisch sind. Wenn das mal nicht mehr stimmt (z.B. ein internes
`updated_at`-DB-Feld), aufsplitten.

→ Gleiches Pattern wäre für `ProjectInsert` ↔ `ProjectRow` zu prüfen
(`projects.ts:32-40` ↔ `types.ts:211-220`): ProjectRow hat
`session_count: number` (Aggregat), ProjectInsert nicht — *hier* ist die
Trennung berechtigt.

### ✅ K-4 – `messages.lastUsageStmt` liefert kein `model`, aber der Doc-Comment verspricht es
**Datei:** `src/main/db/repos/messages.ts:18-19, 22-26, 62-65` – **NEU**

Comment Zeile 18-19: „liefert tokens_in/tokens_out, ts und das Modell, das in
der letzten Zeile stand". `LastUsageRow` (Zeile 22-26) hat aber kein `model`,
und `lastUsageStmt` (Zeile 62-65) selektiert keins.

→ Entweder Comment kürzen oder `model TEXT` aus `messages`-Tabelle mitziehen
(falls die Tabelle ein Modell-Feld bekommt — aktuell nicht, Modell hängt an
`usage_buckets`).

---

## Release-Review v0.3.0 (2026-05-19) → erledigt im DB-Review 2026-05-31

### ✅ P-3 – Kein Index auf `messages(ts)` für `timestampsInRange`-Hot-Path

**Erledigt 2026-05-31** (Migration `0011_stats_and_backfill_indexes.sql`, DB-Review). `CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)` angelegt. Die im Review festgestellte erweiterte Reichweite (siehe unten) wird damit voll abgedeckt: nicht nur `timestampsInRange`, sondern auch die globalen (`projectId === null`) Hot-Paths in `stats.ts`, `heatmap.ts` und `model-stats.ts`, die nur nach `ts >= ?` filtern. Migration 0011 ergänzt zusätzlich `idx_sessions_missing_claude_cwd` (Partial-Composite für den cwd-Backfill-Pfad).

**Datei:** `src/main/db/repos/messages.ts:136-141` (Statements) ↔ `src/main/db/migrations/0001_init.sql:51` + `0002_jsonl_offsets.sql:24` (vorhandene Indizes) – **NEU**

Die in v0.3.0 hinzugekommenen Prepared-Statements `tsRangeAllStmt` / `tsRangeFilterStmt` filtern `WHERE ts BETWEEN ? AND ?`, optional plus `model LIKE ?`. Die einzigen `messages`-Indizes sind aber `(session_id, ts)` und `(project_id, ts)` — beide haben `ts` nicht als Leading-Column und können einen reinen `ts`-Range nicht effizient bedienen. SQLite fällt damit auf einen Full-Table-Scan zurück. `collectBlockAnchors` in `usage/resolver.ts:170` ruft die Methode pro `resolveWindow` / `usage:resolve`-Call, d.h. effektiv pro UI-Refresh der Limit-Bars — bei wachsender messages-Tabelle wird der 5h-Bar spürbar langsamer.

Der v0.3.0-Commit-Text behauptet zwar, der vorhandene `idx_messages_session_ts`/`idx_messages_project_ts` decke ts-Range-Queries ab — das stimmt nur für *kombinierte* WHERE-Klauseln, nicht für die hier ausgeführte plain-ts-Range-Query.

→ Fix umgesetzt: Migration **0011** mit `CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)` (Nummer 0010 war zwischenzeitlich durch die Buffer-Snapshot-Tabelle vergeben).

### ✅ Notiz zu P-3 – Migrations-Nummer 0010 ist jetzt vergeben

Der für **P-3** (v0.3.0-Block, `idx_messages_ts`) vorgeschlagene Index war als „Mini-Migration 0010" skizziert. Migration 0010 ist die Buffer-Snapshot-Tabelle geworden, daher landete der Index erwartungsgemäß in **0011** (`0011_stats_and_backfill_indexes.sql`, 2026-05-31). P-3 damit erledigt.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_DB.md`](../OFFEN_DB.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### K-3 – Mischung `?`-Bind und `@named`-Bind innerhalb desselben Repo
**Datei:** `src/main/db/repos/jsonl-offsets.ts:40 (`?`)` vs. `:43-48 (`@named`)` – **NEU**

Andere Repos sind innerhalb sich konsistent. Hier ist `get` mit `?` und
`upsert` mit `@named`. Nur Stil.

→ Auf `@named` vereinheitlichen (lesbarer bei mehreren Bindings).

**Behoben:** 2026-06-01 · Stil-Vereinheitlichung · `getStmt` von positional `?` auf `@file_path` umgestellt (inkl. Statement-Typ + `.get({ file_path })`-Aufruf), konsistent mit dem `upsert`; typecheck + lint grün.

---

### S-6 – `timestampsInRange` JSDoc dokumentiert nicht die globale Aggregation

**Datei:** `src/main/db/repos/messages.ts:33-37` – **NEU**

Die Query summiert global über `messages` (kein Projekt-/Session-Scope). Für das aktuelle Feature (globaler 5h-Block der Anthropic-Quota) ist das die korrekte Anzeige — aber der Methoden-Name suggeriert keine Scope-Einschränkung und es gibt kein Dokumentations-Anker im JSDoc Zeile 33-37, der diese Absicht festhält. Bei späterer Wiederverwendung (z.B. Per-Projekt-Burn-Rate) leicht zu übersehen.

→ JSDoc um den expliziten „global über alle Sessions/Projekte"-Hinweis ergänzen. Beim nächsten Touch am Repo mitnehmen.

**Behoben:** 2026-06-01 · JSDoc-Ergänzung · Kommentar an `timestampsInRange` (Interface in `messages.ts`) um den expliziten „aggregiert GLOBAL über alle Sessions/Projekte, kein Scope-Filter"-Hinweis erweitert; typecheck grün.

---

### K-7 – `setStartCommitSha`-Fehler werden im PTY-Caller in generische „revParse fehlgeschlagen"-Log-Message gepackt

**Datei:** `src/main/db/repos/sessions.ts:552-555` ↔ Caller `src/main/ipc/pty.ts:214-227` – **NEU (Stil-Drift)**

Der PTY-Caller wrapt den fire-and-forget Baseline-SHA-Capture in einem `.catch()`, der sowohl `revParse`-Fehler als auch DB-Fehler in einem generischen Log-Eintrag zusammenfasst („revParse für Baseline-SHA fehlgeschlagen"). Wenn `setStartCommitSha` (z.B. wegen DB-Lock) wirft, ist die Fehler-Quelle aus dem Log nicht erkennbar. Der Driver selbst hat keinen try/catch — das ist konsistent mit anderen Driver-Methoden, aber die irreführende Log-Message bleibt.

→ Im PTY-Handler den `.then()` separat fangen oder die Log-Message neutral formulieren („Baseline-SHA-Setzen fehlgeschlagen"). Keine Verhaltensänderung, nur Diagnose-Klarheit.

**Behoben:** 2026-06-01 · Log-Message neutralisiert · Catch-Message im PTY-Caller von „revParse fuer Baseline-SHA fehlgeschlagen" auf „Baseline-SHA-Capture fehlgeschlagen" geändert (deckt revParse- UND `setStartCommitSha`-Fehler), mit Inline-Kommentar; keine Verhaltensänderung; typecheck + lint grün.
