# Code-Review — Bekannte offene Punkte (IPC-Handler)

Befunde aus dem Bereichs-Review IPC-Handler (2026-05-12), die bewusst nicht gefixt wurden. Sie sind hier dokumentiert, damit der nächste Review-Durchgang sie nicht erneut meldet.

> **Behobene Befunde** sind ins Archiv ausgelagert: [`archiv/ARCHIV_IPC.md`](./archiv/ARCHIV_IPC.md). Diese Datei führt nur noch die **offenen** Punkte.

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

## Release-Review v0.2.0 (2026-05-17)

Befunde aus dem Release-Review von v0.1.2 → v0.2.0, die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `docs:sync-status` / `docs:on-demand-status` ohne DEFAULT-Projekt-Guard

- `src/main/ipc/docs.ts:53`, `src/main/ipc/docs.ts:99` · Kategorie: **Warnung**
- **Beschreibung:** Der Season-21/22-Handler `registerDocsIpc` resolved `projects.getById(input.projectId)` und arbeitet danach mit `project.path` weiter. Wenn der Renderer den Legacy-Bucket (`DEFAULT_PROJECT_ID`) übergibt, ist `project.path` der Wert von `settings.workspace_path` zum Zeitpunkt von `ensureDefaultProject` — nach Wizard-Skip (Season 18) kann der leer sein. `path.join('', 'docs/CHANGELOG.md')` resolved dann relativ zur Process-CWD des Electron-Mains; im Dev-Modus zufällig das TakumiDeck-Repo selbst, im Produktiv-Build typischerweise ENOENT → `state: 'missing-source'` (harmlos). Inkonsistent zum Schwester-Handler `templates:resolve-auto-vars`, der DEFAULT explizit per `isDefault`-Branch ausschließt (`src/main/ipc/templates.ts:105`).
- **Begründung:** Renderer öffnet das NewSessionModal realistisch nur für ein User-Projekt aus der Sidebar, nicht für den Legacy-Bucket. Kein Datenverlust, kein Sicherheits-Surface (relative Reads landen bei ENOENT auf `missing-source`). Der Guard wäre zwei Zeilen, lohnt aber den eigenen Patch-Commit nicht — beim nächsten Touch am `docs.ts`-Handler gleich mitnehmen.
- **Trigger:** nächste Änderung am `docs:sync-status`-Pfad (z.B. wenn der Status-Resolver weitere File-Reads bekommt) — dann analog zu `templates.ts:105` einen `isDefault`-Branch ergänzen und in beiden Handlern `PROJECT_DEFAULT_IMMUTABLE` als Error-Code zurückgeben.

### `pty:exit` und State-Detection-Loop pushen denselben `SessionStatusPush`-Channel

- `src/main/ipc/pty.ts:75-83` ↔ `src/main/sessions/state-detection-loop.ts` · Kategorie: **Verbesserung**
- **Beschreibung:** Season-21 hat dem `pty:exit`-Handler einen zusätzlichen `Channels.SessionStatusPush`-Send hinzugefügt, damit eine im Hintergrund auf `completed`/`interrupted`/`error` gewanderte Session sofort im Verlauf-Panel erscheint. Der State-Detection-Loop sendet denselben Channel für `running`/`idle`/`waiting`/`permission-prompt`. Die Events tragen keine Sequenz-ID, eine ungünstige Reihenfolge (Loop-Tick zwischen `pty:exit`-DB-Write und `SessionStatusPush`-Receive im Renderer) könnte einen kurzen Status-Flicker erzeugen.
- **Begründung:** Renderer-Seite filtert defensiv (`HistoryPane.tsx:198`: `if (existing.status === event.status) return prev` und vergleichbare Stelle im Store). Ein Echo führt zu einer No-Op statt einem falschen Status. Praktisch im Daily-Use nicht beobachtbar. Korrelations-IDs einzuführen wäre ein eigenständiger Refactor mit Schema-Erweiterung (`SessionStatusPushEvent` um `seq` oder `source`-Feld).
- **Trigger:** wenn ein User-Report „Status flackert kurz nach Session-Ende" auftaucht oder die State-Detection-Loop um eine weitere Status-Quelle erweitert wird (dritter Sender macht die Reihenfolgen-Annahme brüchig).

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (vier neue Channels: `fs:set-watched-project`, `fs:changed`, `git:show-staged`, `git:session-diff` + Updater-IPC), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `git:session-diff` kollabiert `has_git=0` und `baseline=null` in identischen Empty-State

- `src/main/ipc/git.ts:174` · Kategorie: **Verbesserung**
- **Beschreibung:** Der Handler behandelt zwei semantisch unterschiedliche Fälle (Projekt ist kein Git-Repo vs. Baseline-Capture beim Spawn fehlgeschlagen, weil `revParse` zum PTY-Spawn-Zeitpunkt nicht durchkam) als ein einziges `hasBaseline:false`-Result. `git:status` liefert demgegenüber bei `has_git=0` ein explizites `NOT_A_GIT_REPO`, was den Renderer eine andere Diagnose anzeigen ließe („Kein Git-Repo" vs. „Baseline fehlt"). Im aktuellen Renderer-Pfad zeigt der DiffViewer in beiden Fällen denselben Empty-State, daher kein UX-Regression.
- **Begründung:** Beim nächsten Touch ein `hasGit:boolean`-Feld neben `hasBaseline` ergänzen, damit der Renderer beide Fälle differenzieren kann. Heute reiner Stil-Drift.
- **Trigger:** wenn der DiffViewer eine differenzierte Empty-State-Botschaft bekommt (z.B. „Kein Git-Repo — Session-Diff nicht verfügbar" vs. „Baseline-SHA fehlt — Tab muss neu gespawnt werden").

### `git:show-staged` ohne lexikalischen Path-Traversal-Filter (Stil-Drift zu fs:*-Handlern)

- `src/main/ipc/git.ts:135-157`, Driver `src/main/git/driver.ts:150-160` · Kategorie: **Verbesserung**
- **Beschreibung:** Der `relPath` aus `GitShowStagedInputSchema` fließt unkontrolliert in `git.show([':<relPath>'])`. Im Gegensatz zu `fs:read`/`fs:write` (wo `resolveValidatedProjectPath` Anti-Traversal macht) verlässt sich der Pfad hier auf gits Tree-relative Semantik: `git show :../../etc/passwd` schlägt mit Git-Error fehl, weil git Pfade außerhalb des Trees ablehnt. Damit ist die Klasse `Renderer-Pfad-Escape` zwar unkritisch für den Inhalt — aber konsistent mit dem bestehenden Muster wäre ein Lexikal-Check vor dem Driver-Aufruf. Bestehende `git:show`/`git:diff` haben dieselbe Eigenschaft seit v0.1, also keine Regression.
- **Begründung:** Optionalen `resolveProjectRelative`-Lexikal-Check in `resolveGitProject` aufnehmen, der `relPath` zusätzlich validiert. Heute keine Sicherheits-Lücke, nur Konvention-Bruch.
- **Trigger:** sobald jemals ein git-Channel User-Pfade an Befehle weiterreicht, die *nicht* tree-internal interpretieren (z.B. ein hypothetisches `git:archive-file` mit absolutem Output-Pfad) — dann zentralen Lexikal-Check ziehen.

---

## Release-Review v0.4.0 (2026-05-29)

Befunde aus dem Release-Review von v0.3.2 → v0.4.0 (neue Channels `terminal:save-buffer` / `terminal:load-buffer` + `models:fetch-available`), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Channel-Namensraum `terminal:*` für eine Session-Domänen-Operation

- `src/shared/ipc-channels.ts:46-47` ↔ `src/main/ipc/terminal-buffer.ts` · Kategorie: **Verbesserung**
- **Beschreibung:** Die Buffer-Persistierung läuft über `terminal:save-buffer` / `terminal:load-buffer`, obwohl die Operation fachlich eine Session-Operation ist (FK auf `sessions.id`, Gate auf `session.type`). Alle anderen Session-Operationen liegen unter `session:*`. Reiner Namens-Drift, kein Funktionsfehler.
- **Begründung:** Bei nächstem Touch unter `session:*` oder einem eigenen `buffer:*`-Prefix konsolidieren. Heute kein Effekt.
- **Trigger:** wenn ein dritter type-spezifischer Channel hinzukommt oder die Channel-Konstanten ohnehin angefasst werden.

---

## Bereichs-Review IPC (2026-05-31)

Befunde aus dem vollständigen IPC-Layer-Review (alle 15 Handler). Die behobenen Befunde dieses Durchgangs (W-1 PTY-Write-Guard, V-1 Bracketed-Paste-Vorcheck, V-2 Resize/Kill-Guard, V-3 projectId-Konventions-Kommentar) sind im [`archiv/ARCHIV_IPC.md`](./archiv/ARCHIV_IPC.md) festgehalten. Hier bleiben nur die bewusst nicht gefixten Design-by-Choice-Punkte, damit der nächste Durchgang sie nicht erneut meldet.

### `models:fetch-available` reicht `process.env.ANTHROPIC_API_KEY` ungeprüft an den Fetch

- `src/main/ipc/models.ts:17` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der Handler hat keine Payload (daher korrekt kein zod-Schema) und liest den API-Key direkt aus der Main-Prozess-Umgebung, nicht aus dem Renderer. Ohne Key liefert `fetchAvailableModels` `available=false` zurück (kein Fehler), HTTP-/Netzwerkfehler werden als `IpcResult.ok=false` verpackt.
- **Begründung:** Der Key kommt aus der Main-Env, nicht über die Renderer-Trust-Boundary — es gibt also keine ungeprüfte Renderer-Eingabe, die abzusichern wäre. Eine zusätzliche Validierung des Env-Werts würde nur den fehlenden/leeren Fall abdecken, den `fetchAvailableModels` bereits sauber als `available=false` behandelt. Bewusst so belassen.
- **Trigger:** falls der API-Key jemals aus dem Renderer-Payload (statt der Main-Env) stammen sollte — dann zod-Parse + Format-Check ergänzen.

### `terminal:save-buffer` ohne Main-seitigen Größen-Re-Check (verlässt sich auf Schema-Cap)

- `src/main/ipc/terminal-buffer.ts:60` · Kategorie: **Design-by-Choice**
- **Beschreibung:** `buffers.upsert(input.sessionId, input.snapshot)` schreibt den Snapshot ohne eigenen Längen-Re-Check. Die Trust-Boundary ist der 1-MiB-Cap im `TerminalSaveBufferInputSchema` (`src/shared/schemas.ts:231`); der Renderer trimmt vorher zusätzlich auf 256 KiB.
- **Begründung:** Der zod-Cap *ist* die Validation-Schicht — er greift vor dem ersten Side-Effect, exakt nach dem zod-vor-Side-Effect-Muster aller anderen Handler. Ein zweiter Längen-Check im Handler wäre redundant zum Schema-Constraint und würde die Validation auf zwei Stellen verteilen.
- **Trigger:** falls der 1-MiB-Cap je aus dem Schema entfernt oder gelockert wird — dann den Re-Check in den Handler ziehen.
