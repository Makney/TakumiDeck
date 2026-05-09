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
