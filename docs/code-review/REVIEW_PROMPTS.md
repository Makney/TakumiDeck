# Code-Review-Prompts pro Bereich

**Stand:** 2026-05-10
**Tooling-Snapshot:** Fallow + ESLint vom 2026-05-10 (Commits seitdem: keine)
**Quelle:** [REVIEW_PLAN.md](./REVIEW_PLAN.md) · [TEMPLATE.md](./TEMPLATE.md) · [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md)

Diese Datei enthält für jeden der 9 Review-Bereiche aus dem `REVIEW_PLAN.md` einen **fertigen, copy-paste-bereiten Prompt** mit den Tooling-Befunden bereits **inline eingebettet**. Eine frische Claude-Code-Session braucht damit nichts außer dem Prompt und dem Projekt-Kontext.

---

## Verwendung

Pro Bereich eine neue Session — frischer Kontext, beste Ergebnisse:

1. **Falls seit 2026-05-10 Commits passiert sind:** Tooling neu fahren, sonst überspringen.

   ```powershell
   npm run typecheck
   npm run lint
   npx fallow dead-code --format markdown > .fallow-reports/dead-code.md
   npx fallow dupes     --format markdown > .fallow-reports/dupes.md
   npx fallow health    --format markdown > .fallow-reports/health.md
   ```

   Wenn die Befunde im Prompt unten signifikant abweichen vom neuen Output, **diese Datei** entsprechend aktualisieren, bevor der Bereichs-Pass läuft.

2. **Neuen Claude-Code-Tab im Projekt-Root öffnen** (`CLAUDE.md` wird auto-geladen).
3. **Prompt aus diesem File kopieren** → einfügen → Befund-Report abwarten.
4. **Erst auf Signal „fix it"** Fixes anwenden lassen (CLAUDE.md Regel 2).
5. **Verbleibende Befunde** in `OFFEN_<BEREICH>.md` eintragen, dann Status-Matrix in `REVIEW_PLAN.md` aktualisieren.

⚠️ **Fallow-Aufruf-Syntax:** Fallow akzeptiert keine Positional-Pfade. `npx fallow dead-code src/shared` ist falsch. Pfad-Scoping geht über `--file <einzelne-datei>` oder `--changed-since <git-ref>`. Konfig in `.fallowrc.json`.

---

## Bereich 1 — Shared (Types, IPC-Channels, Schemas)

```
# Code-Review: Shared (Types, IPC-Channels, Schemas)

## Kontext
CLAUDE.md ist auto-geladen (Projekt-Steckbrief, Regeln, MARKDOWN_RULES, CODING_RULES).

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_SHARED.md (falls vorhanden)
Die dort gelisteten Punkte sind bekannt und bewusst offen — bitte
nicht erneut melden, außer es gibt eine neue Erkenntnis dazu.

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dead-code` und `npx fallow dupes`. Im Review verifizieren — bewusste Architektur-Entscheidung oder echter Befund?

**Duplicate Export (kritisch):**
- `ClaudeMdFrontmatter` ist in BEIDEN `src/shared/schemas.ts` UND `src/shared/types.ts` definiert. Drift — einer der beiden muss raus oder als Re-Export aus der Master-Quelle umgebaut werden.

**Ungenutzte zod-Schemas in `src/shared/schemas.ts` (definiert, nirgends importiert):**
- :62 `SessionTypeSchema`
- :64 `SessionStatusSchema`
- :104 `SessionUpdatePatchSchema`
- :216 `ClaudeMdOnDemandFileSchema`
- :244 `ProjectAddInputSchema`
- :261 `JsonlUsageSchema`
- :305 `UsageHeatmapInputSchema`
→ Architektur 3 fordert zod-Validation in IPC-Handlern. Sind die Schemas nicht verdrahtet (echter Befund: Validation fehlt → IPC-Bereich-4-Folge-Frage), oder existieren parallele Schemas, die das Gleiche tun?

**Ungenutzte Type-Exports:**
- `src/shared/schemas.ts:58` `AppSettingsPatch`
- `src/shared/schemas.ts:240` `ClaudeMdFrontmatter`
- `src/shared/types.ts:250` `ProjectAddInput`
- `src/shared/ipc-channels.ts:66` `ChannelName`

**Self-Duplikation in schemas.ts:**
- Zeilen 93-101 ↔ 126-139 (14 Zeilen). Verifizieren, ob sich eine Basis-Schema-Definition lohnt oder ob die Strukturen bewusst unabhängig sind.

## Deine Aufgabe
Führe einen Code-Review der Shared-Schicht durch — der Single-Source-of-Truth
für IPC-Verträge zwischen Main und Renderer.

**Zu lesende Dateien (vollständig):**
- src/shared/types.ts
- src/shared/ipc-channels.ts
- src/shared/schemas.ts
- src/shared/result.ts
- src/shared/constants.ts

**Querverweise (nur konsultieren, nicht reviewen):**
- src/preload/preload.ts (zur Abdeckungs-Prüfung der Channels)
- src/main/ipc/*.ts (zur Abdeckungs-Prüfung der Channels)

**Worauf du achtest:**
- Neue Bugs oder fehlerhafte Logik seit dem letzten Review
- Regressionen: früher korrekte Funktionen, die jetzt abweichen
- Neu hinzugekommene Felder/Funktionen: konsistent behandelt?
- Fehlendes Error-Handling bei neuen Code-Pfaden
- Stil-Abweichungen vom restlichen Code

**Bereichs-spezifische Prüfpunkte:**
- Sind alle in `Channels` definierten Kanäle in der Preload-Bridge abgedeckt
  und umgekehrt: gibt es tote Channels ohne Handler/Bridge?
- Stimmen die zod-Schemas in `schemas.ts` mit den TS-Typen in `types.ts` überein
  (kein struktureller Drift)?
- `Result<T>`-Pattern konsistent verwendet — keine geworfenen Errors aus
  IPC-Verträgen?
- Sind `as const`-Definitionen wirklich `as const` (sonst widened TS den Typ)?
- Werden Enum-artige String-Unions (z.B. `SessionStatus`, `SessionType`) zentral
  definiert oder gibt es Duplikate?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_SHARED.md komplett (falls vorhanden)
2. Lies die oben genannten Shared-Dateien vollständig
3. Konsultiere preload.ts und src/main/ipc/*.ts für die Channel-Abdeckungs-Prüfung
4. Verifiziere die oben gelisteten Tooling-Befunde — pro Befund: echter Bug, bewusste Architektur, oder False-Positive?
5. Erstelle einen Befund-Report:
   - Kategorie: Bug / Warnung / Verbesserung
   - Pro Befund: Datei + Zeilennummer
   - Markierung „NEU" oder „bereits in OFFEN_SHARED.md / aus Tooling-Snapshot oben"
6. Warte auf mein „fix it" bevor du etwas änderst

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte offene Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Bereich 2 — Datenschicht (better-sqlite3)

```
# Code-Review: Datenschicht (better-sqlite3)

## Kontext
CLAUDE.md ist auto-geladen.
Architektur-Referenz: docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 4 (Persistenz).

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_DB.md (falls vorhanden)

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dupes` und `npx fallow health`.

**Cross-File-Duplikat:**
- `src/main/db/repos/sessions.ts:15-41` ↔ `src/shared/types.ts:75-107` (33 Zeilen)
→ Wahrscheinlich Domain-Type vs. DB-Row-Type, die strukturell sehr ähnlich sind. Verifizieren: ist die Trennung gewollt (Architektur-Prinzip „Domain ≠ Persistenz") oder echte Duplikation, die zu Drift führen kann?

**Komplexitäts-Hotspot:**
- `src/main/db/repos/sessions.ts:323` `listHistoryForProject` — Cyclomatic 20, Cognitive 20, CRAP 106 (kritisch)
→ 33 Zeilen Funktion mit hoher Verzweigung. Verifizieren: berechtigt durch Filter-Logik des Verlauf-Panels (Architektur 6.6) oder Refactoring-Kandidat?

## Deine Aufgabe
Führe einen Code-Review der DB-Schicht durch — alle Stellen, die SQLite
schreiben oder lesen.

**Zu lesende Dateien (vollständig):**
- src/main/db/connection.ts
- src/main/db/migrations.ts
- src/main/db/repos/projects.ts
- src/main/db/repos/sessions.ts
- src/main/db/repos/messages.ts
- src/main/db/repos/usage.ts
- src/main/db/repos/jsonl-offsets.ts

**Worauf du achtest:**
- Bugs, Regressionen, neue inkonsistente Felder, Error-Handling, Stil-Drift

**Bereichs-spezifische Prüfpunkte:**
- Alle Statements als Prepared-Statements — kein dynamisches SQL-String-Concat
  mit User-Input?
- Multi-Statement-Operationen in `db.transaction(...)` gewrappt?
- WAL-Mode aktiv, `PRAGMA foreign_keys = ON` beim Connection-Setup?
- Migrationen idempotent (kein doppeltes CREATE ohne IF NOT EXISTS) und
  versioniert?
- Indices auf `usage_buckets(bucket_start)` und `messages(session_id, ts)`
  vorhanden (laut Architektur 4)?
- `ON DELETE CASCADE` bei sessions → messages korrekt?
- Repos returnen typed Domain-Objekte, nicht Raw-Rows?
- Kein Schema-Drift zwischen Migration-SQL und TS-Typen in src/shared/types.ts?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_DB.md (falls vorhanden)
2. Lies die DB-Dateien vollständig
3. Quervergleiche das Schema gegen docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 4
4. Verifiziere die oben gelisteten Tooling-Befunde
5. Erstelle einen Befund-Report mit Kategorie + Datei:Zeile + NEU/bereits-dokumentiert
6. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Bereich 3 — Main-Services (PTY, JSONL, Workspace, Sessions, Git, Usage, Templates, FS)

⚠️ Falls der Befund-Report über 30 Findings hinausgeht, **splitten** in vier Sub-Reviews: PTY · JSONL · Git · Rest. Dann pro Sub-Bereich einen eigenen Prompt-Run mit der entsprechenden Datei-Teilmenge.

```
# Code-Review: Main-Services

## Kontext
CLAUDE.md ist auto-geladen.
Architektur-Referenz: docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 3, 6.1–6.7, 7.

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_MAIN_SERVICES.md
Die dort dokumentierten Punkte (inkl. Lint-Vor-Pass-Befund parser.ts:69)
sind bekannt — nicht erneut melden.

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dupes` und `npx fallow health`. Plus ESLint-Findings, die als Inline-Disable mit FIXME-Kommentaren im Code stehen — beim Review prüfen, ob Disable bleibt oder Fix sauberer ist.

**Cross-Module-Duplikat:**
- `src/main/fs/treeScanner.ts:39-45` ↔ `src/main/workspace/scanner.ts:40-48` (9 Zeilen)
→ Zwei separate Scanner mit gemeinsamer Verzeichnis-Logik. Bereichs-Frage: gemeinsame Helper-Funktion oder bewusste Trennung wegen unterschiedlicher Stop-Bedingungen?

**Komplexitäts-Hotspots:**
- `src/main/jsonl/watcher.ts:116` `handleFile` — Cyclo 18, Cog 18, CRAP 342 (kritisch, 82 Zeilen)
- `src/main/pty/binary.ts:16` `resolveExecutable` — Cyclo 12, Cog 16, CRAP 156 (kritisch)
- `src/main/workspace/scanner.ts:98` `visit` — Cyclo 12, Cog 16 (moderat, rekursive Verzeichnis-Suche)
- `src/main/jsonl/parser.ts:91` `extractMessage` — Cyclo 12, Cog 9 (moderat)
- `src/main/git/driver.ts:39` `status` — Cyclo 12, Cog 13 (moderat)
- `src/main/sessions/lifecycle.ts:71` `transition` — Cyclo 11, Cog 9 (moderat, State-Machine)
- `src/main/jsonl/watcher.ts:231` `backfillClaudeSessionId` — Cyclo 9, Cog 10 (high)
- `src/main/main.ts:247` `<arrow>` — Cyclo 8, Cog 8 (high)
→ Komplexität allein ist kein Bug. Verifizieren, ob die Verzweigung durch echte Domänen-Logik gerechtfertigt ist (z.B. State-Machine-Transitions, OS-spezifische Pfad-Auflösung) oder ob sich Sub-Funktionen lohnen.

**ESLint-Befund (im Code als Inline-Disable):**
- `src/main/jsonl/parser.ts:69` `catch (e)` — Variable ungenutzt (`@typescript-eslint/no-unused-vars`).
→ Im Review: maskiert das ein Logging-Loch (Fail-Silent für korrupte JSONL)? Falls ja: Logging hinzufügen + Disable raus. Falls bewusst Fail-Silent: `_e` nutzen (matcht ignore-Pattern) + Disable raus.

## Deine Aufgabe
Führe einen Code-Review der Main-Process-Services durch — alle Domain-Logik
außerhalb der IPC-Handler-Schicht.

**Zu lesende Dateien (vollständig):**
- src/main/main.ts
- src/main/paths.ts
- src/main/logger.ts
- src/main/pty/manager.ts
- src/main/pty/spawn.ts
- src/main/pty/binary.ts
- src/main/jsonl/watcher.ts
- src/main/jsonl/parser.ts
- src/main/jsonl/cwd-encoding.ts
- src/main/workspace/scanner.ts
- src/main/workspace/claudeMdParser.ts
- src/main/sessions/lifecycle.ts
- src/main/sessions/state-detection.ts
- src/main/sessions/state-detection-loop.ts
- src/main/sessions/reconciliation.ts
- src/main/git/driver.ts
- src/main/usage/filters.ts
- src/main/usage/resolver.ts
- src/main/templates/reader.ts
- src/main/fs/treeScanner.ts
- src/main/settings/store.ts
- src/main/settings/defaults.ts

**Worauf du achtest:**
- Bugs, Regressionen, neue inkonsistente Felder, Error-Handling, Stil-Drift

**Bereichs-spezifische Prüfpunkte:**
- PTY-Output-Throttling 16ms wirklich implementiert (Architektur 3)?
- chokidar-Watcher mit 500ms-Debounce, sauberes Cleanup bei Session-Close,
  keine Watcher-Leaks?
- State-Detection-Loop nicht-blockierend, mit Backoff bei Errors,
  beendet sich bei App-Shutdown?
- simple-git-Aufrufe immer auf bekanntem `cwd` (kein User-kontrollierter Path)?
- Path-Traversal-Schutz in `fs/treeScanner.ts` und `templates/reader.ts`
  (resolve + startsWith-Check gegen erlaubten Root)?
- JSONL-Parser robust gegen abgeschnittene/korrupte Zeilen, EOF-mid-line,
  unbekannte Event-Types?
- Lifecycle `interrupted → resumed` reconciliert beim App-Start korrekt
  (Architektur 7)?
- Workspace-Scanner respektiert max-depth 5 und stoppt bei .git
  (Architektur 6.1)?
- electron-log mit rotation-Konfig, keine sensitiven Daten geloggt?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_MAIN_SERVICES.md
2. Lies die oben genannten Dateien vollständig
3. Verifiziere die oben gelisteten Tooling-Befunde
4. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
5. Falls > 30 Befunde: gruppiere nach Sub-Domain (PTY/JSONL/Git/Rest)
6. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Bereich 4 — IPC-Handler (Validation + Result-Pattern)

```
# Code-Review: IPC-Handler

## Kontext
CLAUDE.md ist auto-geladen.
Architektur-Referenz: docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 3 (IPC-Schema, Result-Type).

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_IPC.md (falls vorhanden)

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dupes` und `npx fallow health`.

**Self-Duplikationen (Refactoring-Kandidaten):**
- `src/main/ipc/fs.ts:68-88` ↔ `src/main/ipc/fs.ts:136-157` (22 Zeilen, gleiche Datei)
- `src/main/ipc/fs.ts:82-95` ↔ `src/main/ipc/fs.ts:155-167` (14 Zeilen, gleiche Datei)
- `src/main/ipc/git.ts:64-70` ↔ `src/main/ipc/git.ts:88-96` (9 Zeilen, gleiche Datei)
→ Zwei Handler in derselben Datei mit fast-identischer Validation/Result-Pattern. Bereichs-Frage: gemeinsame Helper-Funktion oder bewusst kopiert für Klarheit pro Handler?

**Cross-Handler-Duplikat:**
- `src/main/ipc/pty.ts:62-74` ↔ `src/main/ipc/session.ts:97-105` (13 Zeilen)
→ Wahrscheinlich gemeinsame Pre-Spawn-Validation oder Path-Resolution. Verifizieren.

**Cross-File-Duplikat (Test-Boilerplate):**
- `src/main/ipc/git.ts:37-51` ↔ `tests/main/git-ipc.test.ts:37-48` (15 Zeilen)
→ Setup-Code, der auch im Test nochmal steht. Möglicherweise Test-Helper sinnvoll. Aber: Tests dürfen Setup-Boilerplate haben — kein Pflicht-Fix.

**Komplexitäts-Hotspots:**
- `src/main/ipc/project.ts:59` `<arrow>` — Cyclo 9, Cog 8 (high, 49 Zeilen)
- `src/main/ipc/session.ts:88` `<arrow>` — Cyclo 9, Cog 8 (high, 70 Zeilen)
- `src/main/ipc/pty.ts:59` `<arrow>` — Cyclo 6, Cog 5 (moderat, 79 Zeilen lang)
- `src/main/ipc/app.ts:57` `<arrow>` — Cyclo 7, Cog 6 (high)
→ Lange Handler-Closures mit Validation + Result-Wrapping. Verifizieren, ob die Komplexität durch Validation-Tiefe gerechtfertigt ist.

## Deine Aufgabe
Führe einen Code-Review der IPC-Handler durch — die Sicherheits-Grenze
zwischen Renderer und Main.

**Zu lesende Dateien (vollständig):**
- src/main/ipc/app.ts
- src/main/ipc/fs.ts
- src/main/ipc/git.ts
- src/main/ipc/project.ts
- src/main/ipc/pty.ts
- src/main/ipc/session.ts
- src/main/ipc/settings.ts
- src/main/ipc/usage.ts

**Querverweise (nur konsultieren):**
- src/shared/schemas.ts (für Validation-Schemas)
- src/shared/result.ts (für Result-Pattern)
- src/shared/ipc-channels.ts (für Channel-Konstanten)

**Worauf du achtest:**
- Bugs, Regressionen, fehlende Validation, Error-Handling, Stil-Drift

**Bereichs-spezifische Prüfpunkte (Security-relevant — extra sorgfältig):**
- Jeder Handler validiert sein Input via zod-Schema bevor irgendeine Aktion
  ausgeführt wird? (Bereich-1-Befund: 7 zod-Schemas in shared/schemas.ts sind
  ungenutzt — sind die hier nicht verdrahtet, obwohl sie hier hingehörten?)
- Kein Throw aus Handler — immer `Result<T>` zurück, auch bei unerwarteten
  Errors (try/catch)?
- Sender-Validation für privilegierte Channels (`fs:write`, `pty:create`,
  Git-Operationen) — kommt der Aufruf wirklich von der eigenen MainWindow?
- Keine raw `BrowserWindow.webContents.send` oder `ipcMain.handle` außerhalb
  des `ipc/`-Layers?
- Error-Messages enthalten keine Pfade, Tokens, User-Daten — nur
  generische Codes/Strings?
- Async-Handler haben `await` vor jedem Promise — keine vergessenen
  Awaits, die zu unhandled rejections führen?
- Path-Argumente werden gegen einen erlaubten Root resolved
  (kein blindes `fs.read(input.path)`)?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_IPC.md (falls vorhanden)
2. Lies die IPC-Handler vollständig
3. Verifiziere die oben gelisteten Tooling-Befunde
4. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
5. Markiere Security-relevante Befunde extra mit `[SEC]`-Prefix
6. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Bereich 5 — Preload-Bridge

**Pflicht-Vor-Pass:** `npx @doyensec/electronegativity -i .` lokal fahren und Output als zweite Nachricht in die Session geben — der ist nicht in den Fallow-Reports drin.

```
# Code-Review: Preload-Bridge

## Kontext
CLAUDE.md ist auto-geladen.
Architektur-Referenz: docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 3
(Preload-Bridge-Shape, contextBridge-Vertrag).

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_PRELOAD.md (falls vorhanden)

## Bekannte Tooling-Befunde (Stand 2026-05-10)
**Fallow meldet null Befunde für preload.ts.** Datei ist sauber laut Dead-Code-, Dupes- und Health-Pass.

Health-Hotspot-Score: 79 (3.-höchster), aber stable trend — nicht akut.

**Aufgepasst:** Der Pflicht-Vor-Pass `npx @doyensec/electronegativity` muss separat gefahren werden. Falls Output in zweiter Nachricht: jeden Befund verifizieren.

## Deine Aufgabe
Führe einen Code-Review der Preload-Schicht durch — die einzige API-Oberfläche,
über die der Renderer mit dem Main-Prozess sprechen darf.

**Zu lesende Dateien (vollständig):**
- src/preload/preload.ts

**Querverweise (nur konsultieren):**
- src/shared/ipc-channels.ts (Vollständigkeits-Check der Channels)
- src/shared/types.ts (Bridge-Interface-Konsistenz)

**Worauf du achtest:**
- Bugs, Regressionen, Stil-Drift

**Bereichs-spezifische Prüfpunkte (Hardening — extra sorgfältig):**
- Wird ausschließlich `contextBridge.exposeInMainWorld` benutzt — niemals
  `window.X = ...`?
- Kein direktes `ipcRenderer.send/invoke` exponiert — nur gewrappte Methoden
  pro Channel?
- Domain-Gruppierung folgt Architektur 3 (`api.projects`, `api.sessions`,
  `api.pty`, `api.git`, `api.usage`, `api.fs`, `api.settings`,
  `api.notes`, `api.app`)?
- Keine Node-API durchgereicht — kein `process`, kein `require`,
  kein `Buffer`, kein `fs`?
- Event-Listener-Pattern (z.B. `pty:data`) gibt einen sauberen Unsubscribe-Handle
  zurück (kein Leak)?
- Jeder Wrapper macht genau einen IPC-Call — keine zusammengesetzten
  Mehrfach-Calls in einem Wrapper?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_PRELOAD.md (falls vorhanden)
2. Lies preload.ts vollständig
3. Quervergleiche gegen ipc-channels.ts: ist jeder Channel im Bridge abgedeckt
   und umgekehrt?
4. Falls electronegativity-Output beigelegt: jeden Befund verifizieren
5. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
6. Markiere Hardening-Befunde mit `[SEC]`-Prefix
7. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Bereich 6 — Renderer-Stores (Zustand)

```
# Code-Review: Renderer-Stores (Zustand)

## Kontext
CLAUDE.md ist auto-geladen.

**Bekannte Memory-Regeln aus früheren Sessions (zwingend beachten):**
- Zustand-Selektoren MÜSSEN referenz-stabil sein — niemals inline `?? []` /
  `?? new Set()` im Selector. Stable EMPTY-Module-Konstanten + abgeleitete
  Sets/Maps via useMemo. Sonst „getSnapshot should be cached"-Endlosschleife.

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_STORES.md (falls vorhanden)

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dead-code`, `dupes`, `health`.

**Ungenutzte Exports:**
- `src/renderer/stores/fileTabs.ts:398` `fileTabId`
- `src/renderer/stores/sessions.ts:76` `pickNextActive`
→ Verifizieren: ist das Refactoring-Rest, Test-Helper, oder Phase-2-Stub?

**Ungenutzte Type-Exports:**
- `src/renderer/stores/fileTabs.ts:20` `FileTabKind`
- `src/renderer/stores/sessions.ts:31` `AddTabInput`
- `src/renderer/stores/ui.ts:47` `MainView`
→ Möglicherweise bewusste API-Surface für externe Consumer (Modals, Panels). Beim Lesen prüfen.

**Self-Duplikationen:**
- `src/renderer/stores/fileTabs.ts:347-355` ↔ `:368-376` (9 Zeilen, gleiche Datei)
- `src/renderer/stores/sessions.ts:137-143` ↔ `:147-153` (7 Zeilen, gleiche Datei)
→ Zwei ähnliche Action-Implementations. Verifizieren, ob sich gemeinsame Action-Helper lohnt.

**Komplexitäts-Hotspots:**
- `src/renderer/stores/fileTabs.ts:295` `hydrateFromStorage` — Cyclo 17, **Cog 21** (high, 91 Zeilen)
- `src/renderer/stores/fileTabs.ts:92` `readPersisted` — Cyclo 10, Cog 9 (moderat)
- `src/renderer/stores/usage.ts:35` `refreshBars` — Cyclo 5, Cog 5 (moderat)
→ `hydrateFromStorage` ist der heißeste Spot der Stores. Verifizieren: berechtigt durch Schema-Versions-Migration und Backwards-Compat, oder Refactoring-Kandidat?

**Hotspot (Churn × Complexity):**
- `src/renderer/stores/ui.ts` — Score 42, accelerating trend, fan-in 10 (10 Files importieren ui.ts!)
→ Hohe Blast-Radius bei Änderungen. Beim Review extra auf API-Stabilität achten.

## Deine Aufgabe
Führe einen Code-Review der Zustand-Stores durch.

**Zu lesende Dateien (vollständig):**
- src/renderer/stores/projects.ts
- src/renderer/stores/sessions.ts
- src/renderer/stores/ui.ts
- src/renderer/stores/usage.ts
- src/renderer/stores/fileTabs.ts

**Worauf du achtest:**
- Bugs, Regressionen, Stil-Drift

**Bereichs-spezifische Prüfpunkte:**
- Selektor-Stabilität: keine Inline-`?? []` / `?? new Set()` / `.filter(...)` /
  `.map(...)` im Selector — alle Ableitungen referenz-stabil oder durch
  EMPTY-Konstanten + useMemo abgesichert?
- Keine Mutationen ohne `set(...)`-Aufruf (z.B. direktes `state.x = ...`
  außerhalb von Immer-Pattern)?
- Async-Aktionen behandeln Loading- und Error-State explizit?
- Keine zirkulären Store-Dependencies (Store A liest Store B, Store B liest A)?
- Persistenz/Hydration (falls vorhanden) hat Schema-Versions-Check?
- Store-Slices haben klare Verantwortungs-Grenzen — keine ui-State-Felder
  in Domain-Stores und umgekehrt?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_STORES.md (falls vorhanden)
2. Lies alle Store-Dateien vollständig
3. Verifiziere die oben gelisteten Tooling-Befunde
4. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
5. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Bereich 7 — Renderer-Panels (UI-Shell)

```
# Code-Review: Renderer-Panels (UI-Shell)

## Kontext
CLAUDE.md ist auto-geladen.

**Bekannte Memory-Regeln aus früheren Sessions (zwingend beachten):**
- StrictMode-Side-Effect-Guard: jede useEffect, die einen Server-Side-Effect-IPC
  abfeuert (pty:create, fs:write, git:commit, session:open, …), MUSS einen
  useRef-Guard gegen StrictMode-Doppelausführung haben.
- Zustand-Selektoren müssen referenz-stabil sein — auch wenn die Stores selbst
  hier nicht reviewed werden, fallen Verstöße hier auf.

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_PANELS.md
Die dort dokumentierten Lint-Vor-Pass-Befunde (TabContainer.tsx:166, :216;
EditorPane.tsx:312) sind als Inline-Disable mit FIXME-Kommentaren im Code
eingetragen — beim Review die FIXMEs auflösen (Fix oder bewusste Akzeptanz).

**Quervergleich (nur konsultieren):** docs/code-review/SPRINT9_UI_FINDINGS.md
(UI-Drift bereits dort erfasst — keine Re-Findings dazu hier.)

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dead-code`, `dupes`, `health`.

**Ungenutzte Datei (wichtig — Architektur-relevant):**
- `src/renderer/styles/layout.ts` — die LAYOUT-Konstanten-Datei aus Architektur Kapitel 4 wird in keinem Panel importiert!
→ Bestätigt das Sprint-9-Finding „Panels nutzen Magic-Numbers statt Layout-Tokens". Im Review: ist das eine bewusste Auslassung (Tokens via CSS-Custom-Properties statt TS) oder echter Migration-Pfad-Befund?

**Ungenutzter Type-Export:**
- `src/renderer/panels/TerminalTab.tsx:292` `TerminalTabProps`

**Cross-Panel-Duplikat (größter Dupe-Hotspot der App!):**
- `src/renderer/panels/LeftSidebar.tsx:162-187` ↔ `src/renderer/panels/TabContainer.tsx:130-169` (40 Zeilen)
→ Wahrscheinlich Session-Action-Logik (Resume/Close/Status-Update) doppelt. Verifizieren — gemeinsamer Hook (z.B. `useSessionActions`) wäre eine Variante. Aber Vorsicht: 40 Zeilen ist groß genug, dass das ein echtes Architektur-Refactoring wäre, nicht nur Cleanup.

**Self-Duplikation:**
- `src/renderer/panels/TitleBar.tsx:75-81` ↔ `:92-98` (7 Zeilen, gleiche Datei)

**Komplexitäts-Hotspots (kritisch):**
- `src/renderer/panels/HistoryPane.tsx:429` `HistoryDetail` — Cyclo 19, CRAP 380 (kritisch, 130 Zeilen)
- `src/renderer/panels/TabContainer.tsx:28` `TabContainer` — Cyclo 14, CRAP 210 (kritisch, 278 Zeilen)
- `src/renderer/panels/TabContainer.tsx:106` `handler` — Cyclo 12, **Cog 17** (kritisch, 20 Zeilen — hohe kognitive Last pro Zeile!)
- `src/renderer/panels/RightPaneFilesPanel.tsx:27` `RightPaneFilesPanel` — Cyclo 13, CRAP 182 (kritisch, 114 Zeilen)
- `src/renderer/panels/RightPaneFilesPanel.tsx:213` `fileKind` — Cyclo 12, Cog 11 (kritisch)
- `src/renderer/panels/StatsPane.tsx:72` `OverviewView` — Cyclo 12, Cog 10 (kritisch)
- `src/renderer/App.tsx:33` `App` — Cyclo 12, Cog 10 (kritisch, 173 Zeilen)
- `src/renderer/panels/HistoryPane.tsx:63` `HistoryPane` — Cyclo 10 (kritisch, 353 Zeilen — größtes Panel)
→ Komplexität in React-Komponenten ist meist Conditional-Rendering. Verifizieren, ob Sub-Components / Custom Hooks die Komplexität sauber kapseln können.

**Hotspots (Churn × Complexity):**
- `src/renderer/App.tsx` — Score 100 (höchste der App), 9 commits, stable
- `src/renderer/panels/TabContainer.tsx` — Score 69, 8 commits, **accelerating** (677 Churn-Lines!)
- `src/renderer/panels/LeftSidebar.tsx` — Score 36, 4 commits, stable, 748 Churn-Lines
- `src/renderer/panels/TerminalTab.tsx` — Score 32, 6 commits, accelerating
→ TabContainer ist der „heißeste" Hotspot mit beschleunigender Veränderungsrate — beim Review extra auf Coupling und Test-Coverage achten.

**ESLint-Befunde (im Code als Inline-Disable):**
- `src/renderer/panels/TabContainer.tsx:166` — useCallback ohne Dep `settings.terminal_font_size` (Stale-Closure-Verdacht!)
- `src/renderer/panels/TabContainer.tsx:216` — JSX `"`-Zeichen unescaped
- `src/renderer/panels/EditorPane.tsx:312` — `QuickAccessFooter` deklariert aber ungenutzt

## Deine Aufgabe
Führe einen Code-Review der UI-Shell-Panels durch.

**Zu lesende Dateien (vollständig):**
- src/renderer/main.tsx
- src/renderer/App.tsx
- src/renderer/panels/TitleBar.tsx
- src/renderer/panels/LeftSidebar.tsx
- src/renderer/panels/TerminalTab.tsx
- src/renderer/panels/TabContainer.tsx
- src/renderer/panels/EditorPane.tsx
- src/renderer/panels/RightStack.tsx
- src/renderer/panels/RightPaneFilesPanel.tsx
- src/renderer/panels/HistoryPane.tsx
- src/renderer/panels/StatsPane.tsx
- src/renderer/panels/PlanPane.tsx

**Worauf du achtest:**
- Bugs, Regressionen, Stil-Drift, Memory-Leaks

**Bereichs-spezifische Prüfpunkte:**
- StrictMode-Side-Effect-Guard via useRef in jeder useEffect mit
  IPC-Side-Effect — sonst doppelte Spawns/Writes im Dev-Mode.
- Cleanup-Funktionen in jeder useEffect mit Subscriptions/Timeouts/Listeners?
- Layout-Konstanten aus `src/renderer/styles/layout.ts` referenziert,
  keine Magic-Numbers im JSX? (Siehe Tooling-Befund oben — Datei ist ungenutzt!)
- xterm.js + node-pty Resize-Handling robust gegen Display-Wechsel
  (DPI, Window-Resize, Tab-Switch)?
- Keine Inline-Funktionen/Objekte als Props an memoized Children
  (würde Memoization brechen)?
- Keine Inline-Selectors mit Default-Werten (siehe Memory-Regel oben).
- Event-Handler räumen Listeners beim Unmount auf?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_PANELS.md
2. Lies SPRINT9_UI_FINDINGS.md überblicksweise (nicht reviewen — Drift dort
   schon erfasst)
3. Lies die Panel-Dateien vollständig
4. Verifiziere die oben gelisteten Tooling-Befunde
5. Löse die FIXME-Inline-Disables auf (Fix oder bewusst akzeptieren)
6. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
7. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Visuelle UI-Drift NICHT melden — die ist in SPRINT9_UI_FINDINGS.md erfasst.
  Hier nur Logik/State/Effect-Befunde.
- Comment-Sprache: Deutsch
```

---

## Bereich 8 — Renderer-Modals und -Components

```
# Code-Review: Renderer-Modals und -Components

## Kontext
CLAUDE.md ist auto-geladen.
Architektur-Referenz: docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 6.0.1
(Modal-System, Modal-Pattern).

**Bekannte Memory-Regeln (zwingend beachten):**
- StrictMode-Side-Effect-Guard via useRef bei IPC-Side-Effects.
- Zustand-Selektoren referenz-stabil.

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_MODALS.md
Die dort dokumentierten Lint-Vor-Pass-Befunde (PreCommitModal.tsx:102, :159;
DiffViewer.tsx:1) sind als Inline-Disable mit FIXME-Kommentaren im Code
eingetragen — beim Review die FIXMEs auflösen.

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dead-code`, `dupes`, `health`. **Dieser Bereich hat die höchsten Komplexitäts-Spitzen der gesamten Codebase.**

**Ungenutzter Export:**
- `src/renderer/components/sensitiveFiles.ts:69` `validateUserPatterns`
→ Vermutlich für Settings-Modal-Custom-Pattern-Validation gedacht (Architektur 6.0.1 PreCommitModal). Verifizieren ob Phase-2-Stub oder Refactoring-Rest.

**Ungenutzte Type-Exports (möglicherweise bewusste API-Surface):**
- `src/renderer/components/JsonRawEditor.tsx:22` `JsonValidationError`
- `src/renderer/components/clipboardKeyHandler.ts:38` `ClipboardKeyHandlerDeps`
- `src/renderer/components/displayProjectName.ts:11` `DisplayableProject`
- `src/renderer/components/notesSaver.ts:10` `NotesSaver`, :21 `NotesSaverOptions`
- `src/renderer/components/quickAccess.ts:16` `QuickAccessSource`, :18 `QuickAccessEntry`
- `src/renderer/components/settingsAutoSave.ts:41` `DebouncedSaverOptions`
- `src/renderer/components/templateVariables.ts:24` `RequiredUserVariable`, :25 `OptionalUserVariable`, :35 `TemplateVariables`, :37 `FillResult`
- `src/renderer/components/yamlValidator.ts:18` `YamlValidationError`, :27 `YamlValidationResult`

**Cross-Component-Duplikate:**
- `src/renderer/modals/PreCommitModal.tsx:67-90` ↔ `src/renderer/panels/EditorPane.tsx:219-237` (24 Zeilen)
- `src/renderer/components/JsonRawEditor.tsx:134-148` ↔ `src/renderer/components/MarkdownEditor.tsx:198-218` (21 Zeilen)
- `src/renderer/modals/TemplatesModal.tsx:63-72` ↔ `src/renderer/modals/UsageDetailModal.tsx:36-45` (10 Zeilen)
→ Drei „Editor-Pattern"-Familien (Pre-Commit, JSON/MD-Editor, Modal-Layout). Bereichs-Frage je nach Kontext: gemeinsamer Hook/Component lohnt sich?

**Komplexitäts-Hotspots (höchste der App):**
- `src/renderer/modals/PreCommitModal.tsx:48` `PreCommitModal` — **Cyclo 25, Cog 18, CRAP 650** (kritisch, 204 Zeilen) — höchster Wert der gesamten Codebase!
- `src/renderer/components/clipboardKeyHandler.ts:55` `<arrow>` — Cyclo 24, Cog 18, CRAP 148 (kritisch, 61 Zeilen)
- `src/renderer/modals/TemplatesModal.tsx:52` `TemplatesModal` — Cyclo 17, CRAP 306 (kritisch, 232 Zeilen)
- `src/renderer/modals/HistoryActionModal.tsx:28` `HistoryActionModal` — Cyclo 14, CRAP 210 (kritisch, 198 Zeilen)
- `src/renderer/components/DiffViewer.tsx:118` `<arrow>` — Cyclo 11, CRAP 132 (kritisch, 32 Zeilen)
- `src/renderer/components/MarkdownEditor.tsx:49` `MarkdownEditor` — Cyclo 10, CRAP 110 (kritisch, 246 Zeilen)
- `src/renderer/components/JsonRawEditor.tsx:54` `JsonRawEditor` — Cyclo 9, CRAP 90 (high, 152 Zeilen)
- `src/renderer/modals/SettingsModal.tsx:55` `SettingsModal` — Cyclo 8, CRAP 72 (high, 146 Zeilen)
- `src/renderer/components/DiffViewer.tsx:41` `DiffViewer` — Cyclo 7, CRAP 56 (high, 122 Zeilen)
- `src/renderer/components/DiffViewer.tsx:257` `markFor` — Cyclo 8, Cog 7 (high)
- `src/renderer/modals/PreCommitModal.tsx:269` `markChar` — Cyclo 8 (high)
→ Modals sind viel-verzweigte Forms. Verifizieren, ob sich Form-Schritte als Sub-Components extrahieren lassen — speziell PreCommitModal (höchste CRAP der App).

**ESLint-Befunde (im Code als Inline-Disable):**
- `src/renderer/modals/PreCommitModal.tsx:102` — useMemo-Dep `changedFiles` instabil → Memoization wirkungslos
- `src/renderer/modals/PreCommitModal.tsx:159` — JSX `"`-Zeichen unescaped
- `src/renderer/components/DiffViewer.tsx:1` — `useMemo`-Import ungenutzt

## Deine Aufgabe
Führe einen Code-Review der Modale und gemeinsamen Components durch.

**Zu lesende Dateien (vollständig):**
- src/renderer/modals/NewSessionModal.tsx
- src/renderer/modals/TemplatesModal.tsx
- src/renderer/modals/PreCommitModal.tsx
- src/renderer/modals/SettingsModal.tsx
- src/renderer/modals/UsageDetailModal.tsx
- src/renderer/modals/HistoryActionModal.tsx
- src/renderer/components/NotesPanel.tsx
- src/renderer/components/MarkdownEditor.tsx
- src/renderer/components/DiffViewer.tsx
- src/renderer/components/UsageBar.tsx
- src/renderer/components/JsonRawEditor.tsx
- src/renderer/components/notesSaver.ts
- src/renderer/components/clipboardKeyHandler.ts
- src/renderer/components/templateVariables.ts
- src/renderer/components/sensitiveFiles.ts
- src/renderer/components/yamlValidator.ts
- src/renderer/components/quickAccess.ts
- src/renderer/components/settingsAutoSave.ts
- src/renderer/components/editorDirtyState.ts
- src/renderer/components/treeFilter.ts
- src/renderer/components/displayProjectName.ts
- src/renderer/components/fmtTokens.ts
- src/renderer/components/markdownEditorTheme.ts
- src/renderer/components/estimateTerminalCols.ts

**Worauf du achtest:**
- Bugs, Regressionen, Stil-Drift, fehlendes Error-Handling

**Bereichs-spezifische Prüfpunkte:**
- Modal-Schließ-Pfade alle vorhanden: Esc, Backdrop-Click, ×-Button
  (Architektur 6.0.1)?
- Focus-Trap aktiv während offen, Focus-Restore beim Schließen?
- Form-Validierung in Settings/NewSession deckt Typ-Konflikte und leere
  Pflichtfelder ab?
- Sensitive-Files-Detection in PreCommitModal deckt mindestens ab:
  `.env*`, `*secret*`, `*token*`, `*.pem`, `id_rsa`, `*.key`, `credentials.json`?
- YAML-Validator (CLAUDE.md-Editor) meldet Frontmatter-Fehler verständlich
  und nicht als generischer Stack-Trace?
- Keine doppelten IPC-Calls (z.B. notesSaver-Debounce + manuelles Save löst
  beide aus)?
- Components ohne JSX (notesSaver, settingsAutoSave, …) sind reine
  Hooks/Helpers — keine versteckten Side-Effects beim Import?
- Markdown-Editor-Theme respektiert oneDark-Token aus styles/tokens.css?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_MODALS.md
2. Lies die oben genannten Dateien vollständig
3. Verifiziere die oben gelisteten Tooling-Befunde
4. Löse die FIXME-Inline-Disables auf (Fix oder bewusst akzeptieren)
5. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
6. Falls > 30 Befunde: gruppiere nach Modale / JSX-Components / Helper-Module
7. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Visuelle UI-Drift NICHT melden — siehe SPRINT9_UI_FINDINGS.md
- Comment-Sprache: Deutsch
```

---

## Bereich 9 — Build- und Konfig-Layer

**Pflicht-Vor-Pass:** `npm audit --audit-level=high` lokal fahren und Output als zweite Nachricht in die Session geben — der Audit ist nicht in den Fallow-Reports drin.

```
# Code-Review: Build- und Konfig-Layer

## Kontext
CLAUDE.md ist auto-geladen.
Architektur-Referenz: docs/TAKUMIDECK_ARCHITEKTUR.md Kapitel 7 (Build-Strategie).

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_BUILD.md (falls vorhanden)

## Bekannte Tooling-Befunde (Stand 2026-05-10)
Hypothesen aus `npx fallow dead-code`. Plus npm-audit (Pflicht-Vor-Pass, separat fahren).

**Dependency-Befunde:**
- **Ungenutzte Dependency** `codemirror` — das Umbrella-Paket. Die `@codemirror/*`-Sub-Pakete werden direkt importiert. Verifizieren: kann das Umbrella raus, oder gibt es einen indirekten Loader/Re-Export, den Fallow nicht sieht?
- **Ungenutzte devDependency** `electron-winstaller` — ⚠️ **Vorsicht beim Entfernen.** Die Package ist in `package.json` `overrides`-Block 5.3.0 gepinnt (Sprint-9-Build-Fix-Commit `6821559`). Mögliche Erklärungen: (a) Transitive Dep, die Forge zur Build-Zeit braucht, (b) Pin ist noch erforderlich obwohl direkter Import wegfiel. Vor Entfernen `npm run make` testen.
- **Unlisted Dependency** `@electron-forge/shared-types` — wird importiert (vermutlich in `forge.config.ts` für Type-Imports), fehlt aber in `package.json`. Fix: explizit als devDependency aufnehmen.

## Deine Aufgabe
Führe einen Code-Review der Build- und Konfig-Layer durch.

**Zu lesende Dateien (vollständig):**
- package.json
- forge.config.ts
- vite.main.config.ts
- vite.preload.config.ts
- vite.renderer.config.ts
- vitest.config.ts
- tsconfig.json
- tsconfig.node.json
- .husky/pre-commit
- eslint.config.mjs
- .fallowrc.json
- .gitignore

**Worauf du achtest:**
- Veraltete/unsichere Dependencies, Build-Konfig-Drift, Hardening-Lücken

**Bereichs-spezifische Prüfpunkte:**
- npm-audit-Output: kritische/hohe Schwachstellen?
- Electron-Fuses gesetzt: `runAsNode: false`,
  `enableCookieEncryption: true`,
  `enableNodeOptionsEnvironmentVariable: false`,
  `onlyLoadAppFromAsar: true`,
  `loadBrowserProcessSpecificV8Snapshot: false`?
- tsconfig: `strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`?
- electron-winstaller weiterhin auf 5.3.0 gepinnt (Architektur — Commit-Fix)?
- Husky-Pre-Commit-Hook führt mindestens `typecheck` + `lint --max-warnings=0`
  + `test` aus?
- vite.config: keine unsicheren Plugin-Konfigs, korrekte Renderer/Preload/Main-Builds?
- package.json: Versions-Pinning konsistent, keine ungenutzten Dependencies?
- `productName`, `name`, `appBundleId` in package.json + forge.config konsistent
  (Architektur 1, Naming-Konventionen)?
- ESLint-Flat-Config deckt alle Source-Pfade (main/preload/renderer/shared)?

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_BUILD.md (falls vorhanden)
2. Lies die Konfig-Dateien vollständig
3. Verifiziere die oben gelisteten Tooling-Befunde
4. Falls npm-audit-Output beigelegt: jeden CVE einzeln bewerten
5. Erstelle einen Befund-Report (Kategorie + Datei:Zeile + NEU/bereits-dokumentiert)
6. Markiere Security-/Hardening-Befunde mit `[SEC]`-Prefix
7. Warte auf „fix it"

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte Punkte NICHT wiederholen
- Comment-Sprache: Deutsch
```

---

## Nach jedem abgeschlossenen Pass

1. Verbleibende Befunde in `OFFEN_<BEREICH>.md` eintragen (Format aus `OFFEN_TEMPLATE.md`).
2. **Status-Matrix in `REVIEW_PLAN.md`** aktualisieren: Tooling-Pass-Spalte und Review-Pass-Spalte des Bereichs auf ✅, OFFEN-Datei-Spalte auf 🟡 (bei vorhandenen offenen Punkten) oder ✅ (bei keinen).
3. Falls beim Pass größere Inkonsistenzen zur Architektur-Doku auffallen:
   - Architektur-Bug → `docs/CHANGELOG.md` neuer Eintrag (nur auf Trigger-Phrase „ist korrekt umgesetzt").
   - Bewusste Architektur-Änderung → `docs/ENTSCHEIDUNGEN.md`.
4. **Kein Refactoring** ohne expliziten Auftrag — auch wenn der Befund-Report kleine Verbesserungen meldet.
