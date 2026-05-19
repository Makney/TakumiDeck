# Code-Review — Bekannte offene Punkte (Shared)

Befunde für `src/shared/{types,ipc-channels,schemas,result,constants}.ts`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md). Pro Eintrag: Datei:Zeile, Kategorie, Beschreibung, Begründung, optional Trigger.

---

## Review-Durchgang 2026-05-11 — Sprint-9-Abschluss

Bereich-Shared-Review nach Sprint 9. Die behobenen Punkte (B-1 tote Channels, W-1 ClaudeMdFrontmatter-Drift, W-2 WindowActionSchema, W-3 ProjectAddInputSchema + UsageHeatmapInputSchema, W-4 ungenutzte Type-Exports) sind im aktuellen Stand bereits korrigiert und stehen nicht hier.

### Strukturell identische `sessionId/cols/rows`-Schemas in PtyResize und SessionResume

- `src/shared/schemas.ts:91` (PtyResizeInputSchema) und `src/shared/schemas.ts:124` (SessionResumeInputSchema) · Kategorie: **Design-by-Choice**
- **Beschreibung:** Beide Schemas haben dieselbe Shape (`sessionId: uuid`, `cols: int positive`, `rows: int positive`). Tooling (`npx fallow dupes`) meldet das als Duplikat (14 Zeilen).
- **Begründung:** Semantisch sind die zwei Operationen unabhängig — PtyResize arbeitet auf einem laufenden PTY, SessionResume startet ihn neu. Eine Basis-Schema-Extraktion wäre Premature Abstraction (CODING_RULES → Simplicity First); zudem dürfen die beiden Felder-Sets künftig divergieren (z.B. wenn Resume zusätzliche Felder bekommt), ohne ein gemeinsames Basis-Schema zu brechen.
- **Trigger:** sobald ein dritter Schema-Konsument mit derselben Shape entsteht — dann das Basis-Schema einführen.

### Intern verwendete Schemas, die als `export` deklariert sind

- `src/shared/schemas.ts:60` `SessionTypeSchema`
- `src/shared/schemas.ts:62` `SessionStatusSchema`
- `src/shared/schemas.ts:102` `SessionUpdatePatchSchema`
- `src/shared/schemas.ts:214` `ClaudeMdOnDemandFileSchema`
- `src/shared/schemas.ts:253` `JsonlUsageSchema`
- Kategorie: **Design-by-Choice**
- **Beschreibung:** Diese fünf Schemas werden ausschließlich intra-file (z.B. `SessionTypeSchema` in `PtyCreateInputSchema` und `SessionHistoryInputSchema`) konsumiert, sind aber `export`-deklariert. Tooling (`npx fallow dead-code`) flaggt sie als „ungenutzt", weil es Intra-File-Referenzen nicht auflöst.
- **Begründung:** Bewusst exportiert für Konsistenz mit dem Single-Source-of-Truth-Pattern — andere Module (Tests, künftige Renderer-Validation) können sie ohne erneute Definition wiederverwenden. Drop auf `const` ohne `export` wäre möglich, hätte aber den Folge-Aufwand, ihn beim ersten externen Konsumenten wieder rückgängig zu machen.
- **Trigger:** sobald ein Lint-Rule für `no-unused-exports` eingeführt wird — dann pro Schema entscheiden: exportieren behalten + dort konsumieren, oder Export entfernen.

### `err()` lässt das `code`-Property weg, wenn `code === undefined`

- `src/shared/result.ts:9` · Kategorie: **Verbesserung**
- **Beschreibung:** `err()` returnt entweder `{ ok: false, error }` oder `{ ok: false, error, code }`, je nachdem, ob `code` übergeben wurde. Für TypeScript ist das identisch (`code?: string` deckt beides), aber bei JSON-Serialisierung über IPC unterscheidet sich das Wire-Format leicht (Property fehlt vs. `code: undefined`).
- **Begründung:** Aktuell rein kosmetisch — Renderer prüft `result.code` nur, wenn es relevant ist; beide Shapes liefern `undefined`. Vereinheitlichung wäre eine Zeile, lohnt aber den separaten Commit nicht.
- **Trigger:** wenn ein Konsument anfängt, `'code' in result`-Checks zu machen (statt `result.code !== undefined`).

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (neue Channels `fs:set-watched-project`, `fs:changed`, `git:show-staged`, `git:session-diff`, plus die vier `updater:*`-Channels), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `GitSessionDiffInputSchema.sessionId` ist `min(1)`, andere session-Schemas verlangen `uuid()`

- `src/shared/schemas.ts:423-425` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `GitSessionDiffInputSchema` validiert `sessionId` als `z.string().min(1)`, während die meisten anderen session-bezogenen Schemas (`SessionCloseInputSchema`, `SessionResumeInputSchema`, `PtyWriteInputSchema` u.a.) `z.string().uuid()` verlangen. Precedent existiert in `TemplatesAllocateSeasonForSessionInputSchema` (ebenfalls `min(1)`), der Main resolved die ID anschließend gegen die DB → kein Sicherheitsrisiko, nur Stil-Drift.
- **Begründung:** Bei Gelegenheit auf `uuid()` heben oder das `min(1)`-Muster bewusst als Konvention festhalten. Heute kein Defekt.
- **Trigger:** nächstes Shared-Review oder wenn ein dritter Schema-Eintrag mit `min(1)` statt `uuid()` auftaucht — dann eine bewusste Konvention setzen.

### `FsSetWatchedProjectInputSchema` ↔ Channel-Kommentar: undefined vs. null als Stop-Signal

- `src/shared/ipc-channels.ts:113-115` ↔ `src/shared/schemas.ts:385-387` · Kategorie: **Verbesserung-Doku**
- **Beschreibung:** Der Kommentar in `ipc-channels.ts:114` sagt „null stoppt den Watcher". Schema und Type fordern aber explizit `projectId: string | null` als Pflichtfeld — `undefined` oder fehlendes Feld würden bei der zod-Parse failen. Das ist beabsichtigt (eindeutiger Vertrag), und der Renderer setzt das Feld auch immer. Kleine Doku-Inkonsistenz, falls jemand annimmt, `null` und „nicht-gesetzt" wären äquivalent.
- **Begründung:** Bei der nächsten Doku-Politur klarstellen, dass `projectId` als Pflichtfeld mit `null` als Stop-Signal gilt.
- **Trigger:** nächste Änderung am `fs:set-watched-project`-Vertrag oder Doku-Review der Channels-Datei.
