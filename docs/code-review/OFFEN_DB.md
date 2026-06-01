# OFFEN_DB.md – Datenschicht (better-sqlite3)

**Review-Datum:** 2026-05-11 (aktualisiert 2026-05-31)
**Reviewer:** Senior TS / Electron

> **Behobene Befunde** sind ins Archiv ausgelagert: [`archiv/ARCHIV_DB.md`](./archiv/ARCHIV_DB.md).
> Diese Datei führt nur noch die **offenen** Punkte.

Bereich: `src/main/db/**` (connection, migrations, repos) + Schema-Quervergleich gegen `docs/TAKUMIDECK_ARCHITEKTUR.md` Kapitel 4.

Bewertungs-Skala:
- **B** = Bug / falsches Verhalten
- **S** = Schema-/Doc-Drift
- **D** = Defense-in-Depth (kein heutiger Bug, aber öffnet Tür)
- **P** = Performance
- **K** = Konsistenz / Stil-Drift

---

## Bugs / Korrektheit

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
(`'user' | 'assistant' | 'tool'`), CHECK-Constraint optional. Gekoppelt an die
`lastRoleForSession`-Kollabierung (Kommentar in `messages.ts`, DB-Review 2026-05-31).

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

## Performance

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
| `sessions.ts:15-41` ↔ `types.ts:75-107` (33 Zeilen Cross-File-Duplikat) | **Bestätigt** — gewollt (Domain ≠ Persistenz), aber strukturell identisch → siehe K-1 (archiviert) |
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
- Alle SQL-Statements in Repos sind prepared. Keine String-Concat-Injections
  mit User-Input.
- Migrations sind in einer Transaction gewrappt → Crash-Recovery sauber.
- Repository-Pattern mit `InMemoryDriver` ist konsequent durchgezogen — Tests
  ohne native `better-sqlite3`-Dependency möglich (passt zur Windows-11-Dev-
  Setup-Memory: kein VS-Build-Tools-Zwang).

---

## Status

**Behoben (siehe [archiv/ARCHIV_DB.md](./archiv/ARCHIV_DB.md)):** B-1, B-2, D-1, D-2, K-1, K-4, P-1 (Erst-Review 2026-05-11) · P-3 + „Notiz zu P-3" (DB-Review 2026-05-31) · K-3, S-6, K-7 (OFFEN-Abarbeiten 2026-06-01).

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
- **K-5, K-6** — reine Stil-Findings, nicht prioritär.
- **P-2** — Awareness-Hinweis, kein Fix nötig.
- **D-3, D-4, K-8** — siehe v0.4.0-Block unten.

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (Migration 0009 `sessions.start_commit_sha` + neue `messages.timestampsInRange`-Methode für den 5h-Session-Block-Anker), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden. *(P-3 aus diesem Block ist erledigt → Archiv.)*

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
