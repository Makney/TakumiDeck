# Code-Review · Shared-Layer · Archiv (behobene Eintraege)

Archivierte Befunde aus [`OFFEN_SHARED.md`](../OFFEN_SHARED.md) — Status **Behoben** oder **Gegenstandslos**.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_SHARED.md`](../OFFEN_SHARED.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### `err()` lässt das `code`-Property weg, wenn `code === undefined`

- `src/shared/result.ts:9` · Kategorie: **Verbesserung**
- **Beschreibung:** `err()` returnt entweder `{ ok: false, error }` oder `{ ok: false, error, code }`, je nachdem, ob `code` übergeben wurde. Für TypeScript ist das identisch (`code?: string` deckt beides), aber bei JSON-Serialisierung über IPC unterscheidet sich das Wire-Format leicht (Property fehlt vs. `code: undefined`).
- **Begründung:** Aktuell rein kosmetisch — Renderer prüft `result.code` nur, wenn es relevant ist; beide Shapes liefern `undefined`. Vereinheitlichung wäre eine Zeile, lohnt aber den separaten Commit nicht.
- **Trigger:** wenn ein Konsument anfängt, `'code' in result`-Checks zu machen (statt `result.code !== undefined`).
- **Behoben:** 2026-06-01 · Vereinheitlichung Richtung „code immer als Key" · `err()`-Ternary zu einem `return { ok: false, error, code }` zusammengezogen, alle Error-Results tragen jetzt dieselbe Shape; `result.test.ts` angepasst; typecheck + result-Test grün.

---

### `GitSessionDiffInputSchema.sessionId` ist `min(1)`, andere session-Schemas verlangen `uuid()`

- `src/shared/schemas.ts:423-425` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `GitSessionDiffInputSchema` validiert `sessionId` als `z.string().min(1)`, während die meisten anderen session-bezogenen Schemas (`SessionCloseInputSchema`, `SessionResumeInputSchema`, `PtyWriteInputSchema` u.a.) `z.string().uuid()` verlangen. Precedent existiert in `TemplatesAllocateSeasonForSessionInputSchema` (ebenfalls `min(1)`), der Main resolved die ID anschließend gegen die DB → kein Sicherheitsrisiko, nur Stil-Drift.
- **Begründung:** Bei Gelegenheit auf `uuid()` heben oder das `min(1)`-Muster bewusst als Konvention festhalten. Heute kein Defekt.
- **Trigger:** nächstes Shared-Review oder wenn ein dritter Schema-Eintrag mit `min(1)` statt `uuid()` auftaucht — dann eine bewusste Konvention setzen.
- **Behoben:** 2026-06-01 · Variante C (beide `min(1)` auf `uuid()`) · `GitSessionDiffInputSchema` UND `TemplatesAllocateSeasonForSessionInputSchema` auf `z.string().uuid()` gehoben (volle Konsistenz mit den übrigen session-Schemas, kein `min(1)`-Ausreißer mehr); `multi-tab-diff.test.ts`-Fixtures auf gültige UUID-Konstanten umgestellt (Regel-4-Folge); typecheck + 17 Tests grün.

---

### `FsSetWatchedProjectInputSchema` ↔ Channel-Kommentar: undefined vs. null als Stop-Signal

- `src/shared/ipc-channels.ts:129-131` ↔ `src/shared/schemas.ts:423-425` · Kategorie: **Verbesserung-Doku**
- **Beschreibung:** Der Kommentar in `ipc-channels.ts:130` sagt „null stoppt den Watcher". Schema und Type fordern aber explizit `projectId: string | null` als Pflichtfeld — `undefined` oder fehlendes Feld würden bei der zod-Parse failen. Das ist beabsichtigt (eindeutiger Vertrag), und der Renderer setzt das Feld auch immer. Kleine Doku-Inkonsistenz, falls jemand annimmt, `null` und „nicht-gesetzt" wären äquivalent.
- **Begründung:** Bei der nächsten Doku-Politur klarstellen, dass `projectId` als Pflichtfeld mit `null` als Stop-Signal gilt.
- **Trigger:** nächste Änderung am `fs:set-watched-project`-Vertrag oder Doku-Review der Channels-Datei.
- **Behoben:** 2026-06-01 · Kommentar-Klarstellung · Channel-Kommentar an `ipc-channels.ts:130` präzisiert (`projectId` Pflichtfeld `string | null`, nur explizit `null` stoppt, fehlend/undefined failt zod); veraltete Zeilen-Refs aktualisiert; typecheck grün.
