# Feature-Status

Legende:

- ✅ **fertig** – läuft im aktuellen Build
- 🟡 **teilweise** – Grundgerüst steht, es fehlt was Offensichtliches
- ⛔ **offen** – noch nicht angefasst

Nach jedem umgesetzten Feature wird der Eintrag hier auf ✅ gesetzt und in [CHANGELOG.md](./CHANGELOG.md) ein Eintrag angelegt.

Alle offenen Features mit Details → [roadmap/](./roadmap/)

---

## Foundation (Sprint 1)

Grundgerüst der Electron-App.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Electron-Skelett`              | ✅      | 2026-05-09 — Forge + Vite + React, Hardening (sandbox, FuseV1, contextIsolation) |
| `IPC-Foundation`                | ✅      | 2026-05-09 — typed Channels, Result-Pattern, zod an allen Boundaries |
| `SQLite-Foundation`             | ✅      | 2026-05-09 — better-sqlite3, WAL, Migration-Runner mit `PRAGMA user_version` |
| `Settings-System`               | ✅      | 2026-05-09 — eigene JSON-Operationen mit atomic write |

## Sessions (Sprint 2-3)

Multi-Session-Management.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `PTY-Spawn`                     | ✅      | 2026-05-09 — @lydell/node-pty (NAPI), 16ms-Buffer-Flush, Pre-Check für Binary + cwd |
| `xterm.js-Terminal`             | ✅      | 2026-05-09 — Canvas-Renderer + Addons (fit, search, serialize, web-links), Single-Tab |
| `Tab-System`                    | ✅      | 2026-05-09 — Multi-Tab mit Pillen, +-Button, Ctrl+Tab/Ctrl+Shift+Tab, alle xterm dauerhaft mounted (Variante A) |
| `Session-Lifecycle`             | ✅      | 2026-05-09 — zentrale `SessionLifecycle`-State-Machine, alle 5 Status-Übergänge inkl. Resume |
| `Resume-Funktion`               | ✅      | 2026-05-09 — ↻-Button auf completed/interrupted/error, `claude --resume <id>` mit gespeichertem cwd/Modell |
| `Modell-Auswahl`                | ✅      | 2026-05-09 — NewSessionModal mit Modell-Dropdown (Opus 4.7…Haiku 4.5), Default aus settings.default_model |
| `State-Detection (reduziert)`   | ✅      | 2026-05-10 — Last-Event-Timestamp-Logik (<3 s = running, sonst idle), 2-s-Tick im Main, Lifecycle-State-Machine um running ↔ idle erweitert |
| `Notizen pro Session`           | ✅      | 2026-05-09 — collapsible Footer, 500 ms Debounce + onBlur + onUnmount + beforeunload (Variante B) |
| `Copy/Paste im Terminal`        | ✅      | 2026-05-09 (Sprint 3.5) — Smart Ctrl+C/V, Ctrl+Shift+C/V, Ctrl+Insert/Shift+Insert; Bracketed-Paste; dezente Selection-Tonung |

## Workspace (Sprint 4)

Projekt-Erkennung und -Verwaltung.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Workspace-Scanner`             | ✅      | 2026-05-09 — Async-Walk mit Konkurrenz-Limit (Variante A), max-depth 5, Stop bei `CLAUDE.md` / `.git`, FsLikeDriver für Tests |
| `CLAUDE.md-Parser`              | ✅      | 2026-05-09 — `gray-matter` + zod-Validierung, strict für `trigger_phrases`, locker für `on_demand_files` |
| `Project-Sidebar`               | ✅      | 2026-05-09 — 240 px Sidebar mit Active-Highlight + Running-Badge, `+`/`↻`-Buttons, Per-Projekt-Tab-Filter, Sprint-2/3-Legacy-Bucket sichtbar bei `session_count > 0` |

## Token-Dashboard (Sprint 5)

Live-Tracking von Token-Verbrauch.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `JSONL-Watcher`                 | ✅      | 2026-05-10 — chokidar v5 mit `ignored`-Predicate (kein Glob), `awaitWriteFinish` 100 ms, Initial-Scan persistiert byte-offsets in jsonl_offsets-Tabelle |
| `Token-Aggregation`             | ✅      | 2026-05-10 — messages-Tabelle pro JSONL-Zeile + usage_buckets Hourly-Aggregat, Filter all/top_tier/sonnet/haiku/custom |
| `P90-Detection`                 | ✅      | 2026-05-10 — rolling 192 h, Fallback auf model_limits bei <24 Buckets, Limit-Quelle ('p90'/'fixed'/'fallback') im Tooltip |
| `Dashboard-UI`                  | ✅      | 2026-05-10 — untere Zeile 300 px, eine UsageBar pro limit_bar (CSS-Bars), Per-Session-Kontext-Bar, UsageDetailModal mit Recharts-Linie |

## Templates (Sprint 6)

Schnelles Erstellen von Standard-Prompts.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Template-Reader`               | ✅      | 2026-05-10 — on-demand-Scan via `fs:list-templates` (Variante B), Globaler + Per-Projekt + Legacy-Konvention `_TEMPLATE.md`, beide Quellen mit Source-Tag separat (Variante B) |
| `Variable-Filling`              | ✅      | 2026-05-10 — Pure-Logik-Util mit Auto-Variablen (PROJEKT_NAME/NEXT_SEASON_NR/CURRENT_PHASE_FILE/DATUM) + User-Variablen (FEATURE_NAME/AUFGABE Pflicht, HINWEISE optional), Live-Preview |
| `Template-Send`                 | ✅      | 2026-05-10 — Bracketed-Paste via `td-template-send`-CustomEvent → `terminal.paste(text)`; nutzt Sprint-3.5-Mechanik wieder, Ctrl+T plus Templates-Pill in der Action-Bar |

## Season-Tracker (Sprint 6)

Nummerierung und Verlauf von Sessions.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Season-Nummerierung`           | ✅      | 2026-05-10 — atomar im Main-Handler. Phase-2-Season-11-Refit: Counter ist jetzt aus `sessions.season_number` abgeleitet (`MAX+1`) statt aus eigener Spalte; Templates-Send mit `{{NEXT_SEASON_NR}}` alloziert die Nummer auf die aktive Session (kein Drift mehr, wenn Seasons per Templates-Send statt neuer Feature-Session laufen). Vorschau im NewSessionModal + TemplatesModal-Sidebar. |
| `Verlauf-Panel`                 | ✅      | 2026-05-10 — Replace-View (Variante A) mit Filter (Typ/Status/Volltext) + Detail-Pane mit Resume + Archive (Inline-Confirmation); Legacy-Bucket sichtbar mit Hinweis-Banner (Variante A) |

## Editor + Git (Sprint 7)

Markdown-Editor und Diff-Viewer.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Markdown-Editor`               | ✅      | 2026-05-10 — CodeMirror 6 + lang-markdown + lang-yaml, oneDark + Custom-Override (Q5-B), manueller Save Ctrl+S mit unsaved-Indikator (Q1-A), Datei-Tab-Stack pro Projekt |
| `YAML-Validierung`              | ✅      | 2026-05-10 — Pure-Logik via js-yaml + 500ms-Debounce-Linter (Q4-B), Marker-Mapping auf Quell-Datei-Zeilen, nur CLAUDE.md, kein Auto-Fix |
| `Markdown-Preview-Toggle`       | ✅      | 2026-05-10 — Toggle-Pills in der Editor-Toolbar; Preview via react-markdown mit App-Tokens (Display-Font für Headings, Mono für Code) |
| `Diff-Viewer`                   | ✅      | 2026-05-10 — @codemirror/merge.unifiedMergeView via git:show (HEAD) + fs:read (Working); File-Liste mit Status-Marks; Empty-States für clean-tree und non-git; read-only |
| `Pre-Commit-Panel`              | ✅      | 2026-05-10 — Eigener Modal (Q3-A) mit Branch + File-Liste + Sensitive-File-Warnung (Q7-A: hartcoded .env(.*)/secrets.*/`*.key`/`*.pem`); Trigger-Phrase via Sprint-6-Bracketed-Paste an aktive PTY |

## App-Chrome (Sprint 7-8)

Header-Bar und globale UI-Komponenten.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Header-Bar`                    | ✅      | 2026-05-10 (Sprint 8) — 36-px td-titlebar (Architektur 6.0) mit Brand (匠 + TakumiDeck + Version), Meta (Projekt + Branch via git:status-Cache + Sessions-Counter), Window-Controls (Settings ⚙ + min/max/close). `frame: false` — keine native Doppel-Bar. Branch-Refresh per CustomEvent (V3-B), claude-Health-Banner bei fehlender Binary. |
| `Action-Bar`                    | ✅      | 2026-05-10 (Sprint 7) — `td-term-bar` aus Sprint 6 ergänzt um `commit`-Pill, die das PreCommitModal öffnet (Sprint-6-SEASON_LOG-Hinweis erfüllt). Modell-Pill (read-only), Templates-Pill, commit-Pill, Status-Badge rechts. |
| `Tastatur-Hints`                | ✅      | 2026-05-10 (Sprint 8) — Statische `<kbd>`-Pillen unter dem Terminal: Enter senden · Ctrl+T Templates · Ctrl+N Neue Session · Ctrl+K Einstellungen · Ctrl+Tab nächster Tab. |

## Right-Pane (Sprint 7)

Permanent sichtbarer Right-Pane mit Diff, Editor und Notizen.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Right-Pane-Layout`             | ✅      | 2026-05-10 — 4-Spalten-Grid (240/1fr/1fr/232) nach Design-Handoff; Editor in eigener breiter Spalte, Files+Notes als 232-px-Stack ganz rechts (Mid-Sprint-Pivot vom 232-px-Single-Pane-Briefing) |
| `Datei-Tabs`                    | ✅      | 2026-05-10 — Per-Projekt-Tab-Stack (Q6-B) im useFileTabsStore; Diff-Tab immer ganz links; Schnellzugriff aus on_demand_files + Standards (CLAUDE.md/CHANGELOG/FEATURES/ENTSCHEIDUNGEN/Phase-File); M-Indikator für dirty Tabs |
| `Datei-Browser`                 | ✅      | 2026-05-10 — fs:list-tree mit Driver-Injection und Skip-Liste (node_modules/.git/dist/build/.vite/.next/.idea/.vscode/out/coverage); hierarchisch mit Expand/Collapse; Filter vorbelegt mit `.md` (Q2-B); M-Indikator für dirty Files |

## Stats-Section (Sprint 5, Skeleton)

Im MVP nur Skeleton. Volle Implementation in Phase 2.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Übersicht/Modelle-Toggle (Skeleton)` | ✅ | 2026-05-10 — Übersicht-View mit 3 Mini-Karten (Aktuelle Session, letzte 5 h, letzte 168 h), Modelle-View als Phase-2-Hinweispille |

## Polish (Sprint 8)

Abschluss-Schliff vor MVP-Release.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Settings-Dialog`               | ✅      | 2026-05-10 — 6 Tabs (Allgemein/Workspace/Modelle/Token-Tracking/Terminal/About) mit Auto-Save pro Form-Field (V2-A, 500 ms Debounce + Coalescing) und CodeMirror-6-JSON-Editor mit Live-Lint (V1-A, zod-validiert, expliziter Apply). Trigger Ctrl+K oder ⚙ in der Header-Bar. Open-Data-Folder-Button. |
| `Error-Handling`                | ✅      | 2026-05-10 — V7-C-Mix: FS-EACCES/EPERM/EBUSY → FS_PERMISSION mit Aktion-Hint, SQLite `busy_timeout=5000`, claude-Health-Channel + Header-⚠-Banner mit Klick-zu-Settings, SESSION_NO_CLAUDE_UUID-Direkt-Archivieren-Hint im HistoryPane. Korrupte JSONL bleibt Sprint-5-robust. |
| `Dark-Theme`                    | ✅      | 2026-05-10 — Im MVP einheitlich Dark via `tokens.css` (CSS Custom Properties aus dem Design-Handoff). Keine Light-Variante (Phase 2). |
| `Build + Distribution`          | ✅      | 2026-05-10 — `npm run make` produziert Squirrel-Setup + Portable-ZIP parallel (V6-B). Manuelle GitHub-Release-Anleitung in `docs/DEV_SETUP.md`. Kein Code-Signing, kein Auto-Update (Phase 5+). |

## Pre-Release-QA (Sprint 9)

Letzter Schliff vor MVP-Release.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `UI-Vergleich gegen Design-Vorlage` | ✅  | 2026-05-10 — Zwei-Pass-Findings (`docs/code-review/SPRINT9_UI_FINDINGS.md` + `SPRINT9_LIVE_VERGLEICH.md`). Kritisch + alle B/C/D-Punkte umgesetzt: 22-px-Display-Headlines (Sidebar/Modal), 28-px PlanPane-Headline, Window-Frame-Tabs, KeyboardHints-Hierarchie, ctx-Slot in Action-Bar, Toast-Slot, td-file.selected, Range-Toggle, TitleBar-System-Status, FilesPanel-Caption, Modal-Wide 820 px, Vorlage-Naming (td-main/td-col-right-stack/td-dash-/td-stat/td-field/td-radio), Settings-Modal-Sidebar (V D5-A), HistoryActionModal mit Resume/Archive/Verlauf-Öffnen, per-Bar reset_schedule (UI-Slot), xterm-Scrollbar, Action-Bar-Wrapping mit `flex: 1 1 240px`-min-width-Trick, cols-Estimate beim Resume. |
| `Code-Review + Debugging`           | ✅  | 2026-05-12 — 9 Bereiche aus REVIEW_PLAN.md durch (Build/Konfig, Modals/Components, IPC-Handler, Preload-Bridge, Main-Hardening); Electron 33→41 + Vite 5→6 Security-Bump, CSP-Header via webRequest.onHeadersReceived, will-navigate + setWindowOpenHandler, default-deny Permission-Handler. Validierung: `npm run typecheck` + `npm run lint` + `npx vitest run` (398/398) grün. |

---

## Phase 2 — Komfort & Stabilisierung (v1.0)

Trigger-getrieben. Eintrag wird auf 🟡/✅ gesetzt, sobald aus PHASE2.md gezogen und implementiert.

### Sessions (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Volle State-Detection`              | ✅      | 2026-05-12 (Phase-2-Season-1) — versionierte TUI-Patterns (`cc-1.x`) auf serialisiertem xterm-Buffer im Renderer, JSONL-Timestamp-Loop im Main; Renderer pusht `waiting`/`permission-prompt`, Loop schreibt `running`/`idle`. Box-Layout-Toleranz (`^\s*`) für Claude-Code-2.x-Input-Box mit eingerücktem `? for shortcuts`. |
| `Trigger-Phrasen-Schnellbuttons`     | ✅      | 2026-05-13 (Phase-2-Season-3) — dynamische Pillen-Reihe in der Action-Bar pro `trigger_phrases`-Eintrag. Schema-Catchall erlaubt beliebige Extra-Keys jenseits von `docs_update`/`commit`. Send via `td-template-send`-CustomEvent mit neuem `submit: true`-Flag; TerminalTab schickt nach dem Bracketed-Paste ein separates `\r` an die PTY, weil Newlines im Paste-Block vom Claude-TUI als Shift+Enter behandelt werden. `commit` bleibt aus der dynamischen Liste ausgeklammert (PreCommit-Modal-Pille bleibt). |
| `Eigene Session-Art`                 | ✅      | 2026-05-13 (Phase-2-Season-5) — fünfter Button „Eigene Art" im NewSessionModal mit Freitext-Feld; Bezeichnung wird in neuer Spalte `sessions.custom_type_label` (Migration 0005) gespeichert. `SessionType` um `'custom'` erweitert, `PtyCreateInputSchema` verlangt per `superRefine` ein Pflicht-Label bei `type='custom'`. Verlauf-Panel und HistoryActionModal zeigen die freie Bezeichnung; Filter-Bucket „Eigene Art" sammelt alle custom-Sessions in eine Pille. Nebenfunde: xterm-Dimensions-Race behoben (terminal.open in RAF deferiert) und StrictMode-Spawn-RAF-Race aus Sprint 9 (Dispatch-Flag-Reset im Cleanup). Nicht aus PHASE2.md — User-Trigger. |
| `JSONL-Watcher Polling-Ring`         | ✅      | 2026-05-14 (Phase-2-Season-15) — Per-Session-`fs.stat`-Loop (250 ms, mtime+size-Diff) parallel zur chokidar-Pipeline pusht Token-Updates live waehrend einer laufenden claude-Antwort, statt erst am 100-ms-`awaitWriteFinish`-Ende. `attach` beim `pty:create` + Resume, `detach` beim `pty:exit`/`session:close`/`session:archive`, `stopAll` im `before-quit`. ENOENT-no-op, andere stat-Errors loggen. Shared `JsonlWatcher.scheduleHandle` via neuem public `notifyChanged`-Hook (gleiche Anti-Reentrancy-Map + jsonl_offsets-Tail wie chokidar). |
| `Claude-UUID-basiertes Session-Mapping` | ✅   | 2026-05-14 (Phase-2-Season-15) — neue Spalte `sessions.jsonl_path` (Migration 0007) plus partieller Index `idx_sessions_jsonl_path`. `pty:create` setzt den deterministisch berechneten Pfad (`expectedJsonlPath(claudeProjectsRoot, cwd, sessionId)`) gleich beim Spawn. Resolver-Drei-Stufen: 1. `findByJsonlPath` (Single-Index-Lookup), 2. `findByClaudeSessionId` (Season-9-Pfad), 3. encodeCwd-Fallback. Watcher-Backfill schreibt `jsonl_path` rueckwirkend mit, sobald die UUID-Aufloesung eine Legacy-Session trifft. |
| `Multi-Session-cwd-Backfill-Migration` | ✅   | 2026-05-14 (Phase-2-Season-15) — Boot-One-Shot-Pass in `src/main/jsonl/backfill.ts`. Pro cwd-Bucket mit Sessions ohne `claude_session_id`: JSONL-Files nach `mtime` ASC, Sessions nach `started_at` ASC sortieren, `min(n,m)` paaren (`claude_session_id` + `jsonl_path` idempotent setzen). Flag `backfill_jsonl_link_v1=done` ueber neuen `MetaKvRepository` (SQLite-`settings`-KV) verhindert Re-Run. Files ohne UUID-Stem werden ignoriert; Pre-Hotfix-Sessions ohne JSONL bleiben dauerhaft resume-tot (Sprint-8-UX-Hint deckt das ab). |

### Terminal (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Screenshot-Drag-and-Drop`           | ✅      | 2026-05-12 (Phase-2-Season-2) — Drag-Drop von Image-Files ins Terminal-Pane pastet den absoluten Pfad (Quoting bei Whitespace); Direkt-Bilder ohne Disk-Pfad und Clipboard-Images (Ctrl+Shift+V nach Win+Shift+S) werden nach `<userData>/screenshots/` gespeichert. MIME-Whitelist PNG/JPEG/GIF/WebP, neuer IPC `fs:save-screenshot`, Preload-Bridge `webUtils.getPathForFile`. Nicht aus PHASE2.md — User-Trigger. |
| `Screenshot-Retention`               | ✅      | 2026-05-15 (Phase-2-Season-17) — Boot-One-Shot-Pass walkt `<userData>/screenshots/` einmal beim App-Start, loescht Files aelter als `max_age_days` (Default 30) und cappt die Gesamtgroesse auf `max_total_mib` (Default 500, aelteste Files zuerst). Pure Helper `computeRetentionPlan` zweistufig (Age-Cutoff strict `mtimeMs < cutoff`, dann Cap-Cut auf Survivors). Hartfehler blockt App-Start nicht, Per-File-Failures (EACCES/EBUSY) loggen und ueberspringen. Beide Schwellen auf `0` deaktiviert die Auto-Retention. Schwellen im Settings-Modal-„Allgemein"-Tab via Number-Inputs (Auto-Save 500 ms), plus Manual-Clear-Button mit Doppel-Confirm und Anzeige „X Datei(en) · Y.Y MiB" via neuen IPCs `fs:screenshots-summary`+`fs:clear-screenshots`. |

### Projekt-Verwaltung (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Projekt entfernen`                  | ✅      | 2026-05-14 (Phase-2-Season-8) — Hover-Trash-Icon im Sidebar-Eintrag (Variante A) öffnet eigenes Bestätigungs-Modal mit Doppel-Confirm; Default-/Legacy-Bucket bekommt kein Icon, Server lehnt `DEFAULT_PROJECT_ID` mit `PROJECT_DEFAULT_IMMUTABLE` ab. Neuer IPC `project:remove`: Bulk-UPDATE auf Default-Bucket (sessions + messages) und `DELETE FROM projects` in einer better-sqlite3-Transaction (`removeProjectTxn`). Offene Tabs werden vor dem Remove via `session:close` geschlossen, aktives Projekt fällt automatisch zurück. |
| `First-Start-Workspace-Wizard`       | ⛔      | Welcome-Screen bei fehlender `settings.json`; expliziter Workspace-Pick statt stillem Default-Scan von `<home>/Projekte` |

### Token-Dashboard (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `20%-Kontext-Soft-Warning`           | ✅      | 2026-05-14 (Phase-2-Season-9) — Settings-Toggle + Schwellwert-Input (Default 20 %) im Token-Tracking-Tab. Marker an der Per-Session-Kontext-Bar in der Action-Bar (2 px breit, ragt 2 px über und unter die Bar, Off-White) zeigt permanent die Distanz zur Schwelle; ab Überschreitung wechselt die Bar auf vierte Tonungs-Stufe `soft` (`--td-blue`, sitzt zwischen Default-Grün und der bestehenden Gelb-Schwelle), Marker bekommt einen blauen Halo via `box-shadow`. Tooltip um „Kontext über X % — Output-Qualität kann sinken" erweitert. Nebenfund mit-gehoben: JSONL-Watcher matcht jetzt primär über die claude-eigene Session-UUID (`sessions.claude_session_id`) statt ausschließlich via cwd-Encoded-Folder — bei mehreren parallelen Sessions im selben Projekt landet der Kontext nicht mehr auf der `started_at`-jüngsten Session, sondern auf der tatsächlich gemeinten. |
| `Modell-Filter im Verlauf-Panel`     | ✅      | 2026-05-14 (Phase-2-Season-10) — Dritte Pillen-Reihe „Modell" zwischen Status und Suche, statische 5er-Liste (Opus 4.7 / 4.6, Sonnet 4.6 / 4.5, Haiku 4.5), Multi-Select; Filter wirkt auf `sessions.current_model` via dynamisches `IN(...)`-WHERE im sessionsHistory-Statement-Cache. Plus Detail-Pane-Block „Modelle" zwischen Token und Notizen mit Inline-Aggregat aus `messages.model` (absteigend nach count, blendet sich bei ≤1 Modell aus). Datenmodell-Nachzug via Migration 0006 (`ALTER TABLE messages ADD COLUMN model TEXT NULL` + Backfill aus `sessions.current_model` für Pre-Migration-Rows). Watcher schreibt `parsed.model` ab Season 10 exakt mit, `MessageRepository.aggregateModelsForSessions` als Bulk-Query mit Statement-Cache pro IN-Listen-Länge (kein N+1). |
| `Reset-Schedule-Aggregation`         | ✅      | 2026-05-14 (Phase-2-Season-16) — Backend-Nachzug fuer den Sprint-9-UI-Slot `LimitBar.reset_schedule`. Pure Helper `computeResetWindowStart`/`computeNextResetAt` (lokale Zeit, DST-immun via Date-Tages-Arithmetik). `resolveWindow` rechnet bei gesetztem `reset_schedule` den `fromBucket` vom letzten Reset-Zeitpunkt rueckwaerts statt rolling. P90-Schaetzung bleibt rolling (Limit-Quelle stabil), nur der Verbrauchs-Counter aendert sich. Sprint-9-Tooltip-Suffix `(Phase-2-Backend)` entfernt. `UsageWindowResult` um `windowStartAt`/`windowEndAt` erweitert fuer den Reset-Footer im Renderer. |
| `5h-Session-Block-Aggregat`          | ✅      | 2026-05-14 (Phase-2-Season-16, User-Trigger) — 5h-Bar laeuft jetzt als echter Anthropic-Session-Block: Window startet beim ersten Token nach dem letzten Block-Ende, fixer 5h-Block bis dann Reset. Neues optionales Schema-Feld `LimitBar.aggregation_mode: 'rolling' \| 'session_block'`. Default-by-Convention im Resolver: `window_hours <= 6` → session_block, sonst rolling (existierende 5h-Bar bekommt das neue Verhalten ohne Settings-Migration). Block-Erkennung via Bucket-Iteration ueber Lookback-Fenster (2× window_hours), kippt bei `bucket_ts >= blockStart + window_hours` in neuen Block. Neue Repository-Methode `bucketRange` (gibt `{bucket, tokens}[]` ASC) auf SQLite + InMemory. |
| `Reset-Footer unter Plannutzungs-Bars` | ✅    | 2026-05-14 (Phase-2-Season-16) — Dezenter Hinweis unter jeder UsageBar in der Plannutzungs-Pane: `„Zurücksetzung in 2 Std. 37 Min. → 15:00 Uhr"` (Session-Block <24h), `„Zurücksetzung in 3 Tagen → So., 14:00 Uhr"` (Wochen-Reset ≥24h). Pure helper `formatResetFooter(windowEndAt, now)` in `src/renderer/components/formatResetFooter.ts`. Live-Tick alle 30 s, damit der Countdown sich abnutzt. Sichtbar nur bei Bars mit aktivem Reset-Anker — rolling-Bars ohne `reset_schedule` zeigen keinen Footer. CSS-Klasse `.td-usage-bar-hint`. |
| `Wochen-Reset im Settings-Modal`     | ✅      | 2026-05-14 (Phase-2-Season-16) — Neuer Block „Wochen-Reset" im Token-Tracking-Tab vor dem Raw-JSON-Editor: Wochentag-Dropdown (Mo–So) + Stunden/Minuten-Input. Apply schreibt `reset_schedule` einheitlich in alle `limit_bars` mit `window_hours >= 168`. Default-Wert Mo 00:00, sofern noch nichts gesetzt. JSON-Editor-Hint dokumentiert beide neuen Felder (`reset_schedule` + `aggregation_mode`) fuer Per-Bar-Drift. |
| `Cache-Hit-Statistik`                | ✅      | 2026-05-14 (Phase-2-Season-16) — Migration 0008: neue Spalten `messages.tokens_cache_creation` + `messages.tokens_cache_read` (`NOT NULL DEFAULT 0`). Watcher schreibt die drei Anteile (input + cache_creation + cache_read) ab Season 16 getrennt mit; `tokens_in` bleibt aus Backward-Compat-Gruenden die Summe. Migration leert `messages`/`usage_buckets`/`jsonl_offsets`, beim naechsten App-Start liest der Watcher alle JSONL-Dateien neu (full Re-Scan einmal pro Installation). Cache-Hit-Rate in der Modelle-View als fuenfte Tabellen-Spalte plus Gesamt-Zahl oben („Cache-Hit · 94.8 %"). Tradeoff: Pre-Hotfix-Sessions ohne JSONL verlieren `tokens_in`/`tokens_out`-Aggregate — siehe TECH_SCHULDEN. |

### Stats & Heatmap (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Stats-Cards`                        | ✅      | 2026-05-14 (Phase-2-Season-12) — Acht Aggregat-Karten in 4×2-Grid: obere Reihe Volumen (Sitzungen/Nachrichten/Tokens/Aktive Tage), untere Reihe Verhalten (Streak/Längste/Spitzenstunde/Lieblingsmodell). Scope-Toggle Aktiv/Global im Header, Range-Toggle Alle/30d/7d aktiv, beide in localStorage persistiert. Live-Refresh via `usage:update`-Push (600-ms-debounced). Aggregat direkt aus `messages` + `sessions` via neuem `stats:project-overview`-IPC (Variante A Lazy-Pull, keine Migration). Streak-Logik als pure Funktion (UTC-basiert, DST-immun); Definition: intakt bei letztem Tag heute oder gestern. |
| `Aktivitäts-Heatmap`                 | ✅      | 2026-05-14 (Phase-2-Season-13) — GitHub-Style 30/52-Wochen-Calendar-Grid rechts neben den Cards in der „Übersicht"-View. CSS-Grid 7×N mit `grid-auto-flow:column` und color-mix-Tonungen über `--td-accent`. Quartil-basierte 5-Stufen-Farbskala (p25/p50/p75 der nicht-leeren Tage), Single-Aktiv-Tag-Edge → Level 4. Eigener 30W/52W-Toggle in der Heatmap-Header-Zeile (persistiert in `td.heatmapWeeks`), Range-Toggle Alle/30d/7d wirkt bewusst NICHT auf die Heatmap. Cards wandern dafür ins kompakte 2×4-Grid links (reduziertes Padding/Font-Size), beide stretchen auf gleiche Höhe in der 300-px-Bottom-Row. Neuer `HeatmapRepository` (SqliteHeatmapDriver + InMemoryHeatmapDriver) + neuer IPC `stats:heatmap`, Pure Helpers für Window-Anker + Quartile + Day-Enumeration. |
| `Modelle-View`                       | ✅      | 2026-05-14 (Phase-2-Season-14) — Per-Modell-Aufschlüsselung als zweiter Tab in der Stats-Pane: oben horizontale CSS-Bars pro Modell (Modellname · Track · Prozent · Tokens) mit color-mix-Tonungen über `--td-accent` (Top-Modell voller Accent, Rest l3-Heatmap-Stufe), unten kompakte Tabelle (Modell · Sessions · Tokens · ⌀ pro Session). Sessions-Count via `COUNT(DISTINCT session_id)` aus `messages`. Scope/Range aus Season 12 werden geteilt (kein eigener Toggle), Live-Refresh via `usage:update`-Push (600 ms debounced). Eigener IPC `stats:models` mit neuem `ModelStatsRepository` (SqliteModelStatsDriver + InMemoryModelStatsDriver, Statement-Cache pro Scope/Range), separater Refresh-Pfad damit der Cards-Tick die GROUP-BY-Models-Query nicht mit auslöst. NULL-Modelle (Pre-Migration-Backfill-Tail) fliegen raus. |
| `Easter-Egg-Vergleiche`              | ⛔      | „~31× LotR"-Token-Vergleiche, konfigurierbare Werke |
| `30d/7d-Filter`                      | ✅      | 2026-05-14 (Phase-2-Season-12, parallel zu Stats-Cards) — Range-Toggle Alle/30d/7d in der Stats-Pane-Header-Bar wirkt auf alle acht Stats-Cards; persistiert in localStorage. Heatmap und Modelle-View werden den gleichen Store-State konsumieren, sobald sie gebaut sind. |

### Templates (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Erweiterte Template-Variablen`      | ✅      | 2026-05-13 (Phase-2-Season-4) — `{{LETZTE_SEASON_NAME}}` aus SQLite (Format `Phase X Season Y: <Titel>`, Phase-Label aus `current_phase_file`), `{{TECH_SCHULDEN_RELEVANT}}` und `{{LETZTE_ENTSCHEIDUNGEN}}` als Top-3-Parser auf `docs/TECH_SCHULDEN.md` und `docs/ENTSCHEIDUNGEN.md` (META-Filter via `**Bereich:**`/`**Entscheidung:**`-Label). Plus Template-Body-Extraktion (nur Code-Fence unter `## Vorlage` wird gepastet, Fallback auf volle Datei), Edit-Stift + `+ Neu`-Button im Templates-Modal mit Markdown-Editor-Integration. Neuer IPC `templates:resolve-auto-vars`. |
| `Templates-Fenster non-modal/draggable` | ✅   | 2026-05-13 (Nachzug Season 4) — Backdrop entfernt, Click-Outside-Close entfällt; Editor/Datei-Browser/Terminal bleiben bedienbar. Drag-Griff am Header (Pointer-Events, Bounding gegen Viewport). Buttons im Header lösen kein Drag aus (`closest('button')`-Guard). |

### Docs-Sync (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Docs-Sync-Session`                  | ⛔      | Auto-Prompt für Komprimierung nach `docs/SUMMARIES/` |
| `Kontext-Checkbox-Erweiterung`       | ⛔      | Summary-Inhalt als Präambel statt Pfad-Erinnerung |

### Editor (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Markdown-Preview Side-by-Side`      | ⛔      | Zwei-Panel mit Synced-Scrolling, ergänzt Phase-1-Toggle |

### Build & Distribution (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Auto-Update via electron-updater`   | ⛔      | GitHub-Releases als Update-Quelle |
| `GitHub Actions Build-Pipeline`      | ⛔      | Tag-Push → Windows-Build → Release |

### Right-Pane-Polish (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Datei-Browser-Filter`               | ⛔      | Live-Filter + File-Type-Toggles |
| `Pre-Commit-Sensitive-Warning`       | ⛔      | Pattern-Liste in Settings konfigurierbar, Verfeinerung der hartcodierten Phase-1-Liste |
| `Datei-Browser-Status-Indikatoren`   | ⛔      | M/A/D-Marks via simple-git status-Polling |

### Diff-Viewer (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Multi-Tab-Diff`                     | ⛔      | Working Tree / Staged / Session-spezifisch |

---

## Hinweise zur Pflege

- **Ein Feature pro Zeile.** Zu grobe Zeilen verlieren ihre Aussagekraft.
- **Bereiche** orientieren sich an Sprints/Roadmap.
- **Fertige Features** werden *nicht* aus der Tabelle entfernt — ✅-Markierung bleibt als Referenz, zusammen mit Datum in der Bemerkung.
- Phase-3-Features werden hier ergänzt, sobald Phase 2 abgeschlossen ist (= alle Einträge oben ✅).