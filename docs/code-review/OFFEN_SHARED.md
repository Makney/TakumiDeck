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
