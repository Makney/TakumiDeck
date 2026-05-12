# Code-Review — Bekannte offene Punkte (IPC-Handler)

Befunde aus dem Bereichs-Review IPC-Handler (2026-05-12), die bewusst nicht gefixt wurden. Sie sind hier dokumentiert, damit der nächste Review-Durchgang sie nicht erneut meldet.

Scope-Erinnerung: `src/main/ipc/*.ts` — Validation-Schicht zwischen Renderer und Main. Sender-Guard, zod-Schema-Parse, Result-Pattern, Path-Traversal-Schutz sind durchgängig vorhanden (Bereich-4-Vorgänger-Reviews haben die Hauptlücken B-1 bis B-6 bereits geschlossen — siehe Inline-Kommentare in den Handlern).

---

## Pfad-Leaks via zod-/Drittfehler-Messages bleiben prinzipiell möglich

- `src/main/ipc/settings.ts:18`, `src/main/ipc/settings.ts:30`, `src/main/ipc/app.ts:23`, `src/main/ipc/app.ts:37` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `errFromUnknown(e, 'CODE')` leitet den `Error.message` des aufgetretenen Fehlers an den Renderer durch. Bei zod-Validierungsfehlern enthält die Message den zod-Issue-Pfad samt Teil-Payload; bei `settings.read()` könnte ein interner JSON-Parse-Fehler einen Pfad-Hint mit dem `settings.json`-Pfad mitliefern. Die Handler `fs:*`, `git:*`, `project:read-claude-md`, `pty/session`-Spawn-Failures fangen ihren konkreten Side-Effect-Error bereits einzeln ab und ersetzen die Original-Message durch generischen Text (B-3, durchgängig dokumentiert in den Handler-Kommentaren). Der äußere `errFromUnknown`-catch in app/settings ist nur für nicht erwartete Internal-Errors.
- **Begründung:** Die verbleibenden Leak-Pfade sind sehr eng (außer-band-Errors, die im normalen Betrieb nicht auftauchen). Ein flächendeckendes Replacement durch eine generische Message würde die Diagnose-Qualität beim Entwickler-Debugging spürbar verschlechtern und gleichzeitig in einem privaten Daily-Driver-Tool keinen realen Angreifer-Pfad schließen (Renderer und Main laufen im selben Vertrauensbereich, der User ist der Owner der Daten). Konservativ als DbC dokumentiert.
- **Trigger:** sobald das Tool über ein lokales Single-User-Setup hinaus deployed wird — dann generische Error-Messages erzwingen und die Originale ausschließlich ins Log schreiben.

---

## `usage:heatmap` ist ein Stub ohne try/catch

- `src/main/ipc/usage.ts:78` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der Handler liefert konstantes `ok({ stub: true, message: '...' })` zurück und hat — im Unterschied zu allen anderen Handlern — keinen try/catch und keinen `errFromUnknown`-Fallback. Stilistisch eine Ausreißer-Implementierung.
- **Begründung:** Der Handler hat keinerlei Side-Effect, der werfen könnte (`Channels.UsageHeatmap` returnt einen statischen Stub bis Phase 2 das Feature aktiviert — siehe Architektur Kapitel 8). Ein try/catch wäre toter Code. Sobald Phase 2 die echte Heatmap-Implementierung einbaut, wird der Handler in die normale try/catch-Form gebracht.
- **Trigger:** Phase-2-Heatmap-Implementierung (`docs/roadmap/PHASE2.md`).

---

## `pty:create` reicht User-`model`-String unkontrolliert an `claude --model` weiter

- `src/main/ipc/pty.ts:131`, `src/main/ipc/session.ts:153` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Das `model`-Feld im PtyCreate/Resume-Schema ist `z.string().min(1)` ohne Whitelist. Der String fließt direkt als ARGV-Position in `claude --model <value>` ein. Die Renderer-Seite zeigt einen UI-Picker mit definierten Optionen, aber das Schema lässt jeden String zu.
- **Begründung:** ARGV-Positionen sind keine Shell-Eval — `--model XYZ` kann den `claude`-Subprozess höchstens „unknown model" antworten lassen, keine Code-Execution ausführen. Eine Whitelist (`sonnet|opus|haiku|...`) müsste regelmäßig an Anthropic-Modell-Releases angepasst werden und würde dem User die Möglichkeit nehmen, ein gerade veröffentlichtes Modell sofort zu nutzen, ohne TakumiDeck-Update.
- **Trigger:** wenn Anthropic für `claude --model` ein dokumentiertes ID-Schema liefert, das stabil validierbar ist (z.B. `^[a-z0-9-]+$`) — dann ein zod-Regex ergänzen.

---

## `pty:create` re-throwt Spawn-Error statt direkt `return err(...)` zu liefern

- `src/main/ipc/pty.ts:128-148` · Kategorie: **Verbesserung**
- **Beschreibung:** Im inneren try/catch um `manager.create(...)` wird bei Spawn-Fehlern der Lifecycle auf `error` gesetzt und dann `throw e` aus dem catch geworfen, damit der äußere catch (`errFromUnknown(e, 'PTY_CREATE')`) ihn fängt. Funktional korrekt, aber inkonsistent — `session:resume` macht es symmetrisch dazu in `pty.ts:158-169` mit `return err(...)` (= sauberer, weil der Error-Code dann fix `PTY_RESUME_SPAWN` ist statt eines aus `errFromUnknown` abgeleiteten Strings). Eine Konsolidierung würde in `pty:create` einen festen Code (`PTY_CREATE_SPAWN`) liefern und den Original-Error nur ins Log schreiben.
- **Begründung:** Reine Stilistik-Verbesserung — kein Bug, keine Security-Folge. Ein Fix würde den Error-Code ändern, was strenggenommen ein Renderer-sichtbares Vertrag-Detail ist; konservativ in OFFEN bis das nächste PTY-Feature den Block ohnehin anfasst.
- **Trigger:** nächste Änderung am PTY-Create-Spawn-Pfad (z.B. Worktree-Spawn in Phase 2) — dann gleich auf `return err(...)` umstellen.

---

## `session:update` ruft `sessions.update(..., {})` bei reinen Status-Patches

- `src/main/ipc/session.ts:43-52` · Kategorie: **Verbesserung**
- **Beschreibung:** Wenn der Renderer-Patch nur `status` enthält, läuft die Status-Transition durch den Lifecycle (DB-Write), und anschließend wird `sessions.update(sessionId, {})` mit einem leeren Rest-Patch aufgerufen. Das Repo erkennt den leeren Patch (`cleaned.length === 0`) und macht einen `findById`-Roundtrip. Funktional korrekt — nur ein überflüssiger Repo-Call.
- **Begründung:** Eine Konditionale (`if (Object.keys(restPatch).length > 0) sessions.update(...)`) wäre eine triviale Mikro-Optimierung ohne messbaren Effekt; im Tausch dafür wird die Branch-Komplexität erhöht. Konservativ in OFFEN — kein Bug.
- **Trigger:** wenn jemals ein Profiler-Hotspot in dem Handler-Pfad gemessen wird.

---

## Tooling-Hypothesen aus dem Fallow-Vor-Pass (verifiziert: bereits aufgelöst)

Die im Auftrag genannten Fallow-Hypothesen sind im Code bereits adressiert — sie tauchen im Bericht hier nur dokumentarisch auf, damit der nächste Review-Durchgang das nicht erneut nachzieht:

- `fs.ts:82-95` ↔ `fs.ts:155-167` (fs:read ↔ fs:write Project-Lookup + Anti-Traversal) → konsolidiert in `resolveValidatedProjectPath` (`src/main/ipc/fs.ts:192`). Inline-Kommentar verweist auf B-4/W-2.
- `pty.ts:132-146` ↔ `session.ts:154-164` (PtyManager-Spawn-Args) → die echte Duplikat-Stelle ist der Pre-Spawn-Check (Binary-Lookup + cwd-Existenz), nicht die Spawn-Args selbst. Konsolidiert in `src/main/pty/preSpawnCheck.ts`, beide Handler nutzen den Helper (W-1).
- Komplexitäts-Hotspots `session.ts:93` (Cyclo 11), `project.ts:64` (Cyclo 10), `app.ts:62` (Cyclo 8), `pty.ts:59` (Cyclo 8), `session.ts:62` (Cyclo 7): jede dieser Funktionen ist ein IPC-Handler, der eine echte Multi-Schritt-Orchestrierung (zod-Parse → DB-Lookup → State-Machine → Side-Effect → Result-Wrap) machen muss. Sender-Guard, zod-Parse und try/catch tragen pro Handler zwingend ~6 Branches bei. Der Pfad ist nicht produktiv aufteilbar, ohne den Lese-Fluss zu zersplittern — keine Refactoring-Aktion.

Ungenutzte Cross-Schemas aus Bereich 1 (`SessionUpdatePatchSchema`, `ClaudeMdOnDemandFileSchema`, `JsonlUsageSchema`, `SessionTypeSchema`, `SessionStatusSchema`): verifiziert — alle sind als interne Schema-Bestandteile in `src/shared/schemas.ts` referenziert (Composition aus dem Patch-Schema, dem OnDemand-Union-Member, dem JSONL-Outer-Schema bzw. den Filter-Listen). Keine Stelle, an der ein Handler ohne Validation gegen ein passendes Schema arbeitet.
