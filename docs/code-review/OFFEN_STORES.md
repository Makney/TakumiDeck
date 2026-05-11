# Code-Review — Bekannte offene Punkte (Renderer-Stores / Zustand)

Befunde aus dem Stores-Review, die **bewusst nicht gefixt** werden.

---

## Format pro Eintrag

- `###`-Überschrift mit kurzer Kennung
- Datei + Zeilenreferenz (`datei.ext:42`)
- **Kategorie:** Bug / Warnung / Verbesserung / Design-by-Choice
- **Beschreibung:** 1–3 Sätze, was der Befund ist
- **Begründung:** warum er offen bleibt
- Optional **Trigger:** unter welcher Bedingung der Befund doch angegangen wird

---

### nextTab / prevTab — Inline-Duplikat statt Direction-Helper

- `src/renderer/stores/sessions.ts:144-152` ↔ `:154-162` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `nextTab` und `prevTab` haben fast identische Bodies — bis auf die Index-Rotationsformel `(idx + 1) % len` vs. `(idx - 1 + len) % len`. Ein Helper `rotateActive(projectId, direction)` würde das Duplikat entfernen.
- **Begründung:** Die Funktionen sind jeweils nur ~9 Zeilen, das gemeinsame Skelett ist klein. Ein extrahierter Helper würde durch den `direction`-Parameter und das Re-Verteilen der Calls nicht wesentlich an Klarheit gewinnen. Surgical-Changes-Prinzip (CODING_RULES.md): Premature-Abstraction vermeiden, solange nicht ein dritter Call-Site auftaucht.
- **Trigger:** Sobald eine dritte Rotations-Variante dazukommt (z.B. „springe zu Tab X" mit Index-Berechnung), den Helper extrahieren und alle drei Stellen darüber laufen lassen.

### Exportierte interne Helfer (`fileTabId`, `pickNextActive`) ohne externe Konsumenten

- `src/renderer/stores/fileTabs.ts:400` `fileTabId`, `src/renderer/stores/sessions.ts:74` `pickNextActive` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `fallow dead-code` meldet beide Funktionen als nur intern verwendet (jeweils ein Call innerhalb derselben Datei). Aktuell kein externer Konsument.
- **Begründung:** Beide sind pure Funktionen mit klar definiertem Vertrag. `fileTabId` ist die kanonische ID-Konvention (`file:${relPath}`) — als API-Surface sinnvoll, falls künftige Stellen (z.B. URL-Routing oder Tab-Linking) Tabs aus dem Stack referenzieren. `pickNextActive` bleibt exportiert, weil es einen testbaren Branch-Algorithmus kapselt, der ohne Store-Instanz isoliert verifiziert werden kann.
- **Trigger:** Falls in einem späteren Review klar wird, dass keine geplante Konsumenten-Stelle existiert, Export entfernen (`export function` → `function`).

### Ungenutzte Type-Exports (`FileTabKind`, `AddTabInput`)

- `src/renderer/stores/fileTabs.ts:20` `FileTabKind`, `src/renderer/stores/sessions.ts:30` `AddTabInput` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `fallow` meldet beide Types als nur dateiintern verwendet (in `FileTab.kind` bzw. `addTab`-Signature). Externe Importe gibt es aktuell nicht.
- **Begründung:** Beide gehören zur publik exportierten Store-API als unterstützende Types: `FileTabKind` für Konsumenten, die in UI-Logik auf `tab.kind` matchen, `AddTabInput` für Caller, die das Argument-Object explizit typisieren wollen (statt nur über Inferenz). Type-only-Exports kosten keinen Runtime-Aufwand.
- **Trigger:** Bei einer großen API-Surface-Bereinigung später (z.B. Phase 2-Refactor der Tab-Stores) gemeinsam mit anderen Exports prüfen.

---

## Pflege-Regeln

- Einträge werden **nicht gelöscht**, wenn sie verschwinden — stattdessen als *behoben* markieren und mit Datum + Referenz auf den CHANGELOG-Eintrag annotieren.
- **Keine Gummiband-Einträge.** Wenn ein Befund hier landet, soll er so konkret sein, dass ein späterer Review-Agent ihn eindeutig wiedererkennt und nicht noch einmal meldet.
