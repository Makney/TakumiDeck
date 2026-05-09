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
