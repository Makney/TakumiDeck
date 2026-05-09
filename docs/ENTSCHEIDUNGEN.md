# Design-Entscheidungen

Dieses Dokument hält die **Warum-Entscheidungen** fest, nicht die Was-Entscheidungen. Wenn jemand (auch das zukünftige Ich in einer neuen Session) fragt *„warum haben wir damals nicht einfach …?"*, dann steht es hier.

## Wann kommt ein Eintrag hier rein?

- Scope- oder Architektur-Frage mit **mehreren sinnvollen Lösungen**.
- Entscheidung für eine Variante, die **später hinterfragt werden könnte**.
- Bewusst offen gelassene Baustellen, damit sie nicht als „vergessen" wirken.

**Nicht** hier rein: triviale Umsetzungsdetails, Bugfixes ohne Design-Anteil, kurzfristige Präferenzen.

## Format pro Eintrag

- Eine `##`-Überschrift mit prägnantem Titel.
- Abschnitte in dieser Reihenfolge:
  - **Entscheidung:** der gewählte Weg, 1–2 Sätze.
  - **Varianten:** A / B / C mit Kernmerkmal, markiert welche gewählt wurde.
  - **Grund:** *warum* A gewinnt — oder warum B/C disqualifiziert sind.
  - **Konsequenz:** was das für zukünftige Arbeit bedeutet (kein Boilerplate — nur wenn relevant).
  - Optional **Implementierungsdetail:** wenn die Umsetzung selbst eine Wahl war (z.B. Whitelist statt Blacklist).

Neue Einträge wandern **oben** an (neuster zuerst). Keine Daten in den Titel — der Titel ist thematisch, das Datum steckt implizit in der Git-History.

---

## Copy/Paste-Bindings: Smart Ctrl+C/V als Default + zwei Alternativen

**Entscheidung:** Das Terminal akzeptiert drei parallele Copy/Paste-Bindings — Smart Ctrl+C/V (Daily-Driver-Default), Ctrl+Shift+C/V (cross-platform-Standard), Ctrl+Insert/Shift+Insert (Unix-X11-Konvention). Smart Ctrl+C kopiert, *wenn* eine Selection existiert (plus Auto-`clearSelection`), sonst läuft das Event als SIGINT durch. Ctrl+V pastet immer und überschreibt das selten genutzte `\x16` der traditionellen Terminals.

**Varianten:**

- **A** Smart Ctrl+C/V plus Ctrl+Shift+C/V plus Ctrl+Insert/Shift+Insert parallel (gewählt)
- **B** Nur Ctrl+Shift+C/V — saubere Disambiguierung, kein Override von SIGINT
- **C** Nur Smart Ctrl+C/V — minimale Reibung, aber keine Bypass-Option für Hotkey-Konflikte

**Grund:** Variante B war mein erster Vorschlag, ist „theoretisch reinste" Wahl (keine Mehrdeutigkeit, kein Verlust von SIGINT bei vergessener Selection) — aber Windows Terminal, VS Code und sogar moderne Linux-Terminals (Konsole, GNOME mit Setting) sind seit Jahren auf Smart Ctrl+C/V als Default gewechselt: in der Praxis schlagen die UX-Vorteile die seltenen Selection-Verwechslungen, und der `clearSelection()`-Auto-Reset nach jedem Copy entschärft den Resteffekt. Variante C verliert den Bypass, falls Ctrl+C systemweit von einer anderen App belegt wäre — aktuell unwahrscheinlich, aber kostenlos abdeckbar. Variante A liefert alle drei Wege gleichzeitig: User wählt das, was Fingergedächtnis und installierte Tools (z.B. ShareX kapert oft Ctrl+Shift+C global) zulassen.

**Konsequenz:** Pure-Logik-Util `createCopyPasteKeyHandler` mit driver-injected `ClipboardLike` + `getTerminal`-Lambda, 17 Tests ohne xterm/Browser-Clipboard. Falls Smart-Ctrl+C in der Praxis schmerzt (versehentliche Selection schluckt SIGINT), kann das Smart-Verhalten per Setting deaktiviert werden — aktuell hardcoded, Settings-UI ist Sprint 8.

**Implementierungsdetail:** Bracketed-Paste-Mode (`\x1b[200~...\x1b[201~`) übernimmt xterms `terminal.paste(text)` automatisch — claude erkennt das und verarbeitet den Block als ein einziges Eingabe-Event statt zeilenweise. Bei Pastes >~100 Zeilen komprimiert claude code die Anzeige zu einem `[Pasted text #N +K lines]`-Platzhalter; das ist claudes Feature, nicht unsere Begrenzung.

---

## Tab-Persistenz: alle xterm-Instanzen dauerhaft mounted

**Entscheidung:** Pro Session lebt eine eigene Terminal-Komponente dauerhaft im DOM; Tab-Wechsel ändert nur die CSS-Sichtbarkeit (`display: none/flex`). Kein Snapshot/Replay über die SerializeAddon-API, kein gemeinsamer Multiplex.

**Varianten:**

- **A** Alle Terminals bleiben mounted, inaktive werden per CSS versteckt (gewählt)
- **B** Snapshot-und-Wiederherstellen pro Tab-Wechsel (SerializeAddon ein-/auspacken, Lücke aus Main nachpuffern)
- **C** Eine globale xterm-Instanz, Datenströme werden pro Session gemultiplext und beim Wechsel neu in das eine Terminal geschrieben

**Grund:** Architektur-K2 zielt auf 2-5 Tabs realistisch; bei der Tab-Anzahl ist die Speicherersparnis von B/C marginal, aber die Komplexitätskosten sind real. Variante B muss ANSI-Escape-Sequenzen über den Snapshot-Roundtrip robust halten — Cursor-Mode, Alt-Screen, Mausreports und Bracketed-Paste-State sind genau die Stellen, an denen partielle Replays kaputtgehen. Variante C verlangt Per-Session-Cursor-State-Tracking und kollidiert mit Resize-Events. A ist die einzige Variante, die mit dem existierenden xterm-Lifecycle (`open`, `dispose`, `loadAddon`) ohne Tricks auskommt.

**Konsequenz:** Pro Tab eine Canvas-Render-Pipeline + Scrollback im RAM. Bei Bedarf später (Phase 2: mehr Tabs, Heatmap-Renderer-Refactor) auf eine andere Variante umschwenken — die zentrale `TabContainer`-Komponente kapselt die Sichtbarkeitslogik, der Wechsel wäre lokal. Inaktive Tabs liefern 0×0-Boxes an den ResizeObserver — das `safeFit`-try/catch fängt die FitAddon-Throws sauber ab.

---

## Lifecycle-State-Machine: zentraler Reducer im Main

**Entscheidung:** Eine Klasse `SessionLifecycle` im Main-Prozess kennt alle erlaubten Status-Übergänge (running→completed/interrupted/error/archived, completed/interrupted/error→running per Resume + →archived) als 2D-Map. Jede Status-Änderung — egal ob aus pty:exit, session:close, session:resume oder before-quit — geht durch `lifecycle.transition()`. Disallowed Transitions werden als `IpcResult.err` mit Code `LIFECYCLE_INVALID_TRANSITION` abgewiesen; Side-Effects (`ended_at` setzen/nullen) hängen pro Übergang an einer Stelle.

**Varianten:**

- **A** Zentraler Reducer mit Truth-Table und Side-Effect-Map (gewählt)
- **B** Dezentral: jeder IPC-Handler setzt seinen Zielstatus selbst, das Repo akzeptiert weiter alles aus dem Status-Enum
- **C** Repo-Whitelist auf erlaubte Werte ohne Vor-Bedingungs-Prüfung („running darf zu archived per Renderer-Bug springen")

**Grund:** Working Rule 4 verlangt, dass die Tests der Season die *neue* Lifecycle-Logik abdecken — eine zentrale State-Machine hat genau einen Test-Pfad pro From×To-Kombination und ist damit trivial als Truth-Table abdeckbar (26 Tests in Sprint 3, davon 18 reine Daten-Assertions). Variante B würde dieselben Regeln auf 4-5 Handler verteilen, und Sprint 5 (State-Detection mit waiting/idle) müsste die Regeln dort überall erweitern. Variante C verfehlt den Punkt der State-Machine, weil sie Vor-Bedingungen ignoriert.

**Konsequenz:** Sprint 5 erweitert genau eine Map-Konstante (`ALLOWED`) um die waiting/idle-Übergänge, und die JSONL-Watch-Logik schreibt durchs lifecycle-API. Driver-Injection-Pattern wie Sprint 1/2: die Klasse nimmt nur `SessionRepository` und eine `Clock`-Funktion — Tests fahren ohne better-sqlite3 (InMemorySessionDriver) und ohne System-Clock (Fixed-Clock).

**Implementierungsdetail:** Idempotente Übergänge (gleicher Status nochmal) sind No-ops und liefern die aktuelle Row zurück — vermeidet Lärm in Tests und Logs, falls ein Handler aus Versehen zweimal feuert. `ended_at` wird beim Wiedereintritt in einen Endzustand *nicht* überschrieben, damit der ursprüngliche Endzeitpunkt erhalten bleibt (z.B. completed → archived behält den Completion-Zeitpunkt).

---

## Resume mit ursprünglichem Modell, ohne erneuten Picker

**Entscheidung:** Der Resume-Button spawnt `claude --resume <session-id>` mit dem in `sessions.current_model` gespeicherten Modell-Wert; es gibt keinen Modell-Dialog vor dem Resume und kein Setting für ein anderes Verhalten.

**Varianten:**

- **A** Resume nimmt das gespeicherte Modell, kein Picker (gewählt)
- **B** Resume öffnet vor dem Spawn nochmal den Modell-Picker, vorbelegt mit dem letzten Wert
- **C** Setting `resume_with_original_model` (Default true), umschaltbar auf „immer fragen"

**Grund:** Architektur 6.2 ist explizit Spec („gleichem Modell wie ursprünglich"). Das Argument für B (User will eventuell auf billigeres Modell wechseln) wird von Claude-Codes eigenem `/model`-Befehl im laufenden Prozess abgedeckt — nach dem Resume kann jederzeit umgeschaltet werden. Variante C addiert einen Setting-Eintrag, der wahrscheinlich nie umgestellt wird, und kostet Sprint-8-UI-Aufwand.

**Konsequenz:** Wenn sich später herausstellt, dass B-Verhalten häufig gewünscht ist (z.B. wenn das ursprüngliche Modell deprecated wurde), ist die Erweiterung lokal: NewSessionModal kennt schon den Modell-Picker, im Resume-Pfad würde derselbe Dialog mit `defaultValue=session.current_model` aufgerufen.

---

## Notes-Save: Debounce + Blur + Unmount + beforeunload

**Entscheidung:** Der Auto-Save für Notizen läuft als pure-Logik-Util `createNotesSaver` mit 500 ms Debounce; zusätzlich greifen Sofort-Flushes bei `onBlur` (Textarea verliert Fokus), `useEffect`-Cleanup (Tab-Wechsel oder App-Quit-vor-Render) und `window.beforeunload` (Renderer wird gleich getötet).

**Varianten:**

- **A** Pure 500 ms Debounce ohne weitere Trigger
- **B** Debounce + onBlur + onUnmount + beforeunload (gewählt)
- **C** Sofort-Save bei jedem Keystroke

**Grund:** Architektur 6.2 verlangt 500 ms Debounce — Variante C scheidet damit aus. Variante A scheitert genau am Sprint-3-Test-Szenario („mehrere Inputs in 500 ms ergeben einen Save", was Debounce abdeckt — *aber* zusätzlich müssen die letzten Tipps beim Tab-Wechsel erhalten bleiben, sonst gehen sie verloren). Onblur und Unmount sind die natürlichen Flush-Punkte: der User hat Fokus weggegeben oder die Komponente verlässt das Tree. Beforeunload ist die letzte Chance vor dem Renderer-Tod — best-effort, weil der invoke-Promise oft nicht mehr aufgelöst wird, aber better-sqlite3 ist im Main synchron und kann die Patches in der Praxis noch durchführen.

**Konsequenz:** Pure-Logik-Trennung: `createNotesSaver` ist driver-injected (saveFn-Callback), Tests fahren mit `vi.useFakeTimers()` ohne React und ohne IPC. Worst-Case-Verlust ist 0–500 ms Tipps bei Hard-Quit (Strom weg, OOM), kein Verlust bei normalem Tab-Wechsel oder geordnetem App-Quit. Falls sich später herausstellt, dass auch Hard-Quit-Verlust schmerzt, kann ein synchroner sendSync-Channel im Preload nachgerüstet werden — das ist eine eigenständige Erweiterung, die nicht jetzt nötig ist.

**Implementierungsdetail:** Idempotenz: `createNotesSaver` cached den zuletzt gespeicherten Wert und unterdrückt erneute Saves desselben Inhalts. Damit kostet ein onBlur direkt nach einem 500-ms-Debounce-Save keinen zweiten IPC-Call.

---

## App-Quit-Race: synchrone Status-Patches vor killAll

**Entscheidung:** `before-quit` setzt zuerst das `lifecycle.shuttingDown`-Flag, patcht dann alle running-Sessions synchron auf `interrupted` (über `lifecycle.transition`), erst danach läuft `ptyManager.killAll()` und `db.close()`. Der `pty:exit`-Handler prüft das Flag und überschreibt nicht mehr — die Sprint-2-Default-Transition zu `completed` ist in dieser Phase abgeschaltet.

**Varianten:**

- **A** Synchrone DB-Patches im before-quit, vor killAll (gewählt)
- **B** `will-quit`-Event mit `event.preventDefault()`, asynchroner Patch, dann erneutes `app.quit()`
- **C** Beim Quit nichts tun, beim *nächsten* App-Start orphane running-Sessions retroaktiv auf interrupted setzen
- **A+C** A im Normalfall + C als Reconciliation-Pass beim Start (für Hard-Crashes)

**Grund:** Variante A ist trivial und korrekt für den geordneten Quit-Fall. better-sqlite3 ist synchron und schnell — keine realistische Hänge-Gefahr im before-quit. Variante B ist das doppel-quit-Pattern, das in der Electron-Praxis als anfällig gilt (User-Eindruck „App hängt", weil das zweite quit nicht ausgelöst wird). Variante C wurde vom User explizit als Sprint-8-Aufgabe markiert und ist in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md) festgehalten — Robustheit gegen Hard-Crash kommt mit dem Polish-Sprint, nicht jetzt.

**Konsequenz:** Hard-Crash (Strom weg, Task-Manager-Kill, OOM) lässt orphane running-Sessions in der DB — sichtbar wird das erst, wenn Sprint 6 das Verlauf-Panel baut. Bis Sprint 8 sieht der User das nicht, weil Sprint 3 nur Live-Tabs anzeigt.

**Implementierungsdetail:** Das `shuttingDown`-Flag schützt zusätzlich gegen die Race „lifecycle hat schon transitioniert, pty:exit feuert noch einmal" — die State-Machine selbst lehnt den Übergang `interrupted → completed` ohnehin ab, das Flag ist die saubere Zwei-Linien-Verteidigung (Logging-Lärm + State-Machine-Reject statt nur State-Machine-Reject).

---

## PTY-Backend: @lydell/node-pty (NAPI)

**Entscheidung:** TakumiDeck verwendet `@lydell/node-pty` als PTY-Bibliothek; der ursprünglich in der Sprint-2-Briefing genannte `@homebridge/node-pty-prebuilt-multiarch`-Fork ist explizit *nicht* in Verwendung.

**Varianten:**

- **A** `@lydell/node-pty` mit NAPI-Binaries via optionale Plattform-Subpakete (gewählt)
- **B** `@homebridge/node-pty-prebuilt-multiarch` behalten und Electron auf Major 30 zurückrudern (höchste ABI mit Win32-Prebuilts in dem Fork)
- **C** Visual Studio Build Tools auf der Dev-Maschine installieren und `@homebridge` aus Source kompilieren

**Grund:** Der @homebridge-Fork hat seit ~Monaten keine Win32-Prebuilds für Electron 33+ (höchste ABI v121 = Electron 30). Variante B würde uns ohne tieferen Grund auf eine ältere Electron-Major-Version festhalten — eine Schuld, die später beim ersten Sicherheits-Update fällig wird. Variante C bricht das Memory-Setting „kein VS-Compiler nötig" und kostet 4–8 GB Build-Tools-Setup für ein gelöstes Problem. lydell verteilt **NAPI**-Binaries (ABI-stabil über Node/Electron-Versionen) als optionale npm-Subpakete (`@lydell/node-pty-win32-x64` etc., wie es esbuild macht); kein `electron-rebuild` mehr nötig. Die API ist 1:1 zu Microsofts node-pty.

**Konsequenz:** Native-Module-Workflow für PTY ist trivial geworden — `npm install` + `--ignore-scripts` reicht, kein Rebuild. `electron-rebuild` bleibt für `better-sqlite3` weiterhin Pflicht. Wenn Microsoft selbst eine NAPI-fähige `node-pty`-Version mit Prebuilts herausgibt, kann ein späterer Migrate trivial folgen — die API ist ohnehin identisch.

**Implementierungsdetail:** `realPtySpawn` in `src/main/pty/spawn.ts` wraps `nodePty.spawn` in das schmale `IPtyLike`-Interface, damit die `PtyManager`-Klasse keine Direktabhängigkeit zum Paket hat (Tests fahren mit Fake-Driver, vgl. Sprint-1-Migration-Pattern).

---

## xterm.js auf v5.5 gepinnt (kein v6)

**Entscheidung:** Die App benutzt `@xterm/xterm@^5.5` zusammen mit `@xterm/addon-canvas@^0.7`. Die aktuelle Major v6 ist explizit *nicht* in Verwendung.

**Varianten:**

- **A** v5.5 + addon-canvas (gewählt)
- **B** v6 mit dem eingebauten DOM-Renderer
- **C** v6 mit `@xterm/addon-webgl`

**Grund:** Architektur-K2 verlangt explizit Canvas-Renderer („Kein WebGL-Renderer (Canvas reicht für 2-5 Tabs realistisch)"). xterm.js v6 hat den Canvas-Renderer entfernt — die Wahl wäre dort nur noch DOM (Variante B) oder WebGL (C). DOM-Renderer ist auf größeren Buffern erkennbar langsamer und hat schlechteres Glyph-Rendering; WebGL widerspricht der Architektur-Entscheidung. v5.5 ist weiterhin gewartet (xterm.js bekommt Patches), und addon-canvas 0.7 ist genau dafür gebaut.

**Konsequenz:** Major-Updates auf v6+ sind blockiert, bis entweder ein offizieller Canvas-Renderer-Wiederbeleb von xterm.js kommt oder Architektur-K2 explizit auf WebGL umgestellt wird. Beim nächsten Renderer-Refactor (Phase 2: Heatmap, mehr Tabs) wieder hinterfragen.

---

## claude-Binary-Auflösung: Setting + PATH-Default

**Entscheidung:** Der Pfad zur `claude`-Binary kommt aus `settings.json` als `claude_binary_path` mit Default `'claude'` (= PATH-Lookup). Das Main-Process-Pre-Check-Modul (`src/main/pty/binary.ts`) löst Bare-Names per `where`/`which` auf und bevorzugt auf Windows `.exe` > `.cmd` > `.bat` über das endungslose Unix-Shell-Script.

**Varianten:**

- **A** Setting `claude_binary_path` mit Default `'claude'` + PATH-Lookup mit Extension-Bevorzugung (gewählt)
- **B** Reines PATH ohne Setting — User kann nicht überschreiben
- **C** Auto-Detection beim ersten Start (`where claude` → cachen → bei Fehler User-Prompt)

**Grund:** Variante B scheitert exakt am Sprint-2-Realfall: npm-installiertes Claude Code legt zwei Files an (`claude` ohne Endung als Unix-Shell-Script und `claude.cmd` als Windows-Wrapper). ConPTY kann das endungslose Script nicht starten — wir brauchen die Extension-Bevorzugung sowieso. Variante C addiert magisches Verhalten ohne klaren Mehrwert: wenn Auto-Detection scheitert, landen wir wieder bei einem Setting; und solange sie funktioniert, ist sie kaum von A unterscheidbar. Variante A ist explizit, debugbar (User sieht in `settings.json`, was tatsächlich aufgelöst wird) und sauber überschreibbar für Spezialfälle (Portable-Installs, Multi-Version-Setups).

**Konsequenz:** Der Pre-Check (`resolveExecutable`) gehört zum normalen Spawn-Path und liefert bei Fehlern ein klares `IpcResult.err` mit Code `PTY_BINARY_NOT_FOUND`. Sprint 8 (Settings-Dialog) bekommt die UI dafür; bis dahin editiert der User direkt `settings.json`.

**Implementierungsdetail:** Auf Windows ist die Extension-Reihenfolge `.exe` > `.cmd` > `.bat` > `.com`, damit echte Executables vor Batch-Wrappern bevorzugt werden — sonst würde z.B. ein hypothetisches `claude.exe` im PATH übersehen, weil `where` den `.cmd` zuerst listet. Reicht für npm-CLIs in der Praxis.

---

## Settings-Backend: eigene JSON-Operationen

**Entscheidung:** TakumiDeck verwaltet `settings.json` mit eigenen `fs`-Aufrufen plus atomic write (`.tmp` + rename) statt einer Library wie `electron-store` oder `conf`.

**Varianten:**

- **A** Eigene JSON-Operationen mit zod-Validierung beim Lesen (gewählt)
- **B** `electron-store` mit JSON-Schema-Validation und dot-paths
- **C** `conf` als minimalere electron-store-Alternative

**Grund:** Settings sind das Herzstück der App-Konfiguration und werden mit der Zeit komplexer (Limit-Bars, Custom-Filter). `electron-store` zwingt seine Konventionen auf (Pfad-Auto-Wahl, magische Keys), die bei Migrations zwischen Settings-Schema-Versionen im Weg stehen würden. Eigene Operationen sind 30 Zeilen, vollständig nachvollziehbar, und passen exakt zur Architektur-Entscheidung „Master-Config in JSON-Dateien, App rendert nur" (TAKUMIDECK_ARCHITEKTUR Kapitel 10 Punkt 6).

**Konsequenz:** Wenn das Settings-Schema wächst, müssen wir Migrations selbst schreiben — kein Auto-Migration-Path. Dafür haben wir volle Kontrolle, atomic writes (kein halb-geschriebenes JSON bei Crash) und können jederzeit zu einem Schema-Versions-Feld erweitern, ohne Library-Quirks zu umgehen.

---

## zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1

**Entscheidung:** Jeder IPC-Channel mit Eingangs-Payload bekommt ein zod-Schema, das im Main-Handler vor der Logik per `.parse()` greift.

**Varianten:**

- **A** zod-Validation überall ab Sprint 1 (gewählt)
- **B** Nur an externen Daten-Boundaries (settings.json, JSONL-Files), IPC vertraut TS-Compile-Time
- **C** Komplett später nachrüsten

**Grund:** TypeScript-Types existieren nur zur Compile-Zeit; das Renderer-Bundle könnte theoretisch beliebige Payloads schicken (Bug, Memory-Corruption, Browser-Devtools-Eingriff). Bei einer wachsenden Channel-Liste (Sessions, PTY, Git, Usage in Sprints 2–7) wäre B die ständige Versuchung, den nächsten Channel „mal eben ohne Schema" einzuführen, bis der erste Bug eskaliert. Mit der zod-Convention ab Tag 1 ist das Schema Pflichtbestandteil jedes Handlers — und gleichzeitig die laufende Doku, was ein Channel akzeptiert.

**Konsequenz:** Jeder neue Channel kostet zusätzlich ein Schema in `src/shared/schemas.ts`. Im Gegenzug bekommen wir eindeutige Fehlermeldungen (zod sagt genau, welches Feld kaputt ist), nicht „TypeError: Cannot read property X of undefined" tief im Handler.

**Implementierungsdetail:** Das Patch-Schema (`AppSettingsPatchSchema`) ist mit `.partial()` auf das volle Settings-Schema aufgesetzt — kein Drift möglich.

---

## Logging via electron-log

**Entscheidung:** Main-Prozess loggt über `electron-log` nach `<userData>/logs/main.log`.

**Varianten:**

- **A** electron-log (gewählt)
- **B** `console.log` + eigener Helper, kein Datei-Output
- **C** Erst in Sprint 8 (Polish) einrichten

**Grund:** Production-Builds haben keine offene Konsole, in der `console.log` sichtbar wäre. Sobald das erste Mal jemand schreibt „bei mir geht's nicht" ohne Reproduktion, hilft nur ein File-Log. electron-log handhabt Datei-Rotation, Levels und Multi-Prozess-Logging out-of-the-box; selbst zu schreiben wäre 100+ Zeilen für ein gelöstes Problem.

**Konsequenz:** Settings-Dialog in Sprint 8 bekommt einen „Open Data Folder"-Button, und das Log liegt direkt daneben — kein zusätzlicher UX-Pfad nötig.

---

## Vitest-Setup direkt mit Foundation-Smoke-Tests

**Entscheidung:** Ab Sprint 1 ist Vitest konfiguriert, und vier Test-Dateien (Result-Helper, zod-Schemas, SettingsStore, Migration-Runner) laufen grün.

**Varianten:**

- **A** Setup jetzt + Smoke-Tests für Foundation (gewählt)
- **B** Setup jetzt, Tests folgen mit Sprint 2
- **C** Komplett später

**Grund:** Working Rule 4 verlangt „Test scope per season — Tests cover only the newly added or changed feature". Ohne Tests in Sprint 1 wäre die erste Test-Datei in Sprint 2 entstanden — und die Versuchung wäre groß, „kurz noch die Settings-Tests mitzunehmen". Damit wäre die Per-Season-Disziplin schon im zweiten Sprint hinüber. Tests jetzt zu schreiben verankert die Regel, solange der Scope klein und überschaubar ist.

**Konsequenz:** Migration-Runner ist gegen ein schmales `MigrationDriver`-Interface getestet (Fake-Driver, kein echtes SQLite). Das ist auch die Voraussetzung dafür, dass `npx vitest run` läuft, nachdem `electron-rebuild` die better-sqlite3-ABI auf Electron umgestellt hat — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

**Entscheidung:** TakumiDeck wählt Variante A / B / C – kurz benennen, was sich dadurch konkret unterscheidet.

**Varianten:**

- **A** <Kurzbeschreibung> (gewählt)
- **B** <Kurzbeschreibung>
- **C** <Kurzbeschreibung>

**Grund:** Hier steht, warum A gewinnt. Dieser Abschnitt ist der eigentliche Mehrwert der Datei — nicht abkürzen. Idealerweise ein konkretes Szenario, das B / C schmerzhaft macht, und ein Szenario, das A trivial macht.

**Konsequenz:** Was bedeutet diese Entscheidung für spätere Arbeit? („Wir müssen ab jetzt bei jeder neuen Spalte …", „Ein späteres Feature X lässt sich hier …").

**Implementierungsdetail:** *(optional)* kurze Notiz zu einer Umsetzungs-Wahl, die der Grund-Abschnitt nicht mitbehandelt.
