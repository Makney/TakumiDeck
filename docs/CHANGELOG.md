# Änderungsprotokoll

Dieses Dokument hält **abgeschlossene** Entwicklungs-Sessions fest. Es ist ein Spickzettel für das zukünftige Ich (und Co-Agenten), um zu sehen *was wann warum* gebaut wurde, ohne durch Git-History graben zu müssen.

## Regel für neue Einträge

Nach jedem erfolgreich implementierten Feature:

1. **Hier** einen neuen Abschnitt mit Datum oben anfügen (neuster zuerst).
2. In [FEATURES.md](./FEATURES.md) den betroffenen Eintrag von ⛔/🟡 auf ✅ setzen.
3. Wenn Roadmap-Phasen erledigt sind, in [ROADMAP.md](./ROADMAP.md) streichen oder als „erledigt" markieren.
4. Wenn architektonische Entscheidungen dabei waren, einen Eintrag in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md) – dort geht es nur um das *Warum*.

Ein Eintrag ist **kurz und anwendungsorientiert**: „Was kann der Nutzer jetzt, was vorher nicht ging?", plus die wichtigsten Dateien, die sich geändert haben. Die *detaillierte* Code-Beschreibung gehört in die Commit-Message, nicht hierhin.

**Keine „Geänderte Dateien"-Listen** — das liefert die Git-History. Eintrag konzentriert sich auf den Nutzer-Mehrwert und die dahinter stehenden Entscheidungen.

---

## 2026-05-13 — Phase 2 Season 4: Erweiterte Template-Variablen + In-App-Template-Management

### Was jetzt geht

- **Drei neue Auto-Variablen im Template-Filler.** `{{LETZTE_SEASON_NAME}}` zieht die zuletzt erfolgreich abgeschlossene Feature-Session aus SQLite (`type='feature'`, `status='completed'`, höchstes `started_at`) und liefert sie als `"Phase X Season Y: <Titel>"` — Phase-Label wird aus `workbench.current_phase_file` der CLAUDE.md best-effort abgeleitet (`PHASE2.md` → „Phase 2"). `{{TECH_SCHULDEN_RELEVANT}}` parst `docs/TECH_SCHULDEN.md` und liefert die Top-3 noch offenen Einträge (Titel + Bereich + Was-Zeile). `{{LETZTE_ENTSCHEIDUNGEN}}` parst `docs/ENTSCHEIDUNGEN.md` und liefert die Top-3 (Titel + Entscheidung-Zeile). Fehlt eine Quelle (keine completed Season, Datei nicht vorhanden, nur META-Sektionen), bleibt die Variable leer im Prompt — Templates referenzieren die drei Variablen explizit, ein leeres Feld bedeutet implizit „kein zusätzlicher Kontext".
- **Template-Body-Extraktion (Konvention A1).** Der Preview-Pane und der finale Send-Pfad ziehen ab jetzt **nur den Inhalt des ersten Code-Fences unter einer `## Vorlage`-Überschrift** — nicht mehr die komplette `.md`-Datei. Templates ohne `## Vorlage`-Heading fallen auf den vollen Datei-Inhalt zurück (Rückwärtskompatibilität, kein Migrate-Step nötig). `SEASON_PROMPT.md` hatte die Struktur seit Sprint 6 schon; die Konvention ist jetzt der vertraglich erzwungene Pfad.
- **Edit + Neu im Templates-Modal.** Pro Projekt-Template steht in der Sidebar ein `✎`-Stift, der die `.md` direkt im Markdown-Editor des Right-Panes öffnet (via `useFileTabsStore.openFile`) und das Modal schließt. Im Modal-Header gibt es einen `+ Neu`-Knopf, der ein Inline-Form für den Dateinamen zeigt, eine leere Vorlage-Datei in `docs/templates/<name>.md` anlegt (mit `## Vorlage (Inhalt)`-Stub) und gleich in den Editor lädt. Globale Templates haben den Stift disabled mit Tooltip-Hinweis — sie liegen außerhalb des Projekt-Roots und das `fs:read/write`-Schema verlangt projekt-relative Pfade.
- **META-Sektion-Filter im Doku-Parser.** TECH_SCHULDEN- und ENTSCHEIDUNGEN-Markdown fangen mit erklärendem Kopf-Material an (`## Unterschied zu anderen Dokumenten`, `## Wann kommt ein Eintrag hier rein?`, `## Format pro Eintrag`). Der Parser ignoriert jetzt Sections ohne `**Bereich:**`/`**Entscheidung:**`-Label — sonst hatten die META-Sektionen den `{{TECH_SCHULDEN_RELEVANT}}`-/`{{LETZTE_ENTSCHEIDUNGEN}}`-Slot mit Erklärtext überschwemmt.
- **Sidebar-Polish für mehrzeilige Auto-Variablen.** Werte mit mehreren Zeilen (= Server-Auto-Vars) erscheinen als kompakter Snippet (`N Einträge · erste Zeile, getrunkiert`) mit „Mehr"-Toggle — aufgeklappt mit `max-height: 12em` + Scroll. Einzeilige Auto-Vars werden weiter inline gerendert.

### Architektur-Notiz

Pure-Logik (`extractTemplateBody`, `parseMarkdownSections`, `formatTechSchuldenRelevant`, `formatLetzteEntscheidungen`, `derivePhaseLabel`, `formatSeasonName`) liegt strikt getrennt von DB/FS/JSX — 53 neue Unit-Tests decken Body-Extraktion (inkl. Tilde-Fences, Info-Strings, ungeschlossene Fences, mehrere Heading-Level), Section-Parser-Edge-Cases (Code-Fences mit `##` innen, `---`-Trenner, META-Filter), Schulden/Entscheidungen-Format-Snippets und Phase-Label-Ableitung ab. Server-Auto-Vars fließen über einen neuen IPC `templates:resolve-auto-vars` (zod-validiert, Default-Project-Bucket bekommt leere Werte). `TemplateFile.relPath` ist im Shared-Typ ergänzt; Reader normalisiert auf Forward-Slash. Entscheidungs-Why in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md), Retrospektive in [SEASON_LOG.md](./SEASON_LOG.md).

---

## 2026-05-13 — Phase 2 Season 3: Trigger-Phrasen-Schnellbuttons in der Action-Bar

### Was jetzt geht

- **Dynamische Pillen in der Action-Bar pro Trigger-Phrase aus `workbench.trigger_phrases`.** Bisher musste man die Doku-Update-Phrase „ist korrekt umgesetzt" manuell tippen — die `commit`-Phrase hatte schon eine Pille (mit Pre-Commit-Modal), `docs_update` aber nicht. Jetzt rendert die Action-Bar für jeden Eintrag aus dem Frontmatter eine eigene Pille zwischen Templates und commit. Klick → Phrase landet als Bracketed-Paste in der aktiven PTY und wird direkt abgeschickt.
- **Frontmatter-Schema akzeptiert beliebige zusätzliche Trigger-Phrasen.** `trigger_phrases` hat weiterhin zwei Pflicht-Keys (`docs_update` + `commit`), kann aber jetzt zusätzlich `<key>: <phrase>`-Paare tragen (z.B. `pr_ready`, `deploy_staging`). Die Pille erscheint ohne Code-Touch, sobald die CLAUDE.md neu geladen ist (Projekt-Wechsel oder App-Restart). Pille-Label = humanisierter Key (`docs_update` → „Doku-Update", `pr_ready` → „Pr-Ready"), Tooltip zeigt die exakte Phrase.
- **`commit` bleibt aus der dynamischen Liste ausgeklammert.** Die bestehende commit-Pille mit PreCommit-Modal (Sensitive-File-Warnung, Branch-Anzeige, Liste der geänderten Dateien) trägt Phase-1-Mehrwert — eine zweite Direkt-Send-Pille daneben würde den User verwirren.
- **Bracketed-Paste-Submit-Fix für Trigger-Phrasen + PreCommit.** Claude Codes TUI behandelt einen Newline **innerhalb** eines Bracketed-Paste-Blocks wie Shift+Enter (Zeilenumbruch im Eingabefeld), nicht wie ein Submit-Enter. Der `td-template-send`-Kanal hat jetzt ein opt-in `submit: true`-Flag — `TerminalTab` schickt nach dem Paste ein separates `\r` direkt an die PTY, das im TUI als Tastatur-Enter ankommt. Trigger-Phrasen-Pillen und PreCommit nutzen das Flag; Templates absichtlich nicht (lange Prompts will man vor dem Submit oft noch prüfen).

### Architektur-Notiz

Pure-Logik in `triggerPhrasePills.ts` (`humanizeTriggerKey`, `buildTriggerPillList`) trennt die Pillen-Daten-Transformation von der JSX-Komponente — 10 neue Unit-Tests decken Sort-Reihenfolge (`docs_update` zuerst, dann alphabetisch), commit-Ausschluss, Defensiv-Filter gegen leere Phrasen und den Title-Case-mit-Bindestrich-Fallback ab. Schema-Lockerung via `.catchall(z.string().min(1))` hält die zod-Validierung an einer Stelle; zwei neue Frontmatter-Parser-Tests sichern, dass zusätzliche Keys akzeptiert, leere Extra-Werte abgelehnt werden. Entscheidungs-Why in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md), Retrospektive in [SEASON_LOG.md](./SEASON_LOG.md).

---

## 2026-05-12 — Phase 2 Season 2: Screenshot-Drag-and-Drop ins Terminal

### Was jetzt geht

- **Bild aus dem Explorer ins Terminal-Pane ziehen — der absolute Pfad landet als Bracketed-Paste im xterm.** Claude liest das Bild via Read-Tool, der Drag-Workflow ersetzt das manuelle Tippen des Pfads. Quoting greift automatisch bei Pfaden mit Whitespace (`"C:\Users\Max Mustermann\…"`), mehrere gedroppte Dateien werden mit Leerzeichen verbunden.
- **Direkt-Bilder ohne Disk-Datei** (Drag aus Snipping Tool, Drag aus einer Webseite) werden ins App-eigene `<userData>/screenshots/screenshot-<UTC-Zeitstempel>.<ext>` gespeichert und ebenfalls als Pfad gepastet. Kein Projekt wird mit Screenshots vermüllt; keine `.gitignore`-Pflege nötig.
- **Clipboard-Image-Paste in derselben Bewegung.** `Win+Shift+S` → Snip im Clipboard → `Ctrl+Shift+V` im Terminal → das Bild wird gespeichert wie ein Direkt-Drop und der Pfad gepastet. Der bestehende Copy/Paste-Key-Handler aus Sprint 3.5 prüft jetzt zuerst Image, fällt sonst auf Text-Paste zurück (Regressions-Schutz).
- **Dezentes Drop-Overlay** während des Drags (gestrichelter Rahmen + Hint-Text mittig); MIME-Whitelist auf PNG/JPEG/GIF/WebP (SVG bewusst ausgeschlossen — XSS-Vektor + Read-Tool braucht es nicht).

### Architektur-Notiz

Pure-Logik (`terminalDropHandler.ts`, `pathQuoting.ts`, `screenshotSave.ts`) liegt strikt getrennt von Render-/IPC-/FS-Glue — 55 neue/erweiterte Unit-Tests decken Klassifikation, Quoting, base64-Round-Trip und den Image-First-Paste-Pfad ab, ohne Browser oder Disk zu brauchen. Neuer IPC `fs:save-screenshot` mit base64-Payload und MIME-Whitelist; Preload-Bridge nutzt `webUtils.getPathForFile` (Electron 32 hat `File.path` entfernt). Entscheidungs-Why in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md), Retrospektive in [SEASON_LOG.md](./SEASON_LOG.md).

---

## 2026-05-12 — Hotfix: Ctrl+C kopiert wieder Selection im Terminal

### Was jetzt geht

- **Ctrl+C kopiert markierten Terminal-Text wieder in die Zwischenablage.** Bisher passierte sichtbar nichts, weil `navigator.clipboard.writeText()` im stillen `void`-`catch`-Pfad des `clipboardKeyHandler` an einem fehlenden Permission-Grant scheiterte. Ctrl+Shift+C ebenfalls. Ctrl+V lief weiterhin, aber nur durch xterms nativen `paste`-DOM-Event-Pfad, der die Permission-Pipeline umgeht — das hatte den Bug maskiert.
- **Bei leerer Selection bleibt Ctrl+C wie bisher SIGINT-Durchlass** — Smart-Ctrl+C-Verhalten unverändert.

### Ursache

Der default-deny Permission-Handler aus dem MVP-Pre-Release-Hardening (siehe vorigen Eintrag) hob Chromes Auto-Grant für `clipboard-sanitized-write` mit auf. Fix: schmale Whitelist (`clipboard-sanitized-write` + `clipboard-read`) im Permission-Request- und Permission-Check-Handler; alle anderen Permissions bleiben default-deny. Siehe Amendment in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md) zur ursprünglichen Hardening-Entscheidung.

---

## 2026-05-12 — Phase 2 Season 1: Volle State-Detection

### Was jetzt geht

- **Status-Pille schaltet auf `waiting` (gelb), sobald Claude geantwortet hat und der Input-Prompt sichtbar ist.** Bisher hing der Tab-Dot auf grün (`running`), weil Claude Code 2.x den `? for shortcuts`-Hint unter einer Rounded-Box mit 2-Leerzeichen-Einrückung rendert und das waiting-Pattern den führenden Whitespace nicht toleriert hat. Patterns akzeptieren jetzt eingerückten Hint (`^\s*\?\s+for shortcuts\s*$` plus `^\s*[>❯]\s+\?\s+for shortcuts\s*$` für die Variante mit Prompt davor).
- **Permission-Prompt-Erkennung greift weiterhin** (höchste Priorität im Pattern-Pfad), `waitingBlockers` schützen vor False-Positive während `esc to interrupt` sichtbar ist, `runningIndicators` halten extended-thinking-Sessions auf `running`, auch wenn die JSONL keinen frischen Timestamp liefert.
- **Versionierte Pattern-Definition (`cc-1.x`) mit Schema-Test pro Claude-Code-Version.** Neue Pattern-Generationen kommen als zusätzlicher `PatternVersion`-Eintrag dazu — alte Fixtures bleiben grün, A/B-Vergleich nachträglich möglich.
- **Verantwortlichkeits-Aufteilung Renderer-TUI ↔ Main-JSONL** klar dokumentiert in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md).

### Diagnostik

- Phase-2-Season-1 wurde im letzten Anlauf gestartet, ohne den echten Claude-Code-2.x-Buffer-Inhalt zu kennen — Patterns wurden aus dem Spec entwickelt und matchten daran vorbei. Diesmal: temporäres DevTools-Logging pro Tick (`detected`, `lastPushedState`, `bufferChanged`, JSON-stringified Tail) im Live-System reproduziert, Box-Layout an der Konsole gesehen, Pattern um `^\s*`-Toleranz erweitert. Logging direkt nach Bestätigung wieder entfernt.

---

## 2026-05-12 — MVP v0.1 ready — Phase 1 abgeschlossen

Mit dem Abschluss des Code-Review-Passes (siehe folgender Eintrag) sind alle Phase-1-Features in [FEATURES.md](./FEATURES.md) auf ✅. TakumiDeck ist im Daily-Use-Zustand: Electron-Skelett mit Hardening, Multi-Session-PTY-Tabs mit Lifecycle/Resume, Workspace-Scanner mit CLAUDE.md-Parser, Token-Dashboard mit JSONL-Watcher und P90-Detection, Templates mit Variable-Filling, Season-Tracker mit Verlauf-Panel, Markdown-Editor + Diff-Viewer + Pre-Commit-Panel, Settings-Dialog mit 6 Tabs und JSON-Editor, `npm run make`-Build (Squirrel-Setup + Portable-ZIP). Sprint-9-UI-Vergleich gegen Design-Vorlage komplett (kritisch + alle B/C/D-Punkte umgesetzt).

Phase 2 ist **trigger-getrieben** dokumentiert in [roadmap/PHASE2.md](./roadmap/PHASE2.md) — kein Auto-Start, sondern Schmerzpunkt-driven aus der Phase-1-Nutzung. FEATURES.md hat dafür ein ⛔-Skelett erhalten.

### Hotfix-Nachzug

- **CSP-Dev-Block (Commit `6fe11a9`)** — Folge des Electron-33→41 + Vite-5→6-Bumps. Vite-6 `@vitejs/plugin-react` injiziert ein inline Fast-Refresh-Preamble, das die strict `script-src 'self'`-CSP aus der statischen `index.html` blockte → Renderer blieb leer. Fix: Meta-CSP aus statischer `index.html` raus, via Vite-Plugin nur beim Production-Build wieder injiziert (identische strict-Werte); Header-CSP in `main.ts` dev/prod-aware (Dev erlaubt `'unsafe-inline'`/`'unsafe-eval'` + `ws://localhost:5173` für HMR, Production unverändert strict).

---

## 2026-05-12 — Code-Review-Pass MVP-Pre-Release abgeschlossen

Die neun Bereiche aus [docs/code-review/REVIEW_PLAN.md](./code-review/REVIEW_PLAN.md) sind durch. Bereiche 1–3 + 7–9 bereits in den Vortagen (Commits `ebe2c90`, `257c752`, `850bc79`, `5dc33d0`, Hotfix `ecdca93`), Bereich 4 + 5 heute (siehe die zwei folgenden Detail-Blöcke). Status-Matrix in REVIEW_PLAN.md auf den tatsächlichen Stand bereinigt; OFFEN_BUILD.md für Bereich 9 nachgeholt (DevDep-CVE-Tail, E42-Blocker, `exactOptionalPropertyTypes`-Slot, `electron-winstaller`-Pin-Anker, Husky-Test-Scope — alle als Design-by-Choice mit klaren Trigger-Bedingungen).

---

## 2026-05-12 — Code-Review Bereich 5 (Preload-Bridge)

### Was jetzt geht

- **Externe Links öffnen sicher im System-Browser statt im App-Fenster.** `setWindowOpenHandler` öffnet http(s)-Ziele jetzt explizit via `shell.openExternal` (statt nur stumm zu denyen); andere Schemata (`file:`, `javascript:`, `data:`) werden weiter blockiert — keine Sniff-Vektoren via target="_blank".
- **In-Place-Navigation aus dem Renderer wird geblockt.** Neuer `will-navigate`-Handler verhindert, dass z.B. ein versehentliches `location.href = '…'` den Renderer auf eine fremde Origin schickt; HTTP(S)-Ziele werden stattdessen extern geöffnet (Electronegativity LIMIT_NAVIGATION_GLOBAL_CHECK).
- **Permission-Requests werden default-deny abgewiesen.** `session.setPermissionRequestHandler` + `setPermissionCheckHandler` lehnen alle Browser-Permissions (Mikrofon, Geolocation, Notifications, MIDI, …) ab; TakumiDeck braucht keine davon und kann sie bei Bedarf in einem zukünftigen Sprint explizit whitelisten (Electronegativity PERMISSION_REQUEST_HANDLER_GLOBAL_CHECK).
- **CSP greift jetzt auch als HTTP-Header, nicht nur als Meta-Tag.** `webRequest.onHeadersReceived` setzt dieselbe CSP wie der Renderer-HTML-Meta-Tag zusätzlich als Header — robuster als Meta-only (greift vor dem ersten Script-Tag, gilt auch für file://-Loads). Werte sind identisch zum Meta-Tag und bei Änderung an beiden Stellen zu pflegen (Electronegativity CSP_GLOBAL_CHECK).

### Review-Befund-Stand

- **Echte Bugs/Warnings im Preload:** keine — die Bridge ist sauber. Ausschließlich `contextBridge.exposeInMainWorld`, keine Node-API durchgereicht, jeder Wrapper macht genau einen IPC-Call gegen einen existierenden Channel mit Handler, Listener-Wrapper liefern saubere Unsubscribe-Handles (kein Leak), keine internen Electron-Objekte queren die Bridge-Grenze.
- **Channel-Abdeckung:** alle 31 Channels in `ipc-channels.ts` haben entweder einen `ipcMain.handle`-Handler (`src/main/ipc/*`) oder werden als Push-Channel (`pty:data`, `pty:exit`, `usage:update`) aus dem ipc-Layer heraus gesendet. Keine toten Channels.
- **Gefixt im Main-Prozess** (Bereich-3-Folge, schmaler Scope ≤ 30 Zeilen ohne Whitelist-Pflege): die 3 Electronegativity-Global-Findings — siehe „Was jetzt geht".
- **Design-by-Choice** in [docs/code-review/OFFEN_PRELOAD.md](./code-review/OFFEN_PRELOAD.md) (vorbestehender `api.notes`-Phase-2-Stub-Eintrag bleibt unverändert).

---

## 2026-05-12 — Code-Review Bereich 4 (IPC-Handler)

### Was jetzt geht

- **Konsistentes Error-Code-Schema in `app:*`-Handlern.** `app:get-version` und `app:open-data-folder` setzen jetzt explizite Code-Konstanten (`APP_GET_VERSION`, `APP_OPEN_DATA_FOLDER`) im `errFromUnknown`-Fallback — bisher kamen Internal-Errors dort ohne Code zurück. Der Renderer kann jetzt für alle Handler einheitlich auf `result.code` switchen, statt die App-Handler als Sonderfall behandeln zu müssen.

### Review-Befund-Stand

- **Echte Bugs:** keine neuen Funde — die in den Inline-Kommentaren der Handler dokumentierten Vorgänger-Befunde (B-1 ended_at-Patch, B-2 Sender-Guard, B-3 Pfad-Leak-Replace, B-4 realpath-Anti-Traversal, B-5 cwd-aus-Project, B-6 String-Size-Caps) sind alle bereits umgesetzt.
- **Warning:** Code-Konstante in `app:*`-Handlern ergänzt (siehe oben).
- **Design-by-Choice + Verbesserungen** in [docs/code-review/OFFEN_IPC.md](./code-review/OFFEN_IPC.md) dokumentiert: zod-Message-Leak-Restpfad in app/settings (Single-User-Tool-Setting), `usage:heatmap`-Stub ohne try/catch (kein Side-Effect), unvalidierter `--model`-ARGV-Wert (keine Shell-Eval), `pty:create`-Re-throw statt `return err` (Stilistik), `session:update` mit leerem Rest-Patch (Micro-Optimization). Komplexitäts-Hotspots aus dem Fallow-`health`-Vor-Pass sind verifiziert und als nicht-aufteilbar dokumentiert.

### Validierung

- `npm run typecheck` grün, `npm run lint` grün, `npx vitest run` grün (398/398 Tests).

---

## 2026-05-12 — Hotfix: Electron-Range konsistent auf 41 (Start-Block aufgelöst)

### Was jetzt geht

- **`start-dev.bat` startet wieder.** Der Code-Review-Commit von davor hatte `package.json` auf `"electron": "^42.0.1"` gebumpt, während `package-lock.json` und `node_modules` auf 41.5.1 stehen blieben. `electron-forge start` zog beim Native-Module-Rebuild die Header von Electron 42 (`~/.electron-gyp/42.0.1`) und versuchte `better-sqlite3` aus Source zu bauen — was an zwei Fronten scheiterte: kein Prebuilt-Binary für Electron-ABI v146 und harte V8-13-API-Inkompatibilitäten (`v8::External::New/Value` Signatur-Bruch, `cppgc/heap.h` nutzt `__builtin_frame_address` als GCC/Clang-Intrinsic, MSVC kennt es nicht). Auch eine frische VS-2022-Build-Tools-Installation löste das nicht — die Quelle ist nicht baubar gegen Electron-42-Header.
- **Konsistenz Range ↔ Lockfile ↔ `better-sqlite3`-Prebuilds.** `electron` auf `^41.5.1` gepinnt (= installierter Stand und Lockfile-Stand), `better-sqlite3` 12.9.0 zieht seinen E41-Prebuilt (ABI v145) sauber. `npx @electron/rebuild -w better-sqlite3 -o better-sqlite3 -v 41.5.1` läuft durch, Forge-Boot grün bis `Launched Electron app`.

### Umgesetzte Entscheidungen

- **Electron-Bump-Regel verschärft.** Vor jedem Electron-Major-Bump muss `npx prebuild-install -r electron -t <ziel>` im `better-sqlite3`-Modul getestet werden — wenn kein Prebuilt verfügbar ist, ist der Bump aktuell nicht möglich, weil die Quelle gegen Electron 42 nicht kompilierbar ist. Eintrag in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md) erweitert; ENTSCHEIDUNGEN-Eintrag „Electron auf 41 statt 42" präzisiert (nicht nur VS-Toolchain-Frage, sondern quelltext-Inkompatibilität).

### Restrisiken

- VS-2022-Build-Tools (Workload VCTools + Win11 SDK 26100) sind jetzt lokal installiert und bleiben als Reserve für künftige Native-Module-Aufgaben — der primäre Pfad bleibt aber Prebuild-Download. Build-Toolchain-Tail aus dem Code-Review-Eintrag unverändert.

---

## 2026-05-12 — Code-Review Build/Konfig + Security-Upgrade (Electron 41, Vite 6)

### Was jetzt geht

- **Electron-Hardening durchgängig.** Fuse `LoadBrowserProcessSpecificV8Snapshot: false` ergänzt (Single-Snapshot-Modus, aus dem Review-Auftrag-Soll). MakerZIP-Plattformliste auf `['win32']` reduziert — CLAUDE.md-Target war immer Win11, darwin-ZIP produzierte ungetestete Artefakte. `packagerConfig.appBundleId: 'dev.takumideck.app'` gesetzt, Architektur-1-Naming-Lücke geschlossen.
- **Vite-Configs sicherer.** `vite.renderer.config.ts` setzt `base: './'` — Production-Bundle lädt Assets relativ, kompatibel mit Electron-`file://`-Protokoll auch bei Forge-Plugin-Default-Drift. `vite.main.config.ts` externalisiert zusätzlich `chokidar`, `simple-git`, `gray-matter`, `js-yaml` — Main-Prozess-Deps mit Node-Built-In-Anhängigkeiten werden zur Laufzeit aus `node_modules` geladen statt fragil gebündelt.
- **ESLint deckt alle Source-Pfade.** `forge.config.*` und `vite.*.config.*` aus dem Ignore-Block raus, neuer Block mit Node-Globals für Build-Configs. `@typescript-eslint/no-empty-object-type` von `off` auf `warn` gehoben — Pre-Commit-`--max-warnings=0` erzwingt jetzt Fix bei neuen Stellen.
- **Type-aware ESLint aktiviert.** `parserOptions.projectService: true` (TS-ESLint-v8-API) mit `allowDefaultProject` für Top-Level-Build-Configs. Drei scharfe Regeln: `no-floating-promises` (Error), `no-misused-promises` (Error, mit `checksVoidReturn.attributes: false` für React-`onClick={async...}`-Handler), `await-thenable` (Error). Zwei echte Floating-Promises gefixt: `src/main/main.ts:113` (`app.whenReady().then(...)`) und `src/renderer/components/DiffViewer.tsx:184` (`Promise.all([...]).then(...)`) — beide idiomatisch mit `void`-Prefix als fire-and-forget markiert.
- **Electron 33.2.0 → 41.5.1.** Behebt 18 High-CVEs aus dem npm-audit (ASAR-Bypass, IPC-Spoofing, Use-after-free in Permission-Callbacks, HTTP-Response-Header-Injection u.v.m. — alle in `electron <= 39.8.4`). Native-Module mitgezogen: `better-sqlite3` 11.5.0 → 12.9.0 (für Electron-41-Prebuilts, ABI v145); `@lydell/node-pty` als NAPI-Modul ohne Rebuild übernommen. `npx electron-rebuild -f -o better-sqlite3` lief sauber über die Prebuilts durch — kein VS-Build-Toolchain-Bedarf.
- **Vite 5.4.11 → 6.4.2 + Vitest 2.1.5 → 3.2.4.** Behebt die esbuild-Dev-Server-CVE (`@vitejs/plugin-react` 4.3.3 → 4.7.0 wurde mitgezogen). Alle 398 Tests grün, `npm run package` baut Vite-Bundles, Native-Deps und das Win32-x64-Package sauber durch.
- **Dependency-Hygiene.** Ungenutzte `codemirror`-Umbrella-Dependency entfernt (alle Sub-Pakete `@codemirror/*` sind weiter direkt deklariert, der Umbrella-Re-Export war tot). `@electron-forge/shared-types` als explizite devDep aufgenommen — wurde vorher nur transitiv durch Forge-CLI bereitgestellt, der Type-Import in `forge.config.ts:1` ist jetzt sauber aufgelöst.

### Umgesetzte Entscheidungen

- **Electron 41 statt 42.** Siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md). `better-sqlite3` 12.9.0 hat noch keine Prebuilts für die Electron-42-ABI (v147+), und ein Source-Build scheitert lokal an fehlenden VS Build Tools. Electron 41 deckt alle 18 gemeldeten CVEs ab — der Bump auf 42 wartet auf neue Prebuilts.
- **`exactOptionalPropertyTypes: true` aufgeschoben.** Aus dem Review-Auftrag-Soll. Vermutete Type-Error-Kaskade über den Bestand — eigene Story mit Migrations-Pass. Eintrag in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **Type-aware Lint mit `projectService` statt explizitem `parserOptions.project`.** Moderne TS-ESLint-v8-API, Auto-Discovery der Tsconfigs, kein manuelles Pflegen der project-Liste. `allowDefaultProject`-Whitelist deckt die fünf Top-Level-Build-Configs ab (`forge.config.ts`, `vite.*.config.ts`, `vitest.config.ts`, `*.config.mjs`).

### Restrisiken (npm audit)

28 Vulnerabilities verbleiben (6 low, 22 high) — **keine** Production-Code-Pfade, alle transitiv über die Build-Toolchain (`tar`, `tmp`, plus Build-Tools im `better-sqlite3`-Tarball). Upstream-Fixes ausstehend. Siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md) für Details und Wartungsweg.

---

## 2026-05-11 — Code-Review Bereich 8: Modals + Components

### Was jetzt geht

- **HistoryActionModal hat einen Esc-Handler.** Das Auswahl-Modal (Resume/Archive/Verlauf-Öffnen) ließ sich vorher nur per Backdrop-Click oder ×-Button schließen — Architektur-6.0.1-Verstoß. Jetzt wie in den fünf anderen Modalen `useEffect` + `keydown→Escape→onClose`. Zusätzlich threaded `App.tsx` `settings.default_model` als Prop durch, sodass der Resume-Fallback bei fehlendem `current_model` aus den Settings kommt statt hardcoded Sonnet-4-6.
- **UsageDetailModal-Burn-Rate-Chart funktioniert wirklich.** `burnSeries` war als `useState(() => result?.perModel...)[0]` initialisiert — der Initializer feuerte nur beim ersten Render mit `result === null` und cachte `[]` für die gesamte Modal-Lebensdauer. Async eintreffende Daten landeten nie im Chart. Auf `useMemo([result])` umgestellt.
- **Sensitive-File-Detection vollständig laut Architektur 6.7.** Bisher nur `.env(.*)`, `secrets.*`, `*.key`, `*.pem`. Jetzt zusätzlich `*secret*` (Substring, fängt `mysecrets.txt`/`api-secret.txt`/`my_secret_config.json`), `*token*` (Substring), `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`-SSH-Keys (mit/ohne Endung, deckt auch `.pub` ab), `credentials.{json,yaml,yml}` (gcloud/aws-Style). 13 Test-Cases (vorher 11), zwei kippten von `false`→`true` durch die breitere Spec.
- **Settings-Modal Save-Status-Race behoben.** Die 1.5 s „✓ Gespeichert"-Badge feuerte `setSaveStatus({ kind: 'idle' })` aus einem `setTimeout` im `onOutcome`-Handler — bei schnell hintereinander folgenden Saves konnte der alte Timer einen frischen `saving`/`error`-Status zurück auf `idle` klobben. Timer jetzt in `useRef`, vor jedem neuen Outcome canceln, beim Effect-Unmount cleanen. Außerdem `Number.isFinite`-Validation für die drei Warning-Schwellen-Inputs (Gelb/Orange/Rot), analog zu den anderen Number-Feldern — NaN aus Paste löst keine schemaweise Patch-Abweisung mehr aus.
- **DiffViewer git:show-Fehler nicht mehr silent.** Untracked Files liefert der Driver als `ok+empty` — ein echter Err von `git:show` war bisher silent zu „komplett neue Datei" geworden, ohne dass der User es bemerkt. Jetzt `console.warn` mit Pfad und Error-Message; gerendert wird trotzdem (kein UI-Bruch bei nicht-fatal-Errors).
- **MarkdownEditor-Initial-Mount-Pulse weg.** Der `useEffect(() => onDirtyChangeRef.current?.(dirty), [dirty])` feuerte beim Mount mit `dirty=false` und sendete Eltern-Komponenten einen Pseudo-Cleanup. `lastReportedDirtyRef` filtert: nur bei echtem Wechsel an Eltern melden.
- **FIXMEs aus OFFEN_MODALS bereinigt.** `PreCommitModal:102` (instabile useMemo-Dep) wurde durch `useMemo([state.status])` um den Logical-Or stabilisiert; `PreCommitModal:159` (`„...":` Mischung) durch U+201C als Schließquote; `DiffViewer:1` (ungenutzter `useMemo`-Import) entfernt. Alle drei eslint-disable-Kommentare raus.
- **Toter `inputRef` in TemplatesModal-UserInput entfernt.** Ref wurde zugewiesen, nie gelesen — Überbleibsel aus einem nie eingebauten Auto-Focus.

### Umgesetzte Entscheidungen

- **18 Befunde im Report, 11 davon gefixt.** Bugs (Esc-Handler, burnSeries) und Warnungen (Sensitive-Patterns, Save-Race, Threshold-Inputs, DiffViewer-Logging) durchgefixt. Die drei FIXMEs aus OFFEN_MODALS aufgelöst. Verbesserungen (HistoryActionModal-defaultModel, MarkdownEditor-Pulse, TemplatesModal-toter-Ref) als Drive-by mitgenommen.
- **Sieben Befunde explizit nach OFFEN_MODALS verschoben.** Focus-Trap/Restore (eigener Hook nötig), `validateUserPatterns`-Verkabelung (gehört zu Sensitive-Patterns-Feature-Erweiterung), `useEscapeKey`-Hook-Extraktion (Refactoring ohne Auftrag, Trigger: 7. Modal-Typ), CM6-Mount-Boilerplate-Extraktion (Trigger: 3. CM6-Anwender), Komplexitäts-Hotspots (akzeptiert ohne konkreten Bug). Sub-Bereich-Findings sind dort mit Datum, Auflösungs-Trigger und Begründung dokumentiert.
- **Test-Scope strikt auf Sensitive-Patterns begrenzt.** Nur `sensitive-files.test.ts` angefasst (CLAUDE.md Regel 4: Tests covern nur das neu geänderte Feature). `mysecrets.txt`/`secrets`-Cases gekippt, drei neue Cases für `*token*`, `id_rsa`-Varianten und `credentials.{json,yaml,yml}` dazu. Keine Tests für die anderen 10 Fixes, weil das Refactorings/State-Race-Fixes sind, die keine isolierten Pure-Logik-Asserts ermöglichen.

### Bonus-Bugfixes unterwegs

- **Hard-coded Modell-Fallback in HistoryActionModal aufgelöst.** War als reine Verbesserung gemeldet (Architektur-6.2-Default-Hierarchie nicht eingehalten) — beim Esc-Handler-Fix sowieso im File, also gleich mitgenommen.

---

## 2026-05-10 — Season 9: Pre-Release-QA — UI-Vergleich gegen Design-Vorlage

### Was jetzt geht

- **Vorlage-Treue durchgängig.** Pixel-Pass durch alle sichtbaren Komponenten gegen `docs/design/claude-export/` mit zwei Findings-Listen (`docs/code-review/SPRINT9_UI_FINDINGS.md` initial, `SPRINT9_LIVE_VERGLEICH.md` nach den Fixes). Display-Font ist jetzt überall im richtigen Slot: 22 px für Sidebar-Sektionen (Projekte/Aktive Sessions/Verlauf/Notizen) und Modal-Titles, 28 px für die PlanPane-Headline, klein-uppercase nur für Captions. Mid-Spalten-Verteilung zurück auf 1fr/1fr (Sprint-8-Pivot 1.6fr/1fr widerrufen, Editor war zu schmal).
- **Window-Frame-Tab-Optik in der Mid-Spalte.** Tabs sehen jetzt aus wie nahtlos angesteckte Browser-Tabs (`border-radius: 6px 6px 0 0`, `bottom: -1px`, active-Tab versteckt seinen unteren Border mit panel-Farbe). Tab-Add-Button ohne fixe Höhe, fließt im flex-stretch mit. Status-Dot bleibt drin (bewusste Spec-Erweiterung — Multi-Tab-Übersicht).
- **KeyboardHints in der richtigen Hierarchie.** Vorlage hatte die Hints als Footer im `td-term-input-wrap`, ohne Trennlinie — jetzt sitzt unsere `td-keyboard-hints`-Sektion zwischen xterm und Action-Bar (Reihenfolge xterm → Hints → ActionBar), ohne dashed Border. ActionBar's `border-top` übernimmt den Trenner.
- **Action-Bar mit ctx-Slot.** `ctx`-Bar zwischen Pillen und Status, live verkabelt mit `useUsageStore.contextBySession[sessionId]`. Bei fehlenden Daten oder 0 Tokens halb-transparent (`opacity: 0.5`). `flex: 1 1 240px` mit `min-width: 240px` löst zusammen mit `flex-wrap: wrap` das Wrapping-Problem: bei schmalen Mid-Spalten wandert ctx + Status auf eine zweite Zeile statt zur Unsichtbarkeit zu schrumpfen. Container-Query als Schutznetz.
- **PlanPane-Bars sichtbar mit klarer Füll-Anzeige.** Track 4 → 12 px mit `box-sizing: border-box` + 1-px-Border (`line-3`) gegen den Panel-Hintergrund + `min-height: 12 px` als Kollaps-Schutz + `width: 100 %` + `align-items: stretch` auf der UsageBar selbst (`<button>`-UA-Default schrumpfte den inneren Track sonst auf min-content). UsageBar als Vorlage-treue Zeile statt Card (B17-Variant-A). 3 Bars verteilen sich gleichmäßig auf die 300-px-Zeile via `flex: 1 1 0; justify-content: center`. „Wöchentlich · Claude Design"-Default raus (Web-App-eigenes Limit), „Nur Sonnet" → „Wöchentlich · Nur Sonnet".
- **Diff-Viewer hübscher.** Header größer (font 11 → 13 px, Branch 14 px bold-accent, +/~/−-Counts als farbige Badges mit Background + Border). Per-File-Line-Counts (`+12 −3`) rechts neben dem Pfad — `realGitDriver.status` ruft jetzt parallel `git diffSummary()` auf und merged die Insertions/Deletions in `GitFileChange`. Pfad in `dir`/`name` gesplittet (Folder dim, Filename hell, active = accent), `direction: rtl` auf dem Folder-Span sodass beim Truncate der **letzte** Folder + Filename sichtbar bleiben, nicht der Anfang. Mark als Badge (Background + Border je Status).
- **MD-Editor mit Soft-Wrap und größerer Schrift.** `EditorView.lineWrapping` im CodeMirror — lange Markdown-Zeilen brechen visuell, das Doc bleibt unverändert. CodeMirror-font 12.5 → 13.5 px in MD-Editor und Diff-View, Toolbar an Diff-Header-Maße angeglichen (font 13 px, padding 10/14, Pfad in `text` statt `text-dim`). Schnellzugriff-Footer-Pills entfernt — der rechte FilesPanel-Tree übernimmt die Funktion.
- **FilesPanel-Header konsistent.** Caption-Header in der rechten Spalte raus, durch `td-panel-head` + `td-panel-title` (22 px Display) ersetzt — visuell konsistent mit Projekte/Aktive Sessions/Verlauf in der linken Sidebar. `.td-file.selected` markiert die Datei, die im EditorPane gerade als aktiver Tab offen ist (Spalte 4 ↔ Spalte 3 visuell verbunden). Filter-Placeholder mit Phase-2-Hinweis: „Dateien filtern… (?Text zur Inhaltssuche, Phase 2)".
- **Settings-Modal als 2-Spalten-Sidebar (V D5-A).** Horizontale Tab-Bar raus, klassisches Preferences-Layout: 180 px Sidebar mit `td-list-item`-Klassen (App-konsistent), 1 fr Content. Inner-Scroll auf der Content-Seite, Outer-Scroll deaktiviert (sonst Doppel-Scrollbar). Token-Tracking-Tab ergänzt: JSON-Editor-Hint erklärt das neue `reset_schedule`-Feld pro Bar (UI-Slot, Backend Phase 2).
- **Per-Bar Reset-Schedule (UI-Slot).** `LimitBar.reset_schedule?: { day_of_week, hour, minute }` (Wochentag 0=Sonntag–6=Samstag). UsageBar-Tooltip zeigt „Reset: Montag 00:00 (Phase-2-Backend)" wenn gesetzt. zod-Schema validiert, im JSON-Editor des Settings-Dialogs editierbar. Echte Aggregation berücksichtigt den Wert noch nicht — `window_hours`-Rolling bleibt aktiv bis Phase 2 nachzieht.
- **HistoryActionModal — Klick auf Verlauf-Eintrag öffnet kleines Auswahl-Modal.** Drei Aktionen: ↻ Resume (Tab anlegen + claude resumen, mit Inline-Confirm-Pattern bei Archiv), ⌧ Archivieren, → Im Verlauf öffnen (Standard-HistoryPane-Replace-View). Vorher öffnete der Klick direkt die HistoryPane, der User musste die Session dort nochmal auswählen. Footer-Button „→ Alle anzeigen" in der Sidebar-Verlauf-Box öffnet weiterhin die HistoryPane-Tabelle.
- **C-Punkte als UI-Slots vorbereitet.** Toast-Komponente mit `useUiStore.flashToast(msg)` (Phase-2-Aufrufer; UI ist da, Trigger-Stellen folgen). StatsPane-Range-Toggle „Alle/30d/7d" mit lokalem State (Phase-2-Aggregations-Filter). TitleBar-System-Status-Slot „Terminal · P90 192 h" rechts vor den Icons (statisch, Phase-2-dynamisch). `td-file.selected` und `td-files-clear` (×-Button) als kleine UX-Pluspunkte direkt funktional.
- **Naming-Drift-Refactor (D-Punkte).** Klassen an Vorlage angeglichen: `.td-app-main` → `.td-main`, `.td-right-stack` → `.td-col-right-stack`, `td-stats-pane` → `td-dash-pane`/`td-dash-head`/`td-dash-tabs`/`td-dash-range`/`td-dash-tab`/`td-ueb-stats`/`td-stat .lbl/.val/.sub`. NewSessionModal + TemplatesModal auf `td-field`/`td-radio-row`/`td-radio` (HistoryPane-Filter behält Sprint-6-Klassen, weil Status-Filter Multi-Select-Semantik haben).
- **Token-Format einheitlich.** `fmtTokens(n)` (k/M/G) als shared util in `components/fmtTokens.ts`. Action-Bar-ctx und StatsPane-Karten nutzen denselben Helper. Vorher zeigten die Karten 9-stellige Zahlen (`277.250.657 Tokens`) — jetzt `277.3 M`.
- **Terminal-Resize-Pipeline robuster.** ResizeObserver + Window-Resize-Listener triggern fit() via `requestAnimationFrame` (DOM-Layout final, kein stale `clientWidth`). `rafScheduled`-Guard koalesziert Resize-Bursts auf einen fit-Call pro Frame. Initial-Spawn auch nach RAF-Tick, damit cols/rows zur PTY mit echten Container-Maßen übermittelt werden statt mit dem 80-Default. xterm-eigene Scrollbar gestylt (8 px, td-line-2-Thumb) — der weiße Browser-Default-Balken ist weg.
- **`estimateTerminalCols(fontSize)` für den Resume-Pfad.** `claude --resume <id>` wurde mit `cols: 80, rows: 24` hardcoded gespawnt — bei Mid-Column < 80 cols schnitt xterm den Welcome-Output rechts ab (Buffer wird nicht reflowt). Der neue Helper misst `.td-col-mid-top.clientWidth` und teilt durch ~0.6 × fontSize, sodass claude von Anfang an mit der richtigen Spalten-Zahl spawnt. TabContainer.handleResume und HistoryActionModal nutzen ihn.
- **Sidebar-Höhe gleichmäßig + Hover-Differenzierung.** Projekte/Aktive Sessions/Verlauf bekommen alle `flex: 1 1 0` (vorher: Aktive-Sessions ungebremst, Verlauf 280-px-Cap, Projekte content-height — sehr ungleich). `.td-list-item:hover` Background-Wechsel ohne Border (sonst nicht von Active zu unterscheiden), `.active` mit `var(--td-accent)`-Border (statt accent-line) für eindeutigen Aktiv-Status.

### Umgesetzte Entscheidungen

- **Findings-Ladder durchgängig: 5 kritisch + 20 kosmetisch + 6 Spec-Erweiterungen + 6 Spec-Klärungen, dazu 5 Live-Findings (L1–L5).** Alle direkt gefixt außer denen, die explizit Phase 2 sind (PlanPane → Detail-Pfeil-Button, StatsPane-Heatmap, Reset-Berechnung). Variants nur für nicht-trivialen Scope: A1 (Tab-Optik Window-Frame vs. Pillen — Vorlage gewann nach Working-Rule „bei Konflikt gewinnt die Vorlage"), B17 (UsageBar Card → Zeile, Variant A), D5 (Settings-Modal-Layout Variant A), Reset-Scope (pro Bar) + Backend-Logik (UI-Slot, Phase 2).
- **Memory-Konvention-Stand: 4 aktive Memories tragen weiter, kein Sprint-9-Reminder nötig.** UX-Defaults: konvenient vor traditionell hat in Sprint 9 mehrfach gegriffen (Tab-Optik nicht für Pillen-Bequemlichkeit gehalten, sondern Vorlage; UsageBar als Zeile statt Card; Settings-Sidebar statt horizontale Tabs). StrictMode-Guard war für die UsageBar-Hover-Stabilisierung relevant.
- **Vorlage-Konflikt mit Architektur 6.0.3 (Hover-Pattern) als CSS-Kommentar dokumentiert.** Architektur-Regel sagt „kein Background-Change", Vorlage und Impl haben aber bei Listen-Einträgen einen bg-Wechsel. Pragmatische Lesart: Regel gilt für **Buttons + Pills + Action-Targets**, nicht für **Listen-Einträge mit Aktiv-State**. CSS-Kommentar bei `.td-list-item:hover` markiert die Klärung — echtes Architektur-Doc-Update wurde mangels Trigger-Phrase im Sprint nicht durchgeführt; bei Bedarf nachziehen.

### Mid-Sprint-Anpassungen

- **PlanPane-Bars waren mehrere Iterationen lang nicht sichtbar.** Erst Background `bg-3` (zu nah am Panel-bg) → auf `line-2` umgestellt. Dann `flex-shrink: 0` ergänzt (Track schrumpfte in der flex-column-UsageBar). Dann `<button>`-UA-Default-Diagnose: ohne `align-items: stretch` quetschen Browser-Defaults Row und Track auf min-content-Width — die Bar erschien als 1-px-vertikale-Linie am linken Rand. Final-Fix: `align-items: stretch` + `width: 100 %` + `box-sizing: border-box` auf UsageBar, `width: 100 %` + 1-px-Border auf Track.
- **Action-Bar-Container-Query greifte nicht zuverlässig.** `@container term-col (max-width: 620px)` definiert, aber im Live-Test bei ~580 px Mid-Column-Breite nicht durchgeschlagen. Pragmatischer Fix: `min-width: 0` auf der ctx-Bar war das eigentliche Problem (verhinderte das Wrapping, weil die Bar bis 0 schrumpfen durfte). `flex: 1 1 240px` + `min-width: 240px` triggert jetzt das `flex-wrap: wrap` automatisch. Container-Query bleibt als Schutznetz.
- **Resume mit hardcoded `cols: 80, rows: 24` war seit Sprint 6 latent.** Wurde erst beim UI-Vergleich sichtbar, weil bei der Vorlage-konformen 1fr/1fr-Verteilung die Mid-Column auf den meisten User-Bildschirmen schmaler als 80 cols ist. Helper extrahiert (`estimateTerminalCols`), TabContainer + HistoryActionModal angepasst.
- **Verlauf-Quickliste-Klick-UX zwei Iterationen.** Erste Version: Klick → setHistorySelected + setMainView('history'). User-Feedback: muss Session in der Tabelle nochmal auswählen. Zweite Version: kleines Auswahl-Modal mit Resume/Archive/Verlauf-Öffnen direkt aus dem Sidebar-Klick. Footer-Button „Alle anzeigen" deckt den Tabellen-Pfad ab.

### Bonus-Bugfixes unterwegs

- **xterm-Scrollbar gestylt.** Browser-Default zeigte einen weißen vertikalen Balken im Terminal-Bereich. `.td-terminal-canvas .xterm-viewport::-webkit-scrollbar` mit 8 px / `line-2` / `line-3`-Hover dezent in den td-Tönen.
- **Tab-Bar-Scrollbar auch gestylt.** `.td-tabs::-webkit-scrollbar` analog 4 px / `line-2`. Plus `overflow-y: hidden`, sodass nur horizontal gescrollt wird (kein vertikaler weißer Streifen mehr).
- **Modal-Footer mit `bg-2`.** War vorher flach am Body — Vorlage rendert Footer als Toolbar. `padding: 10/16` plus eigener Background.
- **NotesPanel-Empty-State ohne Italic.** Vorlage rendert Plain inline-Style ohne Italic — Drift gefixt.
- **`td-titlebar-meta-item` Color auf `text-mute`.** War `text-dim` (kontrastreicher), Vorlage hat `text-mute` — zarter, weniger ablenkend.

### Offen geblieben (bewusst Phase 2/5+)

- **Backend-Berechnung des `reset_schedule`** — UI-Slot da, Aggregation rolling 168 h. Phase 2: `usage:window` rechnet vom letzten Reset-Zeitpunkt statt rolling.
- **PlanPane → Detail-Pfeil-Button** — UsageDetailModal öffnet pro Bar-Klick statt global. Phase 2.
- **StatsPane-Heatmap + 8 Mini-Karten** — Skeleton mit 3 Karten. Phase 2 (Architektur 6.4).
- **Action-Bar Reset-Zeit-Hinweis pro Bar im Tooltip** — implementiert, aber Backend liefert keine echte „Reset in X h"-Berechnung. Phase 2.
- **Toast-Aufrufer** — UI + Store ready, aber kein Trigger ruft `flashToast()`. Phase 2 verwendet's z.B. nach Session-Start, Template-Send, Archive.
- **TitleBar-System-Status dynamisch** — aktuell statisch „Terminal · P90 192 h". Phase 2 reagiert auf Mid-Pane-Wechsel.
- **HistoryPane-Filter-Klassen-Refactor** — `td-form-pills`/`td-form-input` bleiben aus Multi-Select-Gründen erhalten. Phase 2 könnte eigene `td-history-filter-*`-Klassen einführen.
- **Sprint-9-Slot „Code-Review + Debugging"** — separater Eintrag in PHASE1.md, in Sprint 9 nicht angefasst (Scope war UI-Vergleich). Bleibt als ⛔-Eintrag, kommt eigenständig in Phase 2 oder als kurzer Sprint 10.

### Pre-Release-Status

Phase 1 hat zwei Sprint-9-Slots — UI-Vergleich ist mit Sprint 9 ✅, Code-Review + Debugging bleibt offen (eigene Mini-Season). Tests: 396 grün. Suite-Lauf ~1.2 s, weiter komfortabel. `npm run make` produziert weiter Setup + Portable-ZIP parallel.

---

## 2026-05-10 — Season 8: Polish — MVP-Abschluss

### Was jetzt geht

- **Settings-Dialog mit sechs Tabs (Architektur 6.9).** Ctrl+K oder Settings-Icon im Header öffnen das Modal: Allgemein (Theme, claude-Binary-Pfad, Open-Data-Folder, Akzent-Farbe), Workspace (Pfad, manueller Re-Scan, Sensitive-Patterns als JSON), Modelle (Default-Modell, Per-Modell-Limits, Default-Limit), Token-Tracking (P90-Window, Warning-Schwellen, Plannutzungs-Bars als JSON), Terminal (Font-Family, Font-Size), About (Version, Repo, Lizenz). Form-Inputs sind Auto-Save mit 500-ms-Debounce + Coalescing pro Patch — Indikator unten links zeigt „Auto-Save aktiv / Speichert… / ✓ Gespeichert (N Felder) / ⚠ <Fehler>". Komplexe Settings (`limit_bars[]`, `sensitive_file_patterns[]`) leben in einem CodeMirror-6-JSON-Editor mit Live-Lint (300-ms-Debounce, zod-validiert) und explizitem „Anwenden"-Knopf — Apply ist nur bei valider Quelle aktiv.
- **Header-Bar (Architektur 6.0, td-titlebar).** 36-px-Bar oben mit drei Sektionen: Brand (匠-Kanji + TakumiDeck + Version), Meta (aktives Projekt, Branch via `git:status`-Cache, running/total Sessions-Counter), Window-Controls (⚙ Settings-Icon + min/max/close). Drag-Region via `-webkit-app-region: drag`. Native Electron-Frame ist `frame: false` — keine doppelte Title-Bar mehr. Branch-Anzeige re-loadet bei Project-Wechsel und nach `td-git-refresh`-CustomEvent (PreCommitModal feuert ihn nach Send) plus manuellem ↻-Knopf, kein Polling.
- **Crash-Recovery-Reconciliation-Pass beim App-Start.** Nach `openDatabase()` läuft `reconcileCrashedSessions`: alle running- und idle-Sessions mit `ended_at IS NULL` werden via `lifecycle.transition('interrupted', 'app-quit')` gepatcht, danach `ended_at` auf `MAX(messages.ts)` der Session korrigiert (genaueste verfügbare Approximation des Crash-Zeitpunkts statt nichtssagendem App-Start-Now). Sessions ohne Messages bleiben bei `now()` als Fallback. Idempotent — zweiter Pass macht nichts mehr.
- **Datei-Tab-Persistenz pro Projekt.** `useFileTabsStore.hydrateFromStorage` rekonstruiert beim App-Start die Tab-Liste pro Projekt aus localStorage (Schlüssel `td.fileTabs`, Schema-versioniert `v: 1`); jeder file-Tab triggert einen `fs:read` im Hintergrund, sodass der Inhalt sauber re-fetched wird. Diff-Tab überlebt unverändert vorne. Persistenz schreibt nur die Tab-Identitäten (id/kind/relPath/label + activeId) — kein Buffer-Cache, sodass extern editierte Dateien beim Re-Open keinen Konflikt-UI brauchen. Korrupte/version-fremde Snapshots werden still verworfen.
- **Konfigurierbare Sensitive-File-Patterns (additiv zu den hartcoded Defaults).** Neue Settings-Spalte `sensitive_file_patterns: string[]` (Default `[]`, RegEx-Quellen). `findSensitiveFiles` nimmt das Array als zweiten Parameter, kompiliert die User-Patterns zur Laufzeit (kaputte Quellen werden still gedroppt) und matcht sie auf den ganzen `relPath` zusätzlich zu den hartcoded Basename-Defaults `.env(.*)`, `secrets.*`, `*.key`, `*.pem`. PreCommitModal reicht die User-Liste durch.
- **Modell-Limit-Defaults korrekt auf 200 000 Token.** TECH_SCHULDEN-Eintrag aufgelöst — Per-Session-Kontext-Bar skaliert jetzt realistisch (80 k Tokens zeigen ~40 % statt vorher ~8 %). Extended-Context-Beta lässt sich pro Modell im Settings-Dialog auf 1 000 000 hochsetzen.
- **Tastatur-Hints unter dem Terminal.** Statische `<kbd>`-Pillen-Reihe: `Enter` senden · `Ctrl+T` Templates · `Ctrl+N` Neue Session · `Ctrl+K` Einstellungen · `Ctrl+Tab` nächster Tab. Lädt zur Erkundung ein, ohne Cheatsheet-Modal.
- **Error-Handling-Pässe (V7-C: User-Aktion vorne, technische Details on-Demand).** FS-IPC mappt EACCES/EPERM/EBUSY auf `FS_PERMISSION` mit konkretem Aktion-Hint („Antimalware-Scanner oder Cloud-Sync könnte die Datei locken"); SQLite bekommt `pragma busy_timeout=5000` und macht damit interne Backoffs statt SQLITE_BUSY-Throws bei parallelem Watcher-Insert + before-quit-Patch; neuer `app:claude-health`-Channel prüft die `claude_binary_path`-Auflösbarkeit beim App-Start und nach jedem PTY-Spawn-Fehler — fehlende Binary erscheint als anklickbarer ⚠-Banner in der Header-Bar, der direkt das Settings-Modal öffnet.
- **`SESSION_NO_CLAUDE_UUID`-Hint im Verlauf-Detail-Pane.** TECH_SCHULDEN-Reminder aus Sprint 6/7 aufgelöst: Resume einer Pre-Hotfix-Session ohne JSONL gibt jetzt eine gezielte Hint-Box („Session ist nicht mehr resume-fähig — externe UUID nicht rekonstruierbar") mit einem Direkt-Archivieren-Knopf statt der nackten globalen Fehlermeldung.
- **Build + Distribution: Squirrel-Setup + Portable-ZIP.** `npm run make` produziert beide Artefakte parallel — `out/make/squirrel.windows/x64/TakumiDeck-<version> Setup.exe` für die klassische Windows-Installation, `out/make/zip/win32/x64/TakumiDeck-win32-x64-<version>.zip` für USB-Stick / Probelauf / Distribution an Freunde ohne Installations-Stress. Manuelle GitHub-Release-Anleitung in `docs/DEV_SETUP.md`. Kein Code-Signing, kein Auto-Update (Phase 5+, Architektur 12).

### Umgesetzte Entscheidungen

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** V1-A (Live-JSON-Lint debounced 300 ms), V2-A (Auto-Save pro Form-Field 500 ms + expliziter Apply für Raw-JSON), V3-B (Branch via Cache + Trigger-Refresh), V4-C (`ended_at` aus `MAX(messages.ts)`), V5-A (nur Tab-Liste, kein Buffer-Cache), V6-B (Setup + Portable-ZIP), V7-C (Mix: User-Aktion vorne, Details on-Demand), V8-A (Sensitive-Patterns additiv), V9-A (Settings-Dialog zuerst, dann isolierte Wins, dann Chrome, dann Polish, dann Build). Plus drei Bugfix-Entscheidungen nach User-Screenshot: Filter-Pillen-Wrap, `frame: false`, Spalten-Verteilung 1.6fr/1fr.
- **Driver-Injection bleibt das tragende Test-Pattern.** `reconciliation.ts` nimmt `SessionRepository` + `MessageRepository` + `SessionLifecycle` injiziert — Tests fahren mit den InMemory-Drivern aus Sprint 2/5, kein echtes SQLite. `settingsAutoSave.ts` nimmt `SettingsApi` + `Scheduler` injiziert — Tests fahren mit Manual-Scheduler statt vi.useFakeTimers, deterministisch ohne Timer-Tricks.
- **Memory-Konvention „UX-Defaults: konvenient vor traditionell" 8 von 9 Mal getragen.** V1-A (Live-Lint statt on-Save), V2-A (Auto-Save statt Save-Button), V3-B (Cache statt Polling — billiger Daily-Driver), V4-C (genaue Approximation statt now()), V5-A (Tab-Liste-Persist statt Buffer-Cache mit Konflikt-UI), V7-C (Mix statt rein-technisch), V8-A (additiv statt komplette Übernahme), V9-A (Skeleton-First-Reihenfolge). V6-B war neutral (Setup+Portable parallel). Memory-Konvention bleibt damit empirisch validiert.

### Mid-Sprint-Anpassungen

- **User-Screenshot zeigte drei Layout-Defekte gleichzeitig.** (1) HistoryPane-Filter-Pillen wurden vom `overflow: hidden` der Mid-Spalte abgeschnitten, weil `.td-history-filter-group` kein `flex-wrap: wrap` hatte (Group-Container mit `<span>Status</span>` + `<div class="td-form-pills">…</div>` als ein Flex-Item). Fix: Group bekommt `flex-wrap: wrap` + `min-width: 0`, Label `flex-shrink: 0`. (2) Doppel-Header (Electron-Native + meine td-titlebar). Fix: `frame: false` in `BrowserWindow`. (3) 1fr/1fr-Mid-Verteilung war für Tabelle + Filter zu eng. Fix: 1.6fr/1fr — Terminal/Verlauf bekommt 62 % der Mittenfläche. Alle drei in einem Pass nach AskUserQuestion-Abklärung.
- **`@codemirror/lang-json` als neue Dependency.** Settings-Dialog braucht den JSON-Sprache-Modus für die Raw-JSON-Editoren. Kein Workaround mit textarea (User hat „CodeMirror 6 wiederverwenden" als etablierte Entscheidung gelistet). Installation per `npm install`, package-lock.json updated.
- **`registerAppIpc()` braucht jetzt `SettingsStore`.** `app:claude-health` muss `claude_binary_path` aus den Settings lesen — Signatur erweitert um optionales `deps?: { settings?: SettingsStore }`. Aufrufer in `main.ts` reicht den Store durch; bei `undefined` (Tests) fällt der Health-Check auf `'claude'` zurück.

### Bonus-Bugfixes unterwegs

- **`PreCommitModal` feuert nach Send `td-git-refresh`.** Header-Bar weiß sonst nicht, dass sich nach einem erfolgreichen Commit-Trigger der Branch-State ändern könnte (z.B. Working-Tree-Clean nach Commit). CustomEvent-Pattern analog `td-template-send` — billiger als ein zusätzlicher IPC-Roundtrip.
- **`TerminalTab` feuert bei Spawn-Fehler `td-claude-recheck`.** Header-Bar re-checkt die Binary-Health, der ⚠-Banner erscheint sofort statt erst beim nächsten manuellen Health-Lookup.

### Offen geblieben (bewusst Phase 2/5+)

- **Code-Signing + Auto-Update** — Architektur 12, Phase 5+. SmartScreen-Warnung bei der ersten Installation ist akzeptierter Single-User-Tradeoff.
- **GitHub Actions Build** — bei Bedarf wenn aktiv geteilt wird. Sprint 8 nutzt manuelle Releases.
- **Light-Theme** — Phase 2. Dark ist im MVP einheitlich.
- **Phase-2/5-Auslassungen aus Architektur 12** unverändert: Worktree-UI, Pull/Fetch/Branch-Switch, Brainstorming-Panel, OpenAI Codex als zweite Engine, semantische Chunk-Suche, mehrere Workspace-Ordner, Stream-JSON-Mode.
- **Notes-Auto-Save bei Hard-Quit best-effort** — TECH_SCHULDEN-Eintrag bleibt. Synchroner IPC-Pfad lohnt sich nur, wenn das in der Praxis schmerzt.
- **`awaitWriteFinish`-Latenz im JSONL-Watcher** — TECH_SCHULDEN. 100-ms-Verzögerung der Live-Updates. Phase-2-Optimierung wäre zweiter Polling-Ring mit fs-stat.
- **Multi-Session-im-selben-cwd-Backfill nimmt nur die jüngste** — TECH_SCHULDEN, Edge-Case.

### MVP-Abschluss

Phase 1 ist komplett. Alle Roadmap-Features auf ✅. 396 Tests grün, Suite ~1.1 s. Ready für `npm run make` und manuelle GitHub-Release.

---

## 2026-05-10 — Season 7: Editor + Git + Right-Pane

### Was jetzt geht

- **Right-Pane als 4-Spalten-Grid (240 / 1fr / 1fr / 232 px).** Editor + Diff bekommen eine eigene breite Spalte (3. Grid-Cell, full-flex), Files + Notes leben als schmaler 232-px-Stack ganz rechts (4. Grid-Cell, full-height), PlanPane wandert von „Mitte unten" nach „Editor unten" (3. Spalte, untere Zeile). StatsPane bleibt unter dem Terminal (2. Spalte unten). Layout-Klassen `td-col-mid-top / -mid-bottom / -right-top / -right-bottom / -right-stack` 1:1 aus `docs/design/claude-export/styles.css` übernommen — nicht mehr selbst erfunden.
- **Markdown-Editor mit CodeMirror 6.** `@codemirror/lang-markdown` + `@codemirror/lang-yaml`, oneDark als Highlighting-Basis plus Custom-Theme-Override für Background / Selection / Cursor / Gutter auf die `td-*`-Variablen. Manueller Save mit Ctrl+S, „○ tippt…/● gespeichert"-Indikator pro Tab, Save-Button in der Editor-Toolbar. Datei-Tabs pro Projekt (eine MarkdownEditor-Instanz pro Tab, CSS-Toggle für Sichtbarkeit — Buffer überlebt Tab-Wechsel analog Sprint-3-xterm-Pattern). Schnellzugriff-Liste aus `workbench.on_demand_files` plus Standards (CLAUDE.md / CHANGELOG / FEATURES / ENTSCHEIDUNGEN / aktuelles Phase-File) — leerer Tab-Stack zeigt die Liste prominent, befüllter Stack zeigt sie als Pill-Footer mit „nicht-bereits-offenen" Einträgen.
- **Inline-YAML-Validation für CLAUDE.md.** Pure-Logik-Util `validateClaudeMdYaml` extrahiert das Frontmatter zwischen `---`-Trennern und ruft `js-yaml.load()` darauf; CodeMirror-Linter hängt das mit 500-ms-Debounce in den Editor und mappt Fehler-Zeilen auf die Quell-Datei (statt auf den Block-internen Offset). Nur Anzeige, kein Auto-Fix.
- **Markdown-Preview-Toggle.** Editor/Preview-Pills in der Toolbar; Preview-Modus rendert via `react-markdown` mit den App-Tokens (Display-Font für Headings, Mono-Font für Code-Blocks, Akzent-Farbe für Links).
- **Diff-Viewer mit `@codemirror/merge`.** Working-Tree-Diff via `git:status` + `git:show`-IPC (HEAD-Version pro Datei) + `fs:read` (Working-Tree-Inhalt) → `unifiedMergeView({ original: HEAD })` mit aktuellem Inhalt als Doc. File-Liste oben mit Status-Mark (M/A/D/?/R), Klick wechselt das aktive File. Clean Tree und Non-Git-Repo bekommen explizite Empty-States. Read-only.
- **PreCommitModal.** Eigener Modal (kein Inline-Drawer) mit Branch-Anzeige + Counts (ahead/behind), File-Liste mit Worktree/Index-Status, Sensitive-File-Warnung (`.env`, `.env.*`, `secrets.*`, `*.key`, `*.pem`) als Pure-Logik-Util mit Basename-Match (kein Pfad-False-Positive). Commit-Trigger geht über die existierende Sprint-6-`td-template-send`-Bracketed-Paste-Mechanik direkt an die aktive PTY — die App committed nicht selbst (Architektur 6.7).
- **commit-Pill in der Action-Bar.** `td-term-bar` neben Templates ergänzt; `⎇ commit` öffnet das PreCommitModal. Disabled, wenn kein Projekt aktiv ist; Status-Hinweis im title-Attribut.
- **Hierarchischer Datei-Browser im Right-Stack.** `fs:list-tree`-IPC scannt das aktive Projekt mit Driver-Injection (Skip-Liste: `node_modules`, `.git`, `dist`, `build`, `.vite`, `.next`, `.idea`, `.vscode`, `out`, `coverage`; versteckte Files raus außer `.gitignore`/`.gitattributes`/`.editorconfig`). Tree mit Click-to-Expand pro Verzeichnis; Filter-Suchfeld vorbelegt mit „.md", aber leerbar. Dateien zeigen einen `M`-Indikator, wenn der entsprechende Datei-Tab gerade dirty ist (kommt aus dem File-Tabs-Store). Klick öffnet die Datei in einem neuen Editor-Tab.
- **Notizen-Panel migriert in den Right-Stack.** Sprint-3-`NotesFooter` ist komplett entfernt; `NotesPanel` lebt jetzt in der unteren Hälfte der 4. Grid-Spalte. Pure-Logik-Util `createNotesSaver` (500 ms Debounce + onBlur + onUnmount + beforeunload) ist unverändert wiederverwendet — alle 10 bestehenden Tests tragen weiter. Empty-State, wenn keine Session aktiv.
- **Filesystem-IPC `fs:read` / `fs:write` mit Anti-Traversal.** Renderer schickt `projectId` + `relPath`; Main resolved gegen den Project-Pfad und prüft per `path.relative`, dass das Ergebnis innerhalb des Project-Roots bleibt. `..\..\windows\system32`-Versuche werden als `FS_PATH_ESCAPED` abgewiesen, bevor irgendein Filesystem-Aufruf läuft.
- **simple-git als neue Dependency mit Driver-Injection.** `GitDriver`-Interface (`status` / `diff` / `showFile`) mit `realGitDriver` (simple-git) und Fake-Driver für Tests. `git:status` / `git:diff` / `git:show`-IPC liefern Branch + geänderte Files, Working-Tree-Patch und HEAD-Version pro Datei; alle drei Channels mit `PROJECT_NOT_FOUND` / `NOT_A_GIT_REPO` / `GIT_*_FAILED`-Codes statt nackten simple-git-Exceptions.
- **Per-Projekt-Datei-Tab-Stack.** `useFileTabsStore` analog Sprint-4-Terminal-Tabs: `tabs[projectId]: FileTab[]` plus `activeId[projectId]`. Diff-Tab ist Sonderfall mit fester ID `'diff'` und sitzt immer ganz links pro Projekt. Tab-Schließen wählt links bevorzugt, sonst rechts, sonst null als nächste aktive Tab-ID — gleiches Pattern wie der Terminal-Tab-Stack.
- **Tote Sidebar-CSS-Blöcke aufgeräumt (TECH_SCHULDEN-Drive-by).** Pre-3-Sektionen-Layout-Klassen (`.td-sidebar-header / -title / -actions / -icon-btn / -list / -item-* / -badge / -item-wrap / -views / -view-btn`) sind aus `app.css` raus, plus die alten `.td-notes-footer / -header / -toggle / -meta / -textarea`-Blöcke. Nur die noch genutzten `.td-sidebar-empty / -empty-soft / -error` bleiben. Generische `.td-panel:nth-child(2)` / `.td-panel-history`-Regeln auf `.td-sidebar > .td-panel*` gescoped, damit der Right-Stack nicht versehentlich erbt.

### Umgesetzte Entscheidungen

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** Q1 A (manueller Save, gegen UX-Default-Memory), Q2 B (Filter mit `.md`-Default), Q3 A (eigener PreCommitModal), Q4 B (500 ms YAML-Debounce), Q5 B (oneDark + Custom-Override), Q6 B (Per-Projekt-Datei-Tab-Stack), Q7 A (Sensitive-Patterns hartcoded), Q8 A (NotesFooter komplett raus), Q9 A (Skeleton-First-Reihenfolge). Plus eine Mid-Sprint-Layout-Entscheidung (Editor in eigener breiter Spalte statt im 232-px-Right-Pane) — siehe Mid-Sprint-Anpassungen.
- **Skeleton-First-Phasenreihenfolge aus Sprint-6-Lehre.** Phase 1 (Right-Pane-Skeleton + Notes-Migration + CSS-Cleanup) zuerst, damit die Layout-Risiken früh sichtbar werden. Hat sich beim User-Feedback nach Phase 4 ausgezahlt — der Layout-Schmerz war sofort sichtbar, Pivot auf das Design-Handoff-4-Spalten-Grid kostete nur ~30 min, weil alle Komponenten schon in eigenen Files lagen und nur das App-Grid + die Eltern-Aufteilung umgebaut werden musste.

### Mid-Sprint-Anpassungen

- **Layout-Pivot von Single-Right-Pane (232 px Stack mit 3 Sektionen) auf 4-Spalten-Grid (240 / 1fr / 1fr / 232).** Briefing hatte den Editor im 232-px-Right-Pane vorgesehen — visuell zu eng beim ersten User-Test. User-Feedback: „in der Vorlage sieht es besser aus". Design-Handoff (`docs/design/claude-export/styles.css` Zeilen 122-195 + `app.jsx` Layout-Grid) hat von Anfang an 4 Spalten gezeichnet (Editor in eigener `1fr`-Spalte, Files+Notes als separate `td-col-right-stack`-Spalte ganz rechts, PlanPane unter dem Editor statt unter dem Terminal). `RightPane.tsx` aufgeteilt in `EditorPane.tsx` (Editor + Diff, breite Spalte) und `RightStack.tsx` (Files + Notes, schmale Spalte) — saubere Trennung pro Grid-Cell. ~30 min inkl. CSS-Cleanup. Lehre wandert ins SEASON_LOG.
- **Re-Render-Endlosschleifen durch instabile Selectors.** Erster App-Start zeigte zwei aufeinanderfolgende „Maximum update depth exceeded"-Crashes: (1) `useFileTabsStore((s) => ... ?? [])` und `useFileTabsStore((s) => { return new Set() })` returnten neue Referenzen pro Render, was Zustand als State-Change interpretierte → infinite Re-Render. (2) Eltern reichten `(d) => setDirty(...)` als Inline-Closure an MarkdownEditor durch, dessen useEffect-deps `[dirty, onDirtyChange]` enthielten → bei jedem Render neuer Closure, Effect feuert, `setDirty` triggert Store-Mutation auch bei No-Op, neuer Render, neuer Closure, infinite. Zwei getrennte Fixes: stable EMPTY-Module-Konstanten + `useMemo` für abgeleitete Sets/Maps; und `setDirty/setSaved/setActive` im Store idempotent (early-return bei No-Op) plus `onDirtyChange` über einen Ref im MarkdownEditor.
- **NotesFooter-Migration brauchte CSS-Pfad-Auflösung.** Sprint-3-`NotesFooter` hatte eigene `.td-notes-footer / -header / -toggle / -textarea`-Klassen mit Footer-Layout-Annahmen (border-top, expanded-Höhe, Toggle-Button). Im Right-Stack als full-Sektion sind die Annahmen falsch. CSS-Block ersetzt durch eine schlanke `.td-notes / -head / -body / -saving / -empty`-Variante, die das Design-Handoff-Vokabular 1:1 spiegelt.

### Bonus-Bugfixes unterwegs

- **`setActive` / `setDirty` / `setSaved` jetzt idempotent.** Defensiv-Pattern, das den oben beschriebenen Re-Render-Loop final entschärft — Store-Mutationen ohne Wert-Änderung sind ab sofort No-Ops, was auch bei zukünftigen Eltern-Inline-Closures keinen Loop mehr triggern kann.
- **Sprint-6-`SESSION_NO_CLAUDE_UUID`-Cosmetic-Punkt offen geblieben.** SEASON_LOG hatte das als Sprint-7-Cosmetic-Slot vorgemerkt; Phase 7 hat den PreCommitModal gebaut, aber das Verlauf-Detail-Pane für tote Sessions nicht angefasst — bleibt für Sprint 8.

### Offen geblieben (bewusst verschoben)

- **Side-by-Side-Markdown-Preview** — Architektur 8 / 12 Phase-2-Auslassung. Toggle (Editor ↔ Preview) reicht im MVP.
- **Diff-Viewer-Multi-Tab (Working / Staged / Session)** — Phase 2. Sprint 7 zeigt nur Working-Tree-Diff.
- **YAML-Auto-Fix** — Phase 2. Sprint 7 zeigt nur Marker.
- **Pull / Fetch / Branch-Switch** — Phase 5+ (Worktrees). simple-git-Driver ist da, der App-Pfad fehlt bewusst.
- **Eigener Commit-Workflow durch die App** — Architektur 6.7. App schickt nur die Trigger-Phrase an Claude, das committed real.
- **Settings-konfigurierbare Sensitive-Patterns** — Sprint 8 (Settings-Dialog). Bis dahin hartcoded.
- **Per-Bucket-Burn-Rate / Heatmap-Filter** — Sprint 5 hatte das schon offen, weiter Phase 2.
- **`SESSION_NO_CLAUDE_UUID`-Cosmetic-Hint im Verlauf-Detail-Pane** — Sprint-6-SEASON_LOG-Reminder, nach Sprint 8 verschoben (PreCommit + commit-Pill hatten Vorrang).

---

## 2026-05-10 — Season 6: Templates + Season-Tracker

### Was jetzt geht

- **Atomare Season-Nummerierung pro Projekt.** `pty:create` allokiert beim Spawn einer `feature`-Session die nächste Season-Nummer in einer better-sqlite3-Transaktion (Read+Increment in einem Statement) und persistiert sie sofort. Bug/Review/Docs-Sync bleiben ohne Nummer (Architektur 6.6). Lücken bei Spawn-Fehler sind explizit akzeptiert — kein Rollback, weil das Hauptrisiko (nicht-konsumierte Nummer) trivial ist und ein Rollback Race-Conditions öffnen würde. NewSessionModal zeigt im Feature-Pfad die Vorschau „Diese Season wäre #N" aus dem `next_season_number`-Feld der Project-Row.
- **Verlauf-Panel als Replace-View.** Sidebar-Klick auf einen Verlauf-Eintrag oder den „Verlauf"-Reiter wechselt den Hauptbereich vom Tab-Stack auf eine Tabelle mit allen Sessions des aktiven Projekts. Filter-Bar mit Type-Pills, Status-Pills und Volltext-Suche im Titel; Detail-Pane rechts mit Notizen, Token-Aufschlüsselung (in/out/Messages) und Resume-Button. Sortierung jüngste-zuerst per `started_at DESC`. Token-Aggregate kommen via LEFT-JOIN aus der `messages`-Tabelle (Sprint-5-Persistenz). Tabs laufen im Hintergrund mounted weiter — kein xterm-Buffer-Verlust beim Wechsel.
- **Resume-Button auf jedem Status, der es erlaubt.** Verlauf-Detail-Pane zeigt den Resume-Button für completed / interrupted / error / idle. Bei bereits offenem Tab wird statt einem zweiten Spawn der existierende Tab fokussiert (Q5 Variante A). Archived bleibt Endzustand und ist explizit blockiert.
- **Sprint-2/3-Legacy-Bucket sichtbar mit Banner.** Klick auf den Legacy-Bucket öffnet das Verlauf-Panel mit einem Hinweis-Banner („Sessions aus Sprint 2/3, bevor der Workspace-Scanner echte Projekte erkannt hat"). Resume aus dem Verlauf greift dort identisch — der TECH_SCHULDEN-Eintrag „Sprint-2/3-Legacy UI-blind" ist damit aufgelöst.
- **Templates aus zwei Quellen, on-demand gescannt.** Ctrl+T oder die Templates-Pill in der Action-Bar öffnen das Modal; `fs:list-templates` scannt bei jedem Open frisch den globalen Ordner (`%APPDATA%\TakumiDeck\templates\*.md`), den Per-Projekt-Ordner (`<projekt>\docs\templates\*.md`) und die Legacy-Konvention (`<projekt>\docs\*_TEMPLATE.md`). Beide Quellen erscheinen als separate Listen-Einträge mit Source-Tag (Global/Projekt) — Konflikte bei gleichem Dateinamen werden bewusst nebeneinander angezeigt (Q2 Variante B).
- **Variable-Filling mit Pflicht-Validation und Live-Preview.** `{{...}}`-Tokens werden anhand des Templates erkannt und nur die genutzten Variablen-Felder im Modal angezeigt. Auto-Variablen (PROJEKT_NAME, NEXT_SEASON_NR, CURRENT_PHASE_FILE, DATUM) sind read-only aus Project-Row + CLAUDE.md-Frontmatter + Datum gefüllt. User-Variablen FEATURE_NAME / AUFGABE sind Pflicht (markiert, blockiert Send), HINWEISE optional (Multiline-Textarea). Live-Preview-Spalte zeigt den ersetzten Text während des Tippens; unbekannte Tokens bleiben als Platzhalter sichtbar mit Warnhinweis.
- **Send via Bracketed-Paste an die aktive PTY.** Modal feuert ein `td-template-send`-CustomEvent, das der aktive TerminalTab via `terminal.paste(text)` an den PTY-Stream legt — gleiche Mechanik wie Sprint-3.5-Copy/Paste. claude erkennt den \x1b[200~...\x1b[201~-Block und verarbeitet ihn als ein Eingabe-Event, nicht zeilenweise.
- **× auf einem Tab ist non-destruktiv.** Tab-Schließen killt nur den PTY (falls noch läuft) — der Lifecycle wandert via `pty:exit` auf `completed`, die Session bleibt im Verlauf erreichbar und resume-fähig. Aus Versehen geschlossene Sessions sind kein Datenverlust mehr. Expliziter Archivieren-Schritt läuft jetzt über das Verlauf-Detail-Pane mit Inline-Confirmation („Wirklich? Session ist danach nicht mehr resume-fähig.").
- **Sidebar im Design-Layout (3 Sektionen).** Stack aus `td-panel`-Sektionen wie im Claude-Design-Handoff: **Projekte** mit ↻-Refresh und + Add Project, **Aktive Sessions** mit Status-Dot + Name + ↻-Resume + ×-Schließen pro Tab + + Neue Session im Footer, **Verlauf** mit kompakter Quickliste (max 10) und Klick = Sprung ins HistoryPane mit Vorauswahl. Modal-State (NewSession/Templates) liegt jetzt im UiStore, damit Sidebar und Tab-Bar denselben Zustand teilen. Der frühere Tabs/Verlauf-Toggle entfällt.
- **Action-Bar unter dem aktiven Terminal.** Schmale Bar mit `td-pill`-Elementen aus dem Design-Export (`td-term-bar` styles.css 532): Modell-Pill (read-only Indikator), Templates-Pill (primärer Pfad zum Modal, falls Ctrl+T system-weit gebunden ist), Status-Badge rechts (●/○/✓/⏸/✗/◌).

### Umgesetzte Entscheidungen

- **9 Variants vor dem ersten Code, alle Empfehlungen übernommen.** Template-Discovery (B on-demand), Konfliktauflösung (B beide separat), Variablen-Filling-UI (A Form + Preview), Verlauf-Panel-Position (A Replace-View), Resume bei offenem Tab (A fokussieren), Counter-Increment-Zeitpunkt (B atomar im Main), cache_creation/cache_read (B weiter Phase 2), Legacy-Sessions im Verlauf (A sichtbar mit Banner), Implementations-Reihenfolge (A Season-Tracker zuerst).
- **Sprint-6-Hotfix Variante C: Resume-Bug-Fix kombiniert.** A für neue Sessions (`claude --session-id <takumi-uuid>` beim ersten Spawn) plus B für Legacy (Migration `0003_claude_session_id.sql` mit nullable Spalte, Watcher-Backfill aus dem JSONL-Filename, status-agnostisch). Sprint-5-Annahme „claude-code unterstützt --session-id nicht" war überholt — claude-code liefert das Flag offiziell. Resume-Pfad nutzt jetzt `claude_session_id ?? id`, mit klarer Fehlermeldung `SESSION_NO_CLAUDE_UUID` für Sessions, die nie eine JSONL-Antwort produziert haben.
- **× non-destruktiv (Variante B aus 4-Wege-Vergleich).** Tab-Schließen und Session-Archivieren sind jetzt zwei getrennte Aktionen mit eigenen IPC-Channels (`session:close` ohne Lifecycle-Patch, neuer `session:archive` mit Lifecycle-Transition zu archived). Confirmation läuft inline im Detail-Pane statt als zusätzliches Modal — ein Klick aktiviert die rote Bestätigung, ein zweiter führt aus.
- **Sidebar nach Design-Handoff-Layout.** 3-Sektionen-Stack (Projekte / Aktive Sessions / Verlauf) statt Single-Liste mit View-Toggle. Klassen aus `docs/design/claude-export/styles.css` 1:1 übernommen (`td-panel`, `td-list`, `td-pill`, `td-action-btn` etc.).

### Mid-Sprint-Anpassungen

- **Resume war seit Sprint 3 tot.** Erst beim ersten User-Test in Sprint 6 fiel auf, dass `claude --resume <uuid>` mit „No conversation found" scheitert, weil claude-code intern eigene Session-UUIDs vergibt. Sprint 5 hatte den Mismatch nur für den JSONL-Watcher-Mapping-Pfad gefixt (encodeCwd), nicht für den Resume-Pfad. Hotfix Variante C zog die saubere Lösung nach (siehe oben).
- **× war nach Sprint 3 destruktiv.** Sprint-3-Spec hatte `tab-close → archived` als ein Schritt; das Verlauf-Panel hat den Schmerz erst sichtbar gemacht. UX-Fix Variante B trennt die zwei Aktionen.
- **Sidebar-View-Toggle „Tabs/Verlauf" entfiel zugunsten 3-Sektionen-Layout.** Erste Implementation hatte einen schmalen Toggle unter dem aktiven Project — das Design-Handoff hat aber von Anfang an drei separate Sektionen vorgesehen. Beim User-Feedback („wie in der Design-Vorlage") komplett umgebaut.
- **Watcher-Backfill war zunächst nur für running/idle-Sessions gedacht.** Der Backfill-Pass aus dem Hotfix matchte initial nur live-Sessions (Sprint-5-Token-Tracking-Pfad). Damit wären Legacy-completed-Sessions weiter resume-tot geblieben — Variante C hätte ihr Versprechen nicht eingelöst. Erweiterung auf status-agnostischen Backfill via `listMissingClaudeSessionId()`-Repo-Methode + Filename-UUID-Extraktion.

### Bonus-Bugfixes unterwegs

- **claude-code-Session-UUIDs überhaupt.** ENTSCHEIDUNGEN.md aus Sprint 5 sagte „kein --session-id-Flag" — Stand 2026-05-10 ist das überholt. Variante C des Resume-Hotfix nutzt das Flag jetzt offiziell.
- **Modal-State in TabContainer war nicht zugänglich für die Sidebar.** Sprint-6-UI-Fix verschiebt `showNewSessionModal` und `showTemplatesModal` in den UiStore — beide Quellen (+ in der Tab-Bar, + in der Sidebar) öffnen denselben Zustand.
- **HistoryPane sortierte Filter unsauber.** Default-Filter blendete `archived` nicht aus, sodass die Liste nach Archivieren mit alten Karteileichen verstopft war. Default ist jetzt explizit `running/idle/completed/interrupted/error` ohne archived; Status-Filter erlaubt das Einblenden.

### Offen geblieben (bewusst verschoben)

- **`cache_creation` / `cache_read` getrennt persistieren** — Q7 B, weiter Phase 2. Verlauf-Detail-Pane zeigt summierte tokens_in/tokens_out, was für Sprint-6-UX reicht.
- **commit-Pill und ctx-Mini-Bar in der Action-Bar** — Sprint 7 (Pre-Commit-Panel + Trigger-Phrase-Send). Sprint 6 hat nur die Templates-Pill plus Modell- und Status-Anzeige.
- **Pre-Hotfix-Sessions ohne JSONL-Antwort sind dauerhaft resume-tot.** Sessions, die spawn-error sofort hatten oder vor jeder Antwort geschlossen wurden, haben weder eine vorgegebene noch eine vom Watcher backfillbare claude-UUID. Resume liefert den klaren `SESSION_NO_CLAUDE_UUID`-Fehler. TECH_SCHULDEN-Eintrag dokumentiert das.
- **Mehrere Legacy-Sessions im selben cwd: nur die jüngste wird gebackfilled.** Wenn der User vor dem Hotfix mehrfach im selben Projekt Sessions ohne JSONL-Antwort gespawnt hat, mappt der Watcher die UUID auf die jüngste — die anderen bleiben null. TECH_SCHULDEN-Eintrag.
- **Tote `.td-sidebar-*`-CSS-Blöcke** aus dem Pre-3-Sektionen-Layout. Cosmetic, kein Funktionsschaden — beim nächsten Renderer-Touch mit aufräumen.

---

## 2026-05-10 — Season 5: Token-Dashboard

### Was jetzt geht

- **Token-Dashboard immer sichtbar.** Untere Zeile (300 px) mit einer Bar pro `settings.limit_bars`-Eintrag (5h, weekly_all, weekly_design, weekly_sonnet) plus Per-Session-Kontext-Bar für den aktiven Tab. Schwellen-Farben aus `settings.token_warning_thresholds` (gelb 70 %, orange 85 %, rot 95 %, darüber rot mit diagonalen Streifen). Klick auf eine Bar öffnet das `UsageDetailModal` mit Per-Modell-Tabelle und einem Recharts-Linien-Diagramm — Top-Level-Bars sind reines CSS, Recharts kommt nur dort zum Einsatz, wo eine echte Zeit-/Modell-Reihe Mehrwert bringt.
- **JSONL-Watcher liest historische und live Sessions ein.** chokidar mit `awaitWriteFinish` (100 ms Stability-Threshold) auf `~/.claude/projects/`, Initial-Scan zieht alle existierenden JSONL-Files an, persistierter Byte-Offset pro Datei (neue `jsonl_offsets`-Tabelle, Migration `0002`). Pro neuer Zeile: NDJSON-Parse über zod-Schema mit `.passthrough()` für unbekannte Felder, Drop kaputter Zeilen mit Logging. Pro `usage`-Zeile: Insert in `messages` (für Sessions, die TakumiDeck kennt) plus Upsert in `usage_buckets` (Hourly-Aggregat pro Modell).
- **TakumiDeck-Sessions matchen ihre JSONL-Datei über `encodeCwd`.** claude-code vergibt eigene UUIDs; der Filename matcht NICHT unsere `sessions.id`. Watcher liest den Eltern-Ordnernamen, encoded den `cwd` jeder running/idle-Session nach demselben Schema (`:/\\` → `-`) und matched. Bei mehreren Treffern (mehrere Sessions im selben Projekt) gewinnt die jüngste.
- **P90-Limit-Schätzung mit Fallback.** Rolling 192-h-Fenster über die Hourly-Buckets, gefiltert auf das gleiche Modell-Set wie die Bar selbst. Bei <24 Buckets (= <1 Tag Daten) Fallback auf `settings.model_limits[default_model]` mit `limitSource = 'fallback'`. Tooltip auf der Bar zeigt die Quelle. Custom-Bars dürfen ein `model_pattern` als SQL-LIKE-Glob mitgeben.
- **State-Detection running ↔ idle.** Alle 2 s prüft eine Loop für jede running/idle-Session den letzten `messages.ts`-Eintrag. Jünger als 3 s → `running`, sonst `idle`. Sessions ohne jegliche Messages (frisch gespawnt) bleiben unverändert, damit ein neuer Tab nicht sofort als idle erscheint, bevor claude überhaupt etwas geschrieben hat. Sidebar-Status-Dot reagiert (Pulse bei running, statisch grau bei idle). Lifecycle-State-Machine erweitert um `running ↔ idle`; `running → waiting` bleibt explizit verboten (Permission-Prompt-Recognition ist Phase 2).
- **Stats-Pane Übersicht/Modelle-Toggle.** Zwei-Tab-Skeleton unter dem Terminal-Bereich. „Übersicht" liefert drei Mini-Karten (aktuelle Session, letzte 5 h, letzte 168 h), die direkt aus dem Token-Dashboard-Store kommen. „Modelle" ist Phase-2-Stub mit Hinweispille.
- **Per-Projekt-Default-Modell aus CLAUDE.md (Sprint-4-Carry-over).** `NewSessionModal` zieht den Default jetzt aus `activeProject.frontmatter.workbench.default_model` mit Fallback auf `settings.default_model`. `useUiStore` cached die Frontmatter beim Project-Select über `project:read-claude-md` mit StrictMode-Side-Effect-Guard.
- **Aktives Projekt persistiert über App-Restart.** `useUiStore` hydriert `activeProjectId` aus `localStorage` beim Mount, schreibt zurück bei jedem `setActiveProject`. Tote Referenzen (Projekt zwischenzeitlich umbenannt) fallen sauber auf den heuristischen Default zurück.
- **Drive-by `displayProjectName(p)`.** TECH_SCHULDEN-Empty-State-Fix: Sidebar und TabContainer-Empty-State teilen sich jetzt einen Helper, der den DB-Rohnamen `__default__` auf „Sprint-2/3-Legacy" mappt.
- **Sprint-2-Lifeline `pty:create → DEFAULT_PROJECT_ID` endgültig aufgelöst.** Der Handler nimmt jetzt `projectId` aus dem IPC-Input statt hartcoded auf den Default zu zeigen. Sprint-4-Remap zieht beim App-Start auch `messages.project_id` der umgehängten Sessions mit — Per-Projekt-Aggregate (Sprint 6+) zeigen damit den richtigen Bucket.

### Umgesetzte Entscheidungen

- **Variante A überall** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). 10 Vorab-Variants für Sprint-5-Architektur (Watcher-Scope, Token-Persistenz, State-Detection-Heuristik, Push-Cadence, P90-Window, Layout-Position, Recharts-Strategie, Modell-Cache, Offset-Persistenz, Active-Project-Hydrate) wurden vor dem ersten Code mit Effort-Tabelle + Empfehlung geliefert; User hat alle 10 Empfehlungen direkt übernommen.
- **Sessions-Mapping über `encodeCwd` statt UUID** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). claude-code vergibt eigene Session-UUIDs, die NICHT mit unseren matchen. Variante A war ursprünglich „UUID match" — beim ersten Smoke-Test fiel sofort auf, dass das nicht trägt. Mid-Sprint-Pivot auf cwd-Encoding-Match.

### Mid-Sprint-Anpassungen

- **chokidar v5 unterstützt keine Glob-Patterns mehr.** Mein erster Wurf (`watchPath + '**/*.jsonl'`) wurde als wörtlicher Pfad interpretiert — Watcher hat schlicht nichts gewatcht, kein einziger Log-Eintrag. Fix: Root-Pfad watchen plus `ignored`-Predicate, das alle Non-`.jsonl`-Files ausschließt. Plus `ready`-Event mit Info-Log als Diagnose.
- **`session_count`-Bedarf-Pendant für Sprint 5.** Sprint 4 hatte den `session_count`-Aggregat erst nach erstem Smoke-Test gebraucht; Sprint 5 hat zwei vergleichbare Spät-Erkenntnisse: (1) `pty:create` war seit Sprint 2 hartcoded auf `DEFAULT_PROJECT_ID` — Sprint 4 hatte den Renderer per-Projekt umgebaut, aber den Main-Handler nicht mit-fixed; (2) Sprint-4-Remap zieht jetzt auch `messages.project_id` mit, sonst hängen Per-Projekt-Aggregate weiter am alten Bucket.

### Bonus-Bugfixes unterwegs

- **chokidar v5 Glob-Support entfernt** — siehe Mid-Sprint-Anpassung. Diagnose über fehlende `[jsonl-watcher]`-Log-Einträge nach Initial-Scan.
- **TakumiDeck-Session-UUID ≠ JSONL-UUID** — Mapping-Pivot auf `encodeCwd`-Match. Bei mehreren Sessions im selben cwd gewinnt die jüngste; Limitation in TECH_SCHULDEN.md.
- **`pty:create` hat seit Sprint 2 `DEFAULT_PROJECT_ID` hartcoded.** Schwelte unbemerkt, weil Sprint-4-Per-Projekt-Filter über den Renderer-Tab-State lief, nicht über die DB. Sprint 5 räumt mit `messages.project_id` aus der DB → der Bug fiel erst hier auf. Schema-Erweiterung: `PtyCreateInputSchema.projectId` Pflicht-Feld.
- **StrictMode-Listener-Guard-Falle.** Im PlanPane war ein `useRef`-Guard um den `usage:update`-Listener gewickelt. StrictMode mountet zweimal mit Cleanup dazwischen → Mount 1 register, Cleanup unsubscribe, Mount 2 GUARD blockt re-register → Listener für immer tot. Fix: Guard entfernt — Memory-Konvention sagt Guard nur für Server-Side-Effect-IPCs (pty:create, fs:write, git:commit), Listener-Setup ist read-only und muss bei jedem Mount frisch.

### Offen geblieben (bewusst verschoben)

- **Modell-Limits-Defaults auf realistische 200k-Werte umstellen** — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md). Aktuell zeigt die Per-Session-Kontext-Bar bei Sonnet 4.6 ~8 % statt der echten Kontext-Auslastung, weil das Limit auf 1 M (extended context) statt 200 k steht. Quick-Fix: User editiert `settings.json` direkt; saubere Lösung mit Sprint 8 (Settings-Dialog).
- **awaitWriteFinish-Latenz von 100 ms** für aktive JSONL-Files. Bei laufenden Antworten kommt der Watcher-Push erst, wenn claude für 100 ms nicht mehr schreibt. Im Sprint-5-Smoke-Test war das spürbar, aber tolerabel — Phase-2-Optimierung wäre ein zweiter „Polling-Ring" mit kürzerer Frequenz für aktive Files.
- **`cache_creation` / `cache_read` getrennt persistieren.** Aktuell summiert in `tokens_in`. Fürs Detail-Modal in Sprint 5 ausreichend; Verlauf-Panel in Sprint 6 entscheidet, ob die getrennte Spalten-Persistenz nötig wird.
- **Volle State-Detection mit `waiting` (Permission-Prompts)** — Phase 2. Sprint 5 schreibt nur `running ↔ idle`; `waiting` bleibt im Schema, wird aber nicht aktiv beschrieben.
- **Heatmap-View in StatsPane** — Phase 2. Sprint 5 reserviert nur den `usage:heatmap`-Channel als Stub.
- **Per-Bucket-Burn-Rate im UsageDetailModal** — Sprint 5 zeigt einen Per-Modell-Linien-Plot als Vereinfachung. Per-Bucket über die Window-Größe würde einen weiteren IPC-Roundtrip kosten und ist Phase-2-Material.

---

## 2026-05-09 — Season 4: Workspace

### Was jetzt geht

- **Linke Sidebar mit Projekten.** 240 px Spalte links zeigt alle erkannten Projekte aus dem konfigurierten `workspace_path` mit Active-Highlight, Pfad-Hinweis und einem Running-Badge (live aus den offenen Tabs). `+` öffnet einen Datei-Dialog (Pflicht-Marker: `CLAUDE.md` muss im Ordner liegen), `↻` scant den Workspace neu. Default-Project bleibt als „Sprint-2/3-Legacy"-Bucket sichtbar, solange noch DB-Sessions daran hängen — sobald `session_count = 0` ist, verschwindet er von selbst.
- **Workspace-Scanner findet Projekte automatisch.** Beim App-Start läuft ein async-rekursiver Walk über `workspace_path` (Promise-Pool, Konkurrenz 4), max-depth 5, stoppt bei jedem Ordner mit `CLAUDE.md` (= Projekt erkannt) oder `.git` (Stop ohne Erkennung). Versteckte Ordner und `node_modules` werden übersprungen. Ergebnis landet in `projects` mit `has_git`-Flag.
- **CLAUDE.md-Frontmatter wird sauber geparst.** `gray-matter` trennt YAML+Body, `ClaudeMdFrontmatterSchema` validiert die `workbench:`-Section strict — `trigger_phrases.docs_update` und `commit` sind Pflicht (in Working-Rules referenziert), `default_model` / `current_phase_file` / `on_demand_files` sind optional. Keine Frontmatter und „workbench fehlt" sind legitime Zustände; kaputte YAML liefert klare Result-Errs (`CLAUDE_MD_PARSE` / `CLAUDE_MD_INVALID_FRONTMATTER`).
- **Per-Projekt-Tab-Filter ohne Buffer-Verlust.** Tab-Bar zeigt nur Tabs des aktiven Projekts (Renderer-Filter über `activeProjectId`); alle xterm-Instanzen aller Projekte bleiben dauerhaft mounted (CSS verbirgt sie), PTYs der inaktiven Projekte laufen weiter. Beim Projekt-Wechsel rotiert `activeId` automatisch auf den ersten Tab des neuen Projekts oder auf den Empty-State. `Ctrl+Tab` / `Ctrl+Shift+Tab` navigieren projekt-scoped; der `+`-Button und `Ctrl+N` sind ohne aktives Projekt inert.
- **NewSession-Modal nutzt jetzt den Projekt-Pfad als `cwd`.** Bisher kam der `cwd` aus `settings.workspace_path` (= Parent-Ordner) — neue Sessions starten jetzt im Pfad des aktiven Sidebar-Projekts. Damit ist die Sprint-2/3-cwd-Mismatch-Falle für Neu-Sessions behoben.
- **Default-Project-Migration beim App-Start.** Nach dem Initial-Scan läuft ein `cwd`-Prefix-Match: Sprint-2/3-Sessions, deren `cwd` innerhalb eines erkannten Project-Pfads liegt, werden auf das echte Project umgehängt. Wer `workspace_path` als `cwd` hatte (= alle Sprint-2/3-Defaults), bleibt im Legacy-Bucket — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **Project-IPC + Driver-Pattern für Repo.** Vier neue Channels: `project:list`, `project:add` (Main öffnet `dialog.showOpenDialog` selbst, prüft CLAUDE.md-Pflicht), `project:scan-workspace`, `project:read-claude-md`. `ProjectRepository` mit `SqliteProjectDriver` + `InMemoryProjectDriver` analog Sessions; `session_count` per LEFT-JOIN-Aggregat zur Lesezeit.
- **Renderer-Stores sauber getrennt.** Neuer `useUiStore` (Architektur-2-konform) hält `activeProjectId`; neuer `useProjectStore` lädt/refresht/added Projekte. `SessionTab` trägt `projectId`; `selectTabsForProject` als Selector; `pickNextActive` rotiert nur innerhalb des Projekts.

### Umgesetzte Entscheidungen

- **Variante A (Async-Walk mit Konkurrenz-Limit)** für den Scanner (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Skaliert mit, wenn der Workspace mal mehr Subordner hat; Test-Aufwand identisch zur synchronen Variante (FsLikeDriver-Injection).
- **Variante A (gray-matter)** für den CLAUDE.md-Parser (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Kapselt BOM/CRLF/Markdown-Body-mit-`---`-Edge-Cases; Library-Dep wiegt im Electron-Kontext nicht.
- **Variante A (Auto-Match per cwd-Prefix mit Legacy-Bucket)** für die Default-Project-Migration (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Treffer wandert auf das echte Project, kein Treffer bleibt im sichtbaren Legacy-Bucket — datenverlust-frei.
- **Variante A (Renderer-Filter über `activeProjectId`)** für den Per-Projekt-Tab-Filter (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Konsistent zu Sprint-3-Tab-Persistenz: alle xterm bleiben mounted, der Wechsel ist eine reine Render-Operation.
- **Variante A (neuer `useUiStore`)** für die Sidebar-Auswahl-Persistenz (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Architektur-Kapitel-2-konform; Sprint 5 (Token-Dashboard-Detail) wird denselben Store mit-nutzen.
- **Per-Projekt-Modell-Default verschoben auf Sprint 5** (Variante B aus Frage 6). `NewSessionModal` nutzt weiterhin `settings.default_model`. Sprint 5 hat ohnehin pro-Modell-Logik und kann die Per-Projekt-Hierarchie aus dem CLAUDE.md-Frontmatter sauber einbauen.
- **Schema-Migration `0002` entfiel.** Da Per-Projekt-Modell verschoben wurde, brauchten wir keine neue Spalte in `projects` — `0001_init.sql` reicht für Sprint 4.

### Mid-Sprint-Anpassung

- **`session_count` als LEFT-JOIN-Aggregat in `projects`-Listing.** Erste Implementation hatte die Legacy-Bucket-Sichtbarkeit nur an offenen Renderer-Tabs gehängt — Sprint 4 lädt aber keine historischen Sessions als Tabs, der Bucket wäre nie aufgetaucht. Lösung: das Repo joint die Session-Anzahl pro Project zur Lesezeit, der Renderer entscheidet anhand des DB-Counts, ob der Bucket sichtbar ist. 56 → 56 neue Tests + 2 spezifisch für `session_count`-Aggregat.

### Offen geblieben (bewusst verschoben)

- **Per-Projekt-Modell aus CLAUDE.md ziehen** — Sprint 5.
- **Live-Watcher (chokidar) für Workspace** — Phase 2 (Sprint 5 setzt den Watcher zuerst für JSONL-Token-Tracking ein).
- **Settings-UI für `workspace_path`** — Sprint 8. Bei ungültigem Pfad zeigt die Sidebar jetzt einen sauberen Empty-State mit Hinweis auf `settings.json`.
- **Verlauf-Panel für Legacy-Bucket-Sessions** — Sprint 6. Die übrig gebliebenen Sprint-2/3-Sessions sind aktuell nur über direkte DB-Tools erreichbar (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md)).

---

## 2026-05-09 — Sprint 3.5: Copy/Paste im Terminal

### Was jetzt geht

- **Drei parallele Copy/Paste-Wege im Terminal.** Smart Ctrl+C/V (Windows-Terminal-Konvention: copy bei Selection mit Auto-Clear, sonst SIGINT durchlassen; Ctrl+V immer paste), Ctrl+Shift+C/V (cross-platform-Standard), Ctrl+Insert/Shift+Insert (Unix-X11-Konvention, Bypass für globale Screenshot-Hotkey-Konflikte). Alles geht durch eine pure Logik-Util `createCopyPasteKeyHandler`, der xterm via `attachCustomKeyEventHandler` vor dem PTY-Routing greift; Paste schickt Bracketed-Paste-Sequenzen, damit claude den Block nicht zeilenweise interpretiert.
- **Selection-Highlight im dunklen Theme dezent.** `selectionBackground` auf 18 % Alpha emerald reduziert, `selectionForeground` ganz raus — leere Terminal-Zellen werden nicht mehr zur grünen Wand, gefüllte Zeilen behalten ihre Original-Vordergrundfarbe.
- **Fokus-Restaurierung nach Modal-Close und Klick im Terminal-Padding.** TabContainer dispatcht ein `td-focus-active`-Window-Event nach dem Schließen des NewSessionModal; TerminalTab fängt es und ruft `terminal.focus()`. Plus `onMouseDown` auf der Terminal-Pane fordert den Fokus zurück, wenn der User irgendwo im Padding klickt — sonst bleibt er auf zuletzt gedrücktem Button kleben und Tastatur-Events erreichen xterm nicht.
- **DevTools per F12 / Ctrl+Shift+I.** Mit `autoHideMenuBar: true` und ohne benutzerdefiniertes Application-Menu griffen Electrons Default-Accelerator nicht; jetzt explizit über `webContents.before-input-event` gehookt.

### Umgesetzte Entscheidungen

- **Smart Ctrl+C/V als Default-Empfehlung** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Drei Bindings parallel statt nur einer „reinen" Variante — der User entscheidet je nach Fingergedächtnis und globalem Hotkey-Konflikt. Smart-Variante räumt nach jedem Copy die Selection ab, damit der nächste Ctrl+C wieder als SIGINT durchläuft.
- **Pure-Logik-Trennung wie schon `createNotesSaver`.** `createCopyPasteKeyHandler` ist driver-injected (ClipboardLike + getTerminal-Lambda) — 17 Tests laufen ohne echtes xterm und ohne Browser-Clipboard.

### Bekannt-und-beobachtet (nicht Sprint-3.5-Bug)

- **xterm-Console-Error `Cannot read properties of undefined (reading 'dimensions')`** in Dev-Mode beim Tab-Mount/Unmount-Race unter React-StrictMode. xterm-internes Race zwischen `Viewport.syncScrollArea` und `RendererService.dispose`. Funktional harmlos (Tippen, Copy/Paste, Tab-Wechsel laufen), in Production-Builds ohne StrictMode tritt es nicht auf. Eintrag in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **claude-Code-Pasted-Text-Komprimierung.** Bei Pastes >~100 Zeilen ersetzt claude den Inhalt im Terminal durch einen Platzhalter `[Pasted text #N +K lines]`. Das ist claudes Feature, nicht unser Bug — die Bracketed-Paste-Pipeline schickt alle Bytes, claude entscheidet die Anzeige.

---

## 2026-05-09 — Season 3: Multi-Session

### Was jetzt geht

- **Mehrere claude-Sessions parallel als Tabs.** Im Tab-Bar oben Pillen mit Status-Dot, Title, Resume- und ×-Button; rechts ein +-Button. Tab-Wechsel via Klick oder `Ctrl+Tab` / `Ctrl+Shift+Tab`. Alle xterm-Instanzen bleiben dauerhaft mounted (per CSS sichtbar/versteckt) — der Buffer überlebt jeden Tab-Wechsel. Architektur-K2-Annahme „2-5 Tabs realistisch" ist die Speichergrenze.
- **Vollständiger Session-Lifecycle.** Status-Übergänge `running → completed` (PTY-Exit), `running → interrupted` (App-Quit), `running → error` (Spawn-Failure), `running/completed/interrupted/error → archived` (Tab-Schließen via ×), `completed/interrupted/error → running` (Resume) laufen alle durch eine zentrale `SessionLifecycle`-Klasse, die disallowed-Transitions ablehnt und `ended_at` als Side-Effect setzt/nullt.
- **Resume von beendeten Sessions.** Auf Tab-Pillen mit Status `completed`/`interrupted`/`error` erscheint ein ↻-Button; ein Klick spawnt `claude --resume <session-id>` mit dem ursprünglichen `cwd` und gespeichertem `current_model`, der Status wandert zurück auf `running`. Pre-Checks (Binary-Auflösung, cwd-Existenz) wie beim ersten Spawn.
- **NewSessionModal mit Modell-Picker.** `Ctrl+N` oder `+` öffnet ein Backdrop+Dialog (Architektur 6.0.1) mit Title-Input, Type-Pills (Feature/Bug/Review/Docs-Sync) und Modell-Dropdown (human-readable Labels „Opus 4.7" usw., Model-IDs intern). Default aus `settings.default_model`, Esc schließt, Auto-Focus auf Title.
- **Notizen pro Session mit Auto-Save.** Collapsible Footer unter dem aktiven Terminal mit Plain-Text-Textarea. Auto-Save nach 500 ms Debounce, plus Sofort-Flush bei Blur, Tab-Wechsel (Component-Unmount) und `window.beforeunload`. Idempotent: derselbe Wert wird nicht doppelt gespeichert.
- **App-Quit ohne Status-Lärm.** `before-quit` markiert die Lifecycle als `shuttingDown`, patcht alle running-Sessions synchron auf `interrupted`, dann erst `killAll()`. Der `pty:exit`-Handler prüft das Flag und überschreibt nicht mehr — Sprint-2-Bug („alle Sessions beim Quit fälschlich auf completed") ist behoben.
- **Pre-Commit-Gate.** Husky-Pre-Commit-Hook ruft `npm run typecheck && npm test` (Working Rule 6). 91/91 Tests grün, Suite-Lauf ~500 ms — komfortabel unter der Schmerzgrenze.

### Umgesetzte Entscheidungen

- **Tab-Persistenz: Variante A (alle xterm dauerhaft mounted, CSS-Toggle)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Snapshot/Replay (B) und Single-Instance-Multiplexing (C) wären für 2-5 Tabs Premature-Optimization mit echten Bug-Risiken (ANSI-Escape-Replay, Cursor-Reset).
- **Lifecycle-State-Machine: Variante A (zentraler Reducer)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Eine `SessionLifecycle`-Klasse kennt alle erlaubten From×To-Übergänge — disallowed wird abgelehnt, Side-Effects (`ended_at`) zentral. Sprint 5 (State-Detection mit waiting/idle) erweitert sauber dieselbe Stelle.
- **Resume-Modell: Variante A (gleiches Modell wie ursprünglich)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Architektur 6.2 ist Spec; `/model` im laufenden Claude reicht für die seltenen Modell-Wechsel-Fälle.
- **Notes-Save: Variante B (Debounce + onBlur + onUnmount + beforeunload)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Pure-Logik-Util `createNotesSaver` ist driver-injected — Tests fahren ohne React und IPC.
- **App-Quit-Race: Variante A (synchrone DB-Patches vor killAll)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Variante C (Reconciliation beim nächsten App-Start) auf Sprint 8 verschoben — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **Husky-Pre-Commit-Hook eingerichtet.** `npm run typecheck && npm test` als Gate; Working Rule 6 hat damit eine Maschine, die sie durchsetzt.

### Bonus-Bugfix unterwegs

- **StrictMode-Double-Spawn beim ersten Tab-Mount.** `pty:create` wurde im Dev-Mode zweimal gefeuert (StrictMode-Effekt → Cleanup → Re-Effekt) und schlug beim zweiten Mal an der UNIQUE-Constraint auf `sessions.id` an. Fix: `useRef`-Guard pro Tab-Instanz, der die Spawn-Dispatch-Phase markiert (Sprint-2-Pattern, war bei der Multi-Tab-Refaktorisierung herausgefallen, weil der Briefing-Hinweis nur auf UUID-Generation zielte — der Side-Effect-Aspekt wurde unterschätzt).

### Offen geblieben (bewusst verschoben)

- **State-Detection (running vs. waiting/idle via JSONL-Event-Frequenz)** — Sprint 5. Status-Dot bleibt in Sprint 3 statisch („running" solange PTY lebt, sonst die persistierte Status-Spalte).
- **Crash-Recovery für orphane running-Sessions beim App-Start** — Sprint 8 (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md)). Variante C aus Sprint-3-Briefing, vom User explizit dorthin verschoben.
- **Verlauf-Panel mit historischen Sessions** — Sprint 6. In Sprint 3 sind Tabs ein Live-Konzept; Resume gilt nur für Sessions, deren Tab noch im Bar liegt.
- **Settings-UI für Modell-Liste / claude-Binary** — Sprint 8 (Settings-Dialog).

---

## 2026-05-09 — Season 2: Single-Tab-PTY

### Was jetzt geht

- **claude läuft im xterm-Terminal.** Beim App-Start spawnt TakumiDeck `claude --model <default>` als ConPTY-Subprozess im konfigurierten `workspace_path`; der Output landet live im xterm-Canvas im Renderer. Eingabe, Resize und natürliches Beenden funktionieren end-to-end.
- **PTY-Output ist gegen IPC-Overload gedrosselt.** Pro Session puffert der Main-Prozess ankommende Daten und flusht alle 16 ms in einem einzigen `pty:data`-Event Richtung Renderer (Architektur K3). Lazy-Timer: ohne Daten keine Idle-Last, ohne Output kein leerer Tick.
- **Sessions landen in der DB.** Jede Session bekommt eine Row in `sessions` mit `status='running'` beim Spawn; bei natürlichem PTY-Exit wird automatisch auf `status='completed'` plus `ended_at` gewechselt. `session:update` erlaubt dem Renderer Notes/Title/Status-Patches.
- **Renderer crashed nicht mehr durch ConPTY-Worker-Errors.** Pre-Checks für `claude_binary_path` (über `where`/`which`) und `cwd` (Existenz) plus ein `uncaughtException`-Handler im Main-Prozess fangen die typischen Fehler (`ERROR_FILE_NOT_FOUND`, `ERROR_DIRECTORY`) sauber ab — der User sieht eine klare Meldung statt eines „A JavaScript error occurred"-Dialogs.

### Umgesetzte Entscheidungen

- **@lydell/node-pty als PTY-Backend** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Der ursprünglich genannte @homebridge-Fork hat keine Win32-Prebuilts mehr für Electron 33+; lydell verteilt NAPI-Binaries via optionale Subpakete (esbuild-Stil) und ist Electron-Version-unabhängig.
- **xterm.js auf v5.5 gepinnt** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). v6 hat den Canvas-Renderer entfernt; Architektur-K2 verlangt explizit Canvas (kein WebGL).
- **`claude_binary_path` als Setting mit PATH-Default** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Default `'claude'` greift den PATH ab, der Pre-Check bevorzugt auf Windows `.exe`/`.cmd`/`.bat` über das endungslose Unix-Shell-Script.
- **PtyManager als Klasse mit injiziertem Spawn-Driver.** Spiegelt das SettingsStore-Pattern aus Sprint 1; Tests fahren mit Fake-Driver, kein realer Subprozess. Listener-Setter statt EventEmitter, weil die IPC-Bridge ohnehin nur einen Konsumenten hat.
- **Default-Project als FK-Lifeline** (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md)). Bis der Workspace-Scanner aus Sprint 4 echte Projekte erkennt, hängen alle Sessions an einem stabilen `__default__`-Project-Row.

### Bonus-Bugfix unterwegs

- **Vite-Renderer-Config hatte `root` nicht gesetzt.** Die Sprint-1-Foundation-Smoke-View hat in Wirklichkeit nie gerendert (`http://localhost:5173/` lieferte 404, der Sprint-1-Eintrag war voreilig); der Bug fiel erst auf, als das schwarze Fenster in Sprint 2 sichtbar wurde. Fix: `root: src/renderer` + absoluter `outDir` in `vite.renderer.config.ts`.

### Offen geblieben (bewusst verschoben)

- **Multi-Tab + Tab-System** — Sprint 3.
- **Session-Lifecycle für interrupted / error / archived + Resume-Button** — Sprint 3. Sprint 2 hat nur die `running → completed`-Transition automatisch.
- **Notizen pro Session (Auto-Save)** — Sprint 3. `session:update` kann Notes schon, das Renderer-Textarea fehlt.
- **Modell-Auswahl-Dialog** — Sprint 3+. Sprint 2 spawnt mit `settings.default_model`, ohne UI-Picker.
- **State-Detection (running vs. idle via JSONL-Event-Frequenz)** — Sprint 5.
- **Settings-UI für `workspace_path` / `claude_binary_path`** — Sprint 8 (Settings-Dialog). Wer aus Sprint 1 einen ungültigen `workspace_path` mitbringt, muss `settings.json` aktuell noch manuell editieren.

---

## 2026-05-09 — Season 1: Foundation-Skelett

### Was jetzt geht

- **Die App startet.** `npm start` (oder `start-dev.bat`) öffnet ein Electron-Fenster mit dem Foundation-Smoke-View, das Version + komplettes Default-Settings-JSON vom Main-Prozess über die typed IPC-Bridge empfängt. Vorher gab es nur Doku, keinen lauffähigen Code.
- **Persistente Datenstruktur ist da.** Beim ersten Start legt die App `%APPDATA%\TakumiDeck-dev\` mit `settings.json` (Defaults aus Architektur K4), `data.sqlite` (WAL-Mode + komplettes Schema aus `0001_init`), `logs/` und `templates/` an.
- **IPC-Boundary ist sicher.** `contextIsolation: true` + `sandbox: true` + zod-Runtime-Validation für jedes Payload — Renderer hat keinen Node-Zugriff, fehlerhafte Calls liefern saubere Result-Objekte statt Exceptions.

### Umgesetzte Entscheidungen

- **Eigene JSON-Operationen statt electron-store** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Atomic write via `.tmp` + rename, zod-Validierung beim Lesen.
- **zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Verhindert, dass spätere Channels still ohne Validation eingeführt werden.
- **electron-log** als Logging-Library, schreibt in `<userData>/logs/main.log` (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)).
- **Vitest-Setup direkt mit Foundation-Smoke-Tests** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). 20 Tests grün: Result-Helper, zod-Schemas, SettingsStore-Roundtrip, Migration-Runner.

### Offen geblieben (bewusst verschoben)

- **PTY + xterm.js + Tabs** — Kern von Sprint 2.
- **Volles Layout (Sidebar / Terminal / Right-Pane / Plannutzung)** — der Smoke-View ist nur ein JSON-Dump, das echte Layout kommt mit den jeweiligen Sprints (Sidebar mit Sprint 4, Right-Pane mit Sprint 7).
- **Migration-Tests gegen echte SQLite-Verbindung** — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), Fake-Driver-Pattern stattdessen.

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

## YYYY-MM-DD — Season <Nummer>: <Feature-Name>

### Was jetzt geht

- **<Kern-Mehrwert aus Nutzersicht>.** Ein Satz, der beschreibt, was neu möglich ist. Vorher-Zustand kurz mit dazugegeben („Vorher war …").
- **<Zweiter Mehrwert, falls mehrere>.**

### Umgesetzte Entscheidungen

- **Variante A / B / C gewählt.** Kurz Begründung, warum die Alternative nicht genommen wurde. (Details gehören in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md), hier nur der Anker.)
- **<Andere Entscheidung mit Scope-Charakter>.**

### Offen geblieben (bewusst verschoben)

- **<Teil, der explizit ausgeklammert wurde>.** Wandert nach Phase 2 / in eine eigene Season / in die Roadmap.
