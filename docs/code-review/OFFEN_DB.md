# OFFEN_DB.md – Datenschicht (better-sqlite3)

**Review-Datum:** 2026-05-11
**Reviewer:** Senior TS / Electron
**Status:** Erst-Review, 7 von 14 Befunden gefixed (siehe ✅-Marker)

**Validierung der Fixes:** `tsc --noEmit` + `eslint .` + `vitest run` → 396 Tests grün.

Bereich: `src/main/db/**` (connection, migrations, repos) + Schema-Quervergleich gegen `docs/TAKUMIDECK_ARCHITEKTUR.md` Kapitel 4.

Bewertungs-Skala:
- **B** = Bug / falsches Verhalten
- **S** = Schema-/Doc-Drift
- **D** = Defense-in-Depth (kein heutiger Bug, aber öffnet Tür)
- **P** = Performance
- **K** = Konsistenz / Stil-Drift

---

## Bugs / Korrektheit

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

### B-3 – `setUserVersion` läuft nur, wenn `highest > current` – nicht idempotent gegenüber „partiell angewendet"
**Datei:** `src/main/db/migrations.ts:64-66` – **NEU (Edge-Case, kein heutiger Bug)**

Wenn ein bestehender Build die DB schon mit Schema-Version N hat und die App
sich mit Build < N (Downgrade) öffnet, läuft die Schleife durch ohne `highest`
zu verändern → `setUserVersion` wird nicht aufgerufen. Korrekt. Aber: wenn
`runMigrations` jemals in einer Subprocess-Migration teil-läuft (z.B. via
`db.exec()` werfen einzelne Statements), wäre `highest` in JS-Scope schon
inkrementiert, die TX rollt zurück, der Caller liest aber den (jetzt
nicht-persistenten) Highest-Wert.

Heute fällt das nicht auf, weil der Caller in `connection.ts:31` den
Rückgabewert nur loggt. Sobald das Return jemals für Logik genutzt wird,
sollte `runMigrations` im Fehlerpfad einen sauberen Stand zurückgeben.

→ Fix-Vorschlag: `highest` erst am Ende der Schleife setzen *und* nach
`setUserVersion` zurückgeben (= Ist-Stand der DB).

---

## Schema-Drift / Doc-Drift

### S-1 – `messages.project_id` fehlt in `docs/TAKUMIDECK_ARCHITEKTUR.md` Kapitel 4
**Datei:** `docs/TAKUMIDECK_ARCHITEKTUR.md:221-229` vs. `src/main/db/migrations/0002_jsonl_offsets.sql:16` – **NEU**

Migration 0002 fügt `messages.project_id TEXT` (nullable, ohne FK) hinzu, die
Architektur-Doc führt `messages` weiterhin ohne diese Spalte. Da die Spalte
denormalisiert für Per-Projekt-Aggregate (Burn-Rate-Chart) gebraucht wird,
gehört sie ins Schema-Listing.

→ Doc-Update bei nächstem Trigger.

### S-2 – `sessions.claude_session_id` fehlt in der Architektur-Schema-Tafel
**Datei:** `docs/TAKUMIDECK_ARCHITEKTUR.md:206-219` vs. `src/main/db/migrations/0003_claude_session_id.sql` – **NEU**

Migration 0003 ergänzt `claude_session_id TEXT` (Resume-Hotfix), Architektur-Doc
nennt die Spalte nicht. Gleiches Pattern wie S-1.

→ Doc-Update bei nächstem Trigger.

### S-3 – `messages.role` hat keinen CHECK-Constraint trotz fixem Domain-Vokabular
**Datei:** `src/main/db/migrations/0001_init.sql:32` vs. `docs/TAKUMIDECK_ARCHITEKTUR.md:224` – **NEU**

Architektur: `role TEXT NOT NULL -- 'user' | 'assistant' | 'tool'`.
SQL: keine `CHECK(role IN (…))`-Klausel, kein TS-Enum-Guard im
`MessageInsert.role: string`. Heute schreibt nur der JSONL-Parser, daher
sind die drei Werte stabil — aber ein Code-Pfad mehr (Sprint 7+ schreibt z.B.
auch system-/tool_use-Rollen?) kippt die Annahme.

→ Empfehlung: `MessageInsert.role` auf einen Literal-Union typisieren
(`'user' | 'assistant' | 'tool'`), CHECK-Constraint optional.

### S-4 – `messages.project_id` ist ohne FK definiert
**Datei:** `src/main/db/migrations/0002_jsonl_offsets.sql:16` – **NEU**

`session_id` hat `REFERENCES sessions(id) ON DELETE CASCADE` (0001),
`project_id` (0002) bekommt diese FK nicht. Konsequenz:
`reassignSessionMessages` (`projects.ts:259`) kann theoretisch eine ungültige
Project-ID setzen, ohne dass die DB protestiert. Heute wird der Caller den
Wert vorher gegen die `projects`-Tabelle gematcht haben (Remap-Pass), aber das
ist ein App-Layer-Vertrauensbruch.

→ Architektur-Entscheidung: Soll `messages.project_id REFERENCES projects(id) ON DELETE CASCADE`? Mit dem bestehenden `session_id`-Cascade ist das fast redundant — aber Defense-in-Depth.

### S-5 – `usage_buckets`-Index ist redundant zur Primary-Key
**Datei:** `src/main/db/migrations/0001_init.sql:43, 52` – **NEU**

`usage_buckets` hat `PRIMARY KEY (bucket_start, model)`. Der explizite
`CREATE INDEX idx_usage_bucket ON usage_buckets(bucket_start)` ist redundant —
der PK-Index deckt Leading-Column-Lookups (`WHERE bucket_start BETWEEN …`)
bereits ab. Verifiziert in `usage.ts:140-162` — alle Queries filtern nach
`bucket_start` (Leading), niemals nach `model` allein.

→ Architektur 4 fordert diesen Index explizit. Doc-Update *oder* Index löschen
(spart minimal Speicherplatz). Nicht performance-kritisch, aber Doc/Code-Drift.

---

## Defense-in-Depth

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

---

## Performance

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

### P-2 – `reassignSessionMessages`-UPDATE rebuilt den `idx_messages_project_ts`-Index für alle messages der Session
**Datei:** `src/main/db/repos/projects.ts:259-262` – **bekannt akzeptabel**

Beim Remap (Sprint 4 / Sprint 5) wird `messages.project_id` für ggf. tausende
Rows pro Session umgeschrieben. SQLite muss den Index `idx_messages_project_ts`
für jede Row anfassen. Im Remap-Pass *einmalig* nach Initial-Scan akzeptabel —
aber falls der Pass jemals häufiger läuft (z.B. Project-Rename + Remap), wird
das spürbar.

→ Heute kein Bug, nur Awareness-Hinweis.

---

## Konsistenz / Stil-Drift

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

### K-2 – `listHistoryForProject` Cyclomatic-Hotspot ist berechtigt, aber Filter-Aufbau ist ein Refactor-Kandidat
**Datei:** `src/main/db/repos/sessions.ts:209-258` (SQL) und `:323-355` (InMemory) – **Tooling-Flag verifiziert**

Cyclomatic 20 entsteht durch 3 optionale Filter × Sub-Bedingungen × Bind-Aufbau.
Funktional korrekt, aber:

- Filter-Bau ist in SQL und In-Memory dupliziert (Drift-Gefahr: Filter X
  funktioniert in SQL, aber In-Memory-Test ignoriert ihn).
- Modell-Filter (Phase 2 laut Architektur 6.6) wird die Komplexität weiter
  treiben.

→ Refactor-Vorschlag (kein Auftrag, nur Skizze): Filter-Liste als reine
Daten-Struktur (`{ key: keyof SessionHistoryInput, sql: string, bindKey: string }`),
beide Treiber laufen die gleiche Liste durch und applizieren sie SQL-seitig vs.
In-Memory.

### K-3 – Mischung `?`-Bind und `@named`-Bind innerhalb desselben Repo
**Datei:** `src/main/db/repos/jsonl-offsets.ts:40 (`?`)` vs. `:43-48 (`@named`)` – **NEU**

Andere Repos sind innerhalb sich konsistent. Hier ist `get` mit `?` und
`upsert` mit `@named`. Nur Stil.

→ Auf `@named` vereinheitlichen (lesbarer bei mehreren Bindings).

### ✅ K-4 – `messages.lastUsageStmt` liefert kein `model`, aber der Doc-Comment verspricht es
**Datei:** `src/main/db/repos/messages.ts:18-19, 22-26, 62-65` – **NEU**

Comment Zeile 18-19: „liefert tokens_in/tokens_out, ts und das Modell, das in
der letzten Zeile stand". `LastUsageRow` (Zeile 22-26) hat aber kein `model`,
und `lastUsageStmt` (Zeile 62-65) selektiert keins.

→ Entweder Comment kürzen oder `model TEXT` aus `messages`-Tabelle mitziehen
(falls die Tabelle ein Modell-Feld bekommt — aktuell nicht, Modell hängt an
`usage_buckets`).

### K-5 – `migrations/0001_init.sql` nutzt `BOOLEAN`, das in SQLite zu INTEGER aliasiert
**Datei:** `src/main/db/migrations/0001_init.sql:8-9` – **NEU (klein)**

`added_manually BOOLEAN DEFAULT 0`, `has_git BOOLEAN DEFAULT 0`. SQLite hat
keinen BOOLEAN-Type → wird zu INTEGER (NUMERIC-Affinität). Funktioniert, aber:
- TS-Type `ProjectRow.added_manually: number` (kommentiert mit „SQLite BOOLEAN
  → 0/1") signalisiert dem Leser den Workaround.
- `INTEGER NOT NULL DEFAULT 0` wäre konsistent mit den anderen INT-Spalten.

→ Style-only, nicht in dieser Session anpacken.

### K-6 – `db.transaction(fn)` in `MigrationDriver` ignoriert Return-Wert
**Datei:** `src/main/db/connection.ts:25-28` – **NEU (klein)**

```ts
inTransaction: (fn) => {
  const tx = db.transaction(fn);
  tx();
}
```

better-sqlite3's `db.transaction(fn)` gibt eine Funktion zurück, die das Return
von `fn` durchreicht. Hier wird der Rückgabewert verworfen → ok für `void`-
Callbacks (wie aktuell), aber: wenn das Interface jemals einen Wert braucht
(`inTransaction<T>(fn: () => T): T`), muss der Driver mitziehen.

→ Heute kein Befund.

---

## Verifizierte Tooling-Hypothesen

| Tooling-Befund | Ergebnis |
|---|---|
| `sessions.ts:15-41` ↔ `types.ts:75-107` (33 Zeilen Cross-File-Duplikat) | **Bestätigt** — gewollt (Domain ≠ Persistenz), aber strukturell identisch → siehe K-1 |
| `sessions.ts:323` `listHistoryForProject` Cyclomatic 20 / CRAP 106 | **Bestätigt** — berechtigt durch Filter-Logik, Refactor-Kandidat → siehe K-2 |

---

## Was sauber ist (nicht im Report, aber bemerkenswert)

- WAL + `foreign_keys = ON` + `synchronous = NORMAL` + `busy_timeout = 5000`
  → solide Connection-Defaults für Persönliches Desktop-Tool.
- `allocateSeasonNumber` als atomare `db.transaction`-Allokation — saubere
  Lösung gegen Race zwischen schnellen Spawns (Architektur 6.6 „Lücken bei
  Abbruch akzeptiert" ist dokumentiert).
- `setClaudeSessionId` als idempotenter UPDATE mit `WHERE … AND
  claude_session_id IS NULL` → check-and-set ohne SELECT-Roundtrip. Sauber.
- `usage.upsertBucket` per `ON CONFLICT … DO UPDATE SET tokens = tokens +
  excluded.tokens` — kanonisches Upsert-Aggregat, ohne Race.
- Alle SQL-Statements in Repos sind prepared (außer den dynamischen Cases B-1
  und B-2). Keine String-Concat-Injections mit User-Input.
- Migrations sind in einer Transaction gewrappt → Crash-Recovery sauber.
- Repository-Pattern mit `InMemoryDriver` ist konsequent durchgezogen — Tests
  ohne native `better-sqlite3`-Dependency möglich (passt zur Windows-11-Dev-
  Setup-Memory: kein VS-Build-Tools-Zwang).

---

## Status

**Erledigt (2026-05-11):** B-1, B-2, D-1, D-2, K-1, K-4, P-1.

**Offen:**

- **B-3** — Migration-Runner-Edge-Case, kein heutiger Bug, nicht fixed.
- **S-1, S-2** — Schema-Drift in `docs/TAKUMIDECK_ARCHITEKTUR.md` Kapitel 4
  (fehlende Spalten `messages.project_id` + `sessions.claude_session_id`).
  Doc-Update wartet auf expliziten Trigger laut CLAUDE.md.
- **S-3** — CHECK-Constraint auf `messages.role` (Architektur-Entscheidung,
  ob über Migration nachgeschoben oder per Branded-Type genügt).
- **S-4** — FK auf `messages.project_id` (Architektur-Entscheidung).
- **S-5** — `idx_usage_bucket` redundant zur PK; Doc vs. Code abklären.
- **K-2** — Filter-Refactor in `listHistoryForProject` (Cyclomatic 20).
  Cache-Layer (B-2) entschärft die Performance, die Komplexität bleibt aber.
  Separat planen.
- **K-3, K-5, K-6** — reine Stil-Findings, nicht prioritär.
- **P-2** — Awareness-Hinweis, kein Fix nötig.

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (Migration 0009 `sessions.start_commit_sha` + neue `messages.timestampsInRange`-Methode für den 5h-Session-Block-Anker), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### P-3 – Kein Index auf `messages(ts)` für `timestampsInRange`-Hot-Path

**Datei:** `src/main/db/repos/messages.ts:136-141` (Statements) ↔ `src/main/db/migrations/0001_init.sql:51` + `0002_jsonl_offsets.sql:24` (vorhandene Indizes) – **NEU**

Die in v0.3.0 hinzugekommenen Prepared-Statements `tsRangeAllStmt` / `tsRangeFilterStmt` filtern `WHERE ts BETWEEN ? AND ?`, optional plus `model LIKE ?`. Die einzigen `messages`-Indizes sind aber `(session_id, ts)` und `(project_id, ts)` — beide haben `ts` nicht als Leading-Column und können einen reinen `ts`-Range nicht effizient bedienen. SQLite fällt damit auf einen Full-Table-Scan zurück. `collectBlockAnchors` in `usage/resolver.ts:170` ruft die Methode pro `resolveWindow` / `usage:resolve`-Call, d.h. effektiv pro UI-Refresh der Limit-Bars — bei wachsender messages-Tabelle wird der 5h-Bar spürbar langsamer.

Der v0.3.0-Commit-Text behauptet zwar, der vorhandene `idx_messages_session_ts`/`idx_messages_project_ts` decke ts-Range-Queries ab — das stimmt nur für *kombinierte* WHERE-Klauseln, nicht für die hier ausgeführte plain-ts-Range-Query.

→ Fix-Vorschlag: Mini-Migration 0010 mit `CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts)`. Alternativ `(ts, model)` falls Modell-Filter dominieren. Trigger: wenn eine User-Beobachtung „5h-Bar lädt langsam" auftaucht, oder beim nächsten Touch am Resolver-Pfad.

### S-6 – `timestampsInRange` JSDoc dokumentiert nicht die globale Aggregation

**Datei:** `src/main/db/repos/messages.ts:33-37` – **NEU**

Die Query summiert global über `messages` (kein Projekt-/Session-Scope). Für das aktuelle Feature (globaler 5h-Block der Anthropic-Quota) ist das die korrekte Anzeige — aber der Methoden-Name suggeriert keine Scope-Einschränkung und es gibt kein Dokumentations-Anker im JSDoc Zeile 33-37, der diese Absicht festhält. Bei späterer Wiederverwendung (z.B. Per-Projekt-Burn-Rate) leicht zu übersehen.

→ JSDoc um den expliziten „global über alle Sessions/Projekte"-Hinweis ergänzen. Beim nächsten Touch am Repo mitnehmen.

### K-7 – `setStartCommitSha`-Fehler werden im PTY-Caller in generische „revParse fehlgeschlagen"-Log-Message gepackt

**Datei:** `src/main/db/repos/sessions.ts:552-555` ↔ Caller `src/main/ipc/pty.ts:214-227` – **NEU (Stil-Drift)**

Der PTY-Caller wrapt den fire-and-forget Baseline-SHA-Capture in einem `.catch()`, der sowohl `revParse`-Fehler als auch DB-Fehler in einem generischen Log-Eintrag zusammenfasst („revParse für Baseline-SHA fehlgeschlagen"). Wenn `setStartCommitSha` (z.B. wegen DB-Lock) wirft, ist die Fehler-Quelle aus dem Log nicht erkennbar. Der Driver selbst hat keinen try/catch — das ist konsistent mit anderen Driver-Methoden, aber die irreführende Log-Message bleibt.

→ Im PTY-Handler den `.then()` separat fangen oder die Log-Message neutral formulieren („Baseline-SHA-Setzen fehlgeschlagen"). Keine Verhaltensänderung, nur Diagnose-Klarheit.

---

## Release-Review v0.4.0 (2026-05-29)

Befunde aus dem Release-Review von v0.3.2 → v0.4.0 (Migration 0010 `session_buffer_snapshots` + neues `SessionBufferRepository`, `sessions.ts` Insert-Vertrag auf `model: string | null` relaxiert), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### D-3 – `session_buffer_snapshots.snapshot` ist `NOT NULL` ohne `DEFAULT`

**Datei:** `src/main/db/migrations/0010_session_buffer_snapshots.sql:26` – **NEU**

Die Spalte ist `NOT NULL` ohne `DEFAULT`. Der Upsert reicht `snapshot` immer als Wert durch (kein NULL möglich), und das Skip-Gate gegen leere/whitespace-only Snapshots sitzt im Pure-Helper `trimBufferSnapshot` bzw. im IPC-Layer — nicht im Repo. Damit hängt die NOT-NULL-Integrität an einer Schicht außerhalb der Datenschicht. Innerhalb des DB-Scopes kein Bug, aber die Garantie ist nicht repo-lokal.

→ Defensiv könnte der Repo-Upsert einen leeren String hart ablehnen. Trigger: nächster Touch am `SessionBufferRepository`.

### D-4 – FK-Cascade nur gegen den echten SQLite-Treiber verifizierbar

**Datei:** `src/main/db/repos/session-buffer.ts:88-102` (InMemory-Driver) – **NEU**

Der `InMemorySessionBufferDriver` kennt keine FK-Beziehung zu Sessions. Die im Migration-Header versprochene `ON DELETE CASCADE`-Räumung ist nur gegen den echten SQLite-Treiber prüfbar, nicht im In-Memory-Pfad. Da es aktuell keinen produktiven `DELETE FROM sessions`-Pfad gibt (`project:remove` hängt Sessions auf den Default-Bucket um), ist die Cascade rein vorsorglich.

→ Bei Bedarf einen SQLite-Integrationstest ergänzen, der nach `DELETE FROM sessions` die Snapshot-Räumung prüft. Trigger: sobald ein echter `DELETE FROM sessions`-Pfad eingeführt wird.

### K-8 – `SessionBufferRepository.delete()` ist toter Code (Boundary-Vorhalt)

**Datei:** `src/main/db/repos/session-buffer.ts:24-27, 43-45, 81-83, 99-101` – **NEU**

`delete()` wird laut Kommentar nirgends aufgerufen (FK-Cascade reicht). Bewusst dokumentierter Vorhalt — sauber kommentiert, kein Risiko.

→ So belassen oder beim nächsten Touch entfernen, falls weiter ungenutzt. Trigger: wenn ein expliziter Snapshot-Lösch-Pfad gebraucht wird (dann wird die API genutzt) oder beim Aufräumen toter APIs.

### Notiz zu P-3 – Migrations-Nummer 0010 ist jetzt vergeben

Der für **P-3** (v0.3.0-Block, `idx_messages_ts`) vorgeschlagene Index war als „Mini-Migration 0010" skizziert. Migration 0010 ist inzwischen die Buffer-Snapshot-Tabelle. P-3 bleibt offen und muss künftig Nummer **0011+** nutzen. Keine neue Regression, nur eine Notiz für die P-3-Auflösung.
