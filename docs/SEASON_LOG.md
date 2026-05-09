# Season-Log

Protokoll aller abgeschlossenen Seasons. Ergänzt [CHANGELOG.md](./CHANGELOG.md) (das den Feature-Mehrwert dokumentiert) mit dem *Prozess-Kontext*: Was lief gut? Was hat gebremst? Was sollte die nächste Season anders machen?

## Unterschied zum CHANGELOG

- **CHANGELOG.md** → Was kann der Nutzer jetzt? (Ergebnis-fokussiert, fachlich)
- **Dieses Dokument** → Wie lief die Season? (Prozess-fokussiert, retrospektiv)

## Format pro Eintrag

- `##`-Überschrift: `Season <N> — <Feature-Name>`
- **Ziel:** Was war der geplante Scope zu Beginn?
- **Ergebnis:** Was wurde tatsächlich fertig? Delta zum Ziel benennen, falls vorhanden.
- **Gut gelaufen:** Konkrete Dinge, die die Season effizient gemacht haben.
- **Gebremst durch:** Konkrete Hindernisse (unklare Anforderungen, technische Überraschungen, Scope-Creep).
- **Für nächste Season:** Maximal 2–3 direkt umsetzbare Hinweise.

Neue Einträge **oben** anfügen (neuste Season zuerst).

---

## Season 2 — Single-Tab-PTY

**Ziel:** Sprint-2-Sessions-Kern: `@homebridge/node-pty-prebuilt-multiarch` integrieren, PTY-Manager mit 16ms-Buffer-Flush, Session-DB-Repository mit Create/Update, xterm.js mit Canvas-Renderer + Standard-Addons, Single-Tab-TerminalPane im Renderer. Ausdrücklich **kein** Multi-Tab, kein Lifecycle-State-Modell, keine State-Detection — alles Sprint 3+.

**Ergebnis:** PTY-Spawn ✅, xterm.js-Terminal ✅, Session-Lifecycle 🟡 (running→completed automatisch, alles Weitere Sprint 3). End-to-end läuft `claude` als ConPTY-Subprozess, der Output landet live im xterm-Canvas, Sessions liegen in der DB. Tests: 39 grün (10 PtyManager + 9 Session-Repo neu, 20 aus Sprint 1 unverändert).

**Gut gelaufen:**

- Variants-Pflicht hat sich erneut ausgezahlt: drei Vorab-Variants (PtyManager-Lifecycle, Binary-Auflösung, Throttle-Strategie) wurden mit jeweils A vor dem ersten Code beantwortet — und die spätere @homebridge-Sackgasse wurde sofort als vierte Variant-Frage eskaliert statt heimlich gelöst.
- Driver-Injection-Pattern aus Sprint 1 ließ sich 1:1 für PtyManager und SessionRepository wiederverwenden. Tests laufen ohne native Module.
- `uncaughtException`-Sicherheitsnetz + Pre-Checks (Binary, cwd) haben den Renderer-Test-Loop trotz mehrerer ConPTY-Fehler (Code 2, Code 267) lauffähig gehalten — kein Restart-Roulette.
- Memory-Update direkt nach dem PTY-Backend-Wechsel: zukünftige Sessions wissen sofort, dass `electron-rebuild` für PTY nicht mehr nötig ist.

**Gebremst durch:**

- **@homebridge-Fork hatte keine Win32-Prebuilts für Electron 33.** Höchste verfügbare ABI war v121 (Electron 30). Wechsel auf `@lydell/node-pty` (NAPI, Plattform-Subpakete) hat ~30 Minuten Variants-Klärung + Install-Iterationen gekostet. Memory-Eintrag aus Sprint 1 (`electron-rebuild -f -w …`) führt direkt in einen Source-Build-Fehler — `-f` überspringt Prebuilt-Download und triggert node-gyp.
- **xterm.js v6 hat den Canvas-Renderer entfernt**, addon-canvas 0.7 ist v5-only. Nicht in der Architektur erwähnt; aufgefallen erst beim Peer-Dependency-Konflikt während `npm install`. Pin auf v5.5 als saubere Lösung.
- **Vite-Renderer-Config aus Sprint 1 hatte `root` nicht gesetzt.** `http://localhost:5173/` lieferte 404, die „Foundation-Smoke-View" hat in Wirklichkeit nie gerendert — Sprint 1 hatte das fälschlich als ✅ gemeldet. Aufgedeckt durch das schwarze Sprint-2-Fenster, behoben mit `root: src/renderer` + absolutem `outDir`.
- **ConPTY-Fehler kommen aus einem Worker-Thread**, normales try/catch fängt sie nicht. Erst der zweite Iterationsschritt (Pre-Check + uncaughtException-Handler) hat sie zähmbar gemacht.

**Für nächste Season:**

- Bevor ein neues npm-CLI gespawnt wird (Sprint 3 wird `claude --resume <id>` einführen), den `resolveExecutable`-Pre-Check auch für CWD und Argumente erweitern, falls Resume bei nicht-existenter Session-UUID still failed.
- `workspace_path`-Validation gehört spätestens beim Settings-Dialog (Sprint 8), aber wenn Sprint 3 / Sprint 4 sowieso Per-Session-cwd einführen, dort gleich einen Existence-Check pro Session-Spawn vorsehen.
- Sprint 3 muss Multi-Spawn unter React-StrictMode sauber lösen — der initRef-Guard im TerminalPane reicht nur für Single-Tab. Bei Tabs nicht mit `crypto.randomUUID()` im Effect arbeiten, sondern Session-IDs aus dem Store nehmen.

---

## Season 1 — Foundation-Skelett

**Ziel:** Sprint-1-Foundation aufsetzen: Electron-Skelett, IPC, SQLite, Settings-System, tokens.css aus Claude-Design-Export.

**Ergebnis:** Alle vier Foundation-Features ✅. Die App startet via `start-dev.bat`, legt `%APPDATA%\TakumiDeck-dev\` mit kompletter Datenstruktur an und zeigt im Smoke-View Version + Default-Settings über die typed IPC-Bridge.

**Gut gelaufen:**

- Variants-Pflicht vor dem Code: vier offene Architektur-Fragen (Settings-Backend, zod-Timing, Logging, Test-Setup) wurden vor dem ersten File-Schreiben mit A/B/C beantwortet — keine Mid-Sprint-Umentscheidungen nötig.
- Fake-Driver-Pattern für den Migration-Runner: ermöglicht Vitest-Läufe unabhängig vom better-sqlite3-ABI-State, der nach `electron-rebuild` ständig kippt.
- Architektur-Doku als Single-Source-of-Truth: SQLite-Schema, Settings-Defaults und IPC-Channels waren zu 100 % vorgegeben, kein Erfinden nebenbei.

**Gebremst durch:**

- `npm install` schlägt mit Node 24 + fehlendem Visual Studio C++ fehl (better-sqlite3 versucht Source-Build). Workaround: `npm install --ignore-scripts` plus manuell `node node_modules/electron/install.js` plus `npx electron-rebuild`. Hat ~20 Minuten Debug gekostet.
- Vite-Forge-Plugin emittet Output-Files nach Entry-Filename. Beide Entries hießen `index.ts` → Output-Kollision in `.vite/build/`. Nach Umbenennen auf `main.ts` / `preload.ts` sauber.
- Electron-Forge im Bash-Background-Spawn detached die Electron-Stderr — Crashes vor `whenReady()` waren unsichtbar. Workaround: temporärer File-Logger via `os.tmpdir()`. In einer echten Terminal-Session unkritisch.

**Für nächste Season:**

- Bei jedem neuen Native-Modul (z.B. `@homebridge/node-pty-prebuilt-multiarch` in Sprint 2) sofort `npx electron-rebuild -f -w <pkg>` einplanen, nicht erst wenn’s knallt.
- IPC-Channels für PTY und Sessions konsequent mit zod-Schema einführen — die Convention aus Sprint 1 nicht aufweichen.
