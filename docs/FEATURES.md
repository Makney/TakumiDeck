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
| `Season-Nummerierung`           | ✅      | 2026-05-10 — atomar im Main-Handler via better-sqlite3-Transaction (Variante B); nur für `feature`-Sessions, Lücken bei Spawn-Fehler akzeptiert; Vorschau im NewSessionModal |
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

### Terminal (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Screenshot-Drag-and-Drop`           | ✅      | 2026-05-12 (Phase-2-Season-2) — Drag-Drop von Image-Files ins Terminal-Pane pastet den absoluten Pfad (Quoting bei Whitespace); Direkt-Bilder ohne Disk-Pfad und Clipboard-Images (Ctrl+Shift+V nach Win+Shift+S) werden nach `<userData>/screenshots/` gespeichert. MIME-Whitelist PNG/JPEG/GIF/WebP, neuer IPC `fs:save-screenshot`, Preload-Bridge `webUtils.getPathForFile`. Nicht aus PHASE2.md — User-Trigger. |

### Projekt-Verwaltung (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Projekt entfernen`                  | ⛔      | Sidebar-Action mit Confirmation; neuer IPC `project:remove`, Sessions werden auf Default-Bucket umgehängt statt FK-Cascade |
| `First-Start-Workspace-Wizard`       | ⛔      | Welcome-Screen bei fehlender `settings.json`; expliziter Workspace-Pick statt stillem Default-Scan von `<home>/Projekte` |

### Token-Dashboard (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `20%-Kontext-Soft-Warning`           | ⛔      | Konfigurierbarer Schwellwert, Settings-Toggle |
| `Modell-Filter im Verlauf-Panel`     | ⛔      | Ergänzt Phase-1-Filter um `current_model` |

### Stats & Heatmap (Phase 2)

| Feature                              | Status | Bemerkung |
| ------------------------------------ | ------ | --------- |
| `Stats-Cards`                        | ⛔      | Sitzungen/Nachrichten/Tokens/Aktive Tage/Streaks/Spitzenstunde/Lieblingsmodell |
| `Aktivitäts-Heatmap`                 | ⛔      | GitHub-Style 30/52-Wochen-Calendar, CSS-Grid mit color-mix |
| `Modelle-View`                       | ⛔      | Bar-Chart + Tabelle pro Modell, Phase-1-Skeleton ausbauen |
| `Easter-Egg-Vergleiche`              | ⛔      | „~31× LotR"-Token-Vergleiche, konfigurierbare Werke |
| `30d/7d-Filter`                      | ⛔      | Globaler Zeit-Toggle für Stats-Section |

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
- Phase-2- und Phase-3-Features werden hier ergänzt, sobald Phase 1 abgeschlossen ist (= alle Einträge oben ✅).