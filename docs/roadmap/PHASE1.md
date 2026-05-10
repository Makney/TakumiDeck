# Roadmap Phase 1 – MVP (v0.1)

**Voraussetzung:** keine (Projektstart)

**Ziel:** Eine lauffähige Multi-Session-Workbench, die Claude Code via PTY als Engine nutzt und drumherum die wichtigste Karosserie liefert: Sessions starten/verwalten, Token-Verbrauch sichtbar machen, Templates senden, Diffs anzeigen, Notizen führen.

**Milestone:** Version 0.1

**Strategie:** MVP-MVP zuerst — minimales Skelett (Sprint 1+2) lauffähig in 1-2 Wochen, dann iterativ erweitern. Komplette MVP-Roadmap in ~2-3 Monaten kalendarisch.

---

Features haben keine feste Reihenfolge.
**Feature-Blöcke** kennzeichnen Abhängigkeiten – zuerst das obere Feature, dann das untere.

---

## Bereich: Foundation (Sprint 1)

Grundgerüst der Electron-App.

### Feature: Electron-Skelett ✅

Initiales Setup mit Electron Forge, TypeScript, React.

- Electron Forge mit TypeScript+React-Template initialisieren
- `tsconfig.json`, `package.json` konfigurieren
- Dev-Mode-Start via `npm start` mit separatem AppData (`userData = '...-dev'`)
- Production-Build via `npm run make`
- `.bat`-Datei für Schnellstart im Dev-Mode

### Feature: IPC-Foundation ✅

Typed Inter-Process Communication zwischen Main und Renderer.

- `preload.ts` mit `contextBridge.exposeInMainWorld`
- `shared/ipc-types.ts` für typed Channel-Definitionen
- Result-Type-Pattern für Errors (`{ ok: boolean, data?, error? }`)
- `contextIsolation: true`, `nodeIntegration: false`

### Feature: SQLite-Foundation ✅

Persistenz via better-sqlite3.

- Schema-Initialisierung beim ersten Start
- Tabellen: `projects`, `sessions`, `settings`
- Schema-Versionierung als Stub (für später)

### Feature: Settings-System ✅

Read/Write JSON-Config mit Defaults.

- `settings.json` in AppData-Ordner
- Default-Werte für `model_limits`, `default_model`, `terminal_font_*`, etc.
- IPC-Channels `settings:get` und `settings:set`

---

## Bereich: Sessions (Sprint 2-3)

Multi-Session-Management — der Kern der App.

### Feature: PTY-Spawn ✅

Subprocess-Lifecycle für Claude Code.

- `@homebridge/node-pty-prebuilt-multiarch` integrieren
- `pty:create` mit `claude --model X` und `cwd = projektpfad`
- `pty:write`, `pty:resize`, `pty:kill`
- PTY-Output-Throttling (16ms Buffer-Flush)
- IPC-Events `pty:data` und `pty:exit`

### Feature: xterm.js-Terminal ✅

Terminal-Rendering im Renderer.

- xterm.js mit Canvas-Renderer (kein WebGL)
- Standard-Addons: fit, search, serialize, web-links
- Konfigurierbare Schriftart und -größe aus Settings
- Single-Tab im MVP-MVP, Multi-Tab später

### Feature-Block: Multi-Session

> ⚠️ Diese Features bauen aufeinander auf.

#### Feature 1: Tab-System ✅

- Mehrere Sessions parallel als Tabs
- Tab-Wechsel ohne Session-Verlust
- Tab-Schließen → Session-Status `archived`

#### Feature 2: Session-Lifecycle ✅

**Voraussetzung:** Feature 1

- Status-Transitions: `running` / `completed` / `archived` / `interrupted` / `error`
- App-Schließen → laufende Sessions → `interrupted`
- Session-DB-Updates via IPC

#### Feature 3: Resume-Funktion ✅

**Voraussetzung:** Feature 2

- Resume-Button auf interrupted/completed Sessions
- Spawnt `claude --resume <session-id>` mit gleichem cwd, gleichem Modell
- Status wechselt zurück auf `running`

### Feature: Modell-Auswahl ✅

Beim Session-Start.

- Dropdown im "Neue Session"-Dialog
- Human-readable Labels ("Opus 4.7"), Model-IDs intern
- Default-Hierarchie: Per-Projekt (CLAUDE.md YAML) > Global (settings.json)

### Feature: State-Detection (reduziert) ✅

"Running vs. nicht-running" via JSONL-Event-Frequenz.

- chokidar-Watch auf `~/.claude/projects/**/*.jsonl`
- Last-line-time vergleichen mit `now() - 3s`
- Sidebar-Status-Badge: Grün bei Aktivität, grau sonst

### Feature: Notizen pro Session ✅

Expandable Mehrzeilen-Textarea unter dem Terminal.

- Auto-Save mit 500ms Debounce
- Persistenz in SQLite (`sessions.notes`)
- Plain-Text (kein Markdown im MVP)

---

## Bereich: Workspace (Sprint 4)

Projekt-Erkennung und -Verwaltung.

### Feature: Workspace-Scanner ✅

Erkennt Projekte im konfigurierten Workspace-Ordner.

- Rekursives Scannen, stoppt bei jedem `.git`, max-depth 5
- Marker: `CLAUDE.md` = Pflicht, `.git` = optional
- Initial-Scan beim App-Start + manueller Refresh-Button

### Feature: CLAUDE.md-Parser ✅

Liest YAML-Frontmatter und Markdown-Body.

- YAML-Parser (`js-yaml`) für `workbench:`-Namespace
- Markdown-Parser für Project-Name, Stack, Repo-URL
- Cache in SQLite, Re-Parse bei Refresh
- Read-Only durch die App (User editiert via Markdown-Editor)

### Feature: Project-Sidebar ✅

Übersicht aller bekannten Projekte.

- Liste mit Project-Name, Status (#aktive Sessions)
- Klick wechselt aktives Projekt → Sessions des Projekts werden angezeigt
- "+ Add Project"-Button für externe Pfade

---

## Bereich: Token-Dashboard (Sprint 5)

Live-Tracking von Token-Verbrauch.

### Feature: JSONL-Watcher ✅

chokidar-basiertes File-Watching.

- Watch auf `~/.claude/projects/**/*.jsonl`
- 500ms Debounce
- Tail-Read neuer Zeilen, Parse als NDJSON

### Feature: Token-Aggregation ✅

Aggregiert Verbrauch nach Zeitfenstern.

- Pro Session: `input_tokens + cache_creation + cache_read`
- Globale 5h-Aggregation (Sliding Window)
- Globale Wochen-Aggregation
- Per-Modell-Aufschlüsselung

### Feature: P90-Detection ✅

Schätzt Limits aus historischem Verbrauch.

- Window: letzte 192h (konfigurierbar)
- 90. Perzentil als Limit-Schätzung
- Tooltip "geschätzt aus letzten 8 Tagen"

### Feature: Dashboard-UI ✅

Sichtbare Bars und Detail-Panel.

- Recharts-Bars für 5h-Verbrauch und Wochen-Verbrauch
- Per-aktive-Session: Kontext-Balken (vs. Per-Modell-Limit)
- Farb-Schwellen: gelb 70%, orange 85%, rot 95%
- Detail-Panel auf Klick (Per-Projekt, Per-Modell, Burn-Rate)

---

## Bereich: Templates (Sprint 6)

Schnelles Erstellen von Standard-Prompts mit Variablen.

### Feature: Template-Reader ✅

Liest `.md`-Files aus Projekt + globalem Ordner.

- Pro-Projekt: `<projekt>/docs/templates/*.md` und alte `*_TEMPLATE.md`-Konvention
- Global: `%APPDATA%\TakumiDeck\templates\*.md`
- Beide Quellen werden in der Template-Liste kombiniert

### Feature: Variable-Filling ✅

Erkennt `{{...}}`-Variablen und befüllt sie.

- Regex `\{\{([A-Z_]+)\}\}`
- Auto-Variablen: `PROJEKT_NAME`, `NEXT_SEASON_NR`, `CURRENT_PHASE_FILE`, `DATUM`
- User-Variablen via Formular: `FEATURE_NAME`, `AUFGABE`, `HINWEISE`

### Feature: Template-Send ✅

Schickt fertiges Template ans aktive PTY.

- Bracketed Paste Mode (`\x1b[200~...\x1b[201~`)
- Verhindert zeilenweise Interpretation in Claude Code

---

## Bereich: Season-Tracker (Sprint 6)

Nummerierung und Verlauf von Sessions.

### Feature: Season-Nummerierung ✅

Pro Projekt eigener Zähler.

- `next_season_number` in SQLite (`projects`-Tabelle)
- Beim Session-Erstellen: vergeben + inkrementieren (Hybrid A+B)
- Bug/Review/Docs-Sync: kein season_number, nur Type-Badge
- Lücken in der Nummerierung akzeptiert (bei Abbruch)

### Feature: Verlauf-Panel ✅

Liste aller Sessions des aktiven Projekts.

- Felder: Season-Nr/Typ, Name, Status, Modell, Datum, Notizen-Count
- Klick auf Session → Detail-Panel (Notizen, Token-Verbrauch, Resume-Button)
- Filter: Typ, Status, Volltext-Suche im Namen

---

## Bereich: Editor + Git (Sprint 7)

Markdown-Editor und Diff-Viewer.

### Feature: Markdown-Editor ✅

CodeMirror 6 für `.md`-Files des aktiven Projekts.

- `@codemirror/lang-markdown` + `@codemirror/lang-yaml`
- Schnellzugriff-Liste (`workbench.on_demand_files` aus CLAUDE.md + Standard-Files)
- Fuzzy-Search-Fallback für seltene Files
- Manueller Save (Ctrl+S, "unsaved changes"-Indikator)

### Feature: YAML-Validierung ✅

Inline-Validierung für CLAUDE.md.

- YAML-Parse beim Tippen, Fehler-Marker im Editor
- Keine Auto-Fix, nur Anzeige

### Feature: Markdown-Preview-Toggle ✅

Editor ↔ Preview umschaltbar.

- `react-markdown` für Rendering
- Toggle-Button in der Editor-Toolbar
- Default: Editor-Mode

### Feature: Diff-Viewer ✅

Working Tree Diff via simple-git.

- `@codemirror/merge`-Extension für Side-by-Side-Diff
- Read-only im MVP

### Feature: Pre-Commit-Panel ✅

Vor dem Commit-Trigger.

- Branch-Anzeige
- Liste geänderter Files
- Sensitive-File-Warnung (`.env`, `secrets.*`, `*.key`)
- Button "Send 'commit' to active session" (sendet Trigger-Phrase ans PTY)

---

## Bereich: App-Chrome (Sprint 7-8)

Header-Bar und Globale UI-Komponenten.

### Feature: Header-Bar ✅

Globale Header-Leiste oben in der App.

- Logo + App-Name + Version (z.B. "TakumiDeck · v0.1.0-dev")
- Aktives Projekt + Branch + Sessions-Counter
- Status-Hinweis rechts ("Terminal · P90 192h")
- Window-Controls (minimieren, maximieren, schließen)

### Feature: Action-Bar unter Eingabezeile ✅

Pill-Style-Buttons mit Schnellaktionen.

- Modell-Picker-Button (zeigt aktuelles Modell, Klick öffnet Picker)
- Templates-Button (öffnet Template-Modal)
- commit-Button (sendet Trigger-Phrase an aktive Session)
- ctx-Mini-Bar (zeigt aktuellen Kontext-Verbrauch)
- läuft/wartet-Status-Badge rechts

### Feature: Tastatur-Hints ✅

Hilfreiche Shortcuts unter der Eingabezeile.

- "Enter senden · Ctrl+T Templates · Ctrl+K Modell wechseln"
- Statisch dargestellt, lädt zur Erkundung ein
- Erweiterte Shortcut-Konfiguration in Phase 3

---

## Bereich: Right-Pane (Sprint 7)

Permanent sichtbarer Right-Pane mit Diff, Markdown-Editor und Notizen.

### Feature: Right-Pane-Layout ✅

Drei vertikale Sektionen mit Tabs.

- Top-Section: Tab-Bar mit Diff + Datei-Tabs (CLAUDE.md, CHANGELOG.md, README.md)
- Mid-Section: Datei-Browser des aktiven Projekts
- Notizen-Section: Plain-Text-Textarea mit Auto-Save (siehe Sessions-Bereich)
- Plannutzung-Section: Konfigurierbare Limit-Bars (siehe Token-Dashboard)

### Feature: Datei-Tabs ✅

Mehrere Markdown-Dateien parallel offen.

- Tab-Bar mit Datei-Icons (md-Symbol)
- Aktiver Tab mit Highlight
- Tab schließen via × pro Tab
- "Diff" als spezieller Tab (immer ganz links)

### Feature: Datei-Browser ✅

Liste der Files im aktiven Projekt.

- Hierarchische Anzeige der Ordnerstruktur
- Klick auf File → öffnet in neuem Datei-Tab
- Filter: nur `.md`-Files standardmäßig (konfigurierbar)
- Visuelle Indikatoren für editierte (M) Files

---

## Bereich: Stats-Section Skeleton (Sprint 5)

Platz für die spätere Stats/Heatmap-Erweiterung — im MVP nur Platzhalter.

### Feature: Übersicht/Modelle-Toggle (Skeleton) ✅

Toggle-Buttons unter dem Terminal-Bereich.

- Buttons "Übersicht" und "Modelle" sichtbar
- Im MVP: nur "Übersicht"-View aktiv mit minimalem Inhalt (3-4 Token-Stats: aktuelle Session-Tokens, Tokens heute, Tokens diese Woche)
- "Modelle"-View zeigt "In Phase 2 verfügbar"-Hinweis
- Volle Heatmap und Stats-Cards in Phase 2

---

## Bereich: Polish (Sprint 8)

Abschluss-Schliff vor MVP-Release.

### Feature: Settings-Dialog ✅

Erreichbar via Menü-Button.

- Tab-Kategorien: Allgemein, Workspace, Modelle, Token-Tracking, Terminal, About
- Mix aus UI-Forms und "Edit Raw JSON" für komplexe Settings
- "Open Data Folder"-Button

### Feature: Error-Handling ✅

Robuste Fehler-Behandlung in Edge-Cases.

- Permission-denied beim Filesystem-Zugriff
- Korrupte JSONL-Dateien
- Claude-Code nicht installiert
- SQLite-Locking-Konflikte

### Feature: Dark-Theme ✅

Einheitliches dunkles Theme.

- xterm.js, CodeMirror, App-Chrome harmonisch
- Keine helle Variante im MVP (kann in Phase 2)

### Feature: Build + Distribution ✅

Production-Builds via Electron Forge.

- `npm run make` produziert Windows-Installer
- Dokumentierte Build-Anleitung in DEV_SETUP.md
- Manuelle GitHub-Releases (kein Code-Signing, kein Auto-Update)

---

## Bereich: Pre-Release-QA (Sprint 9)

Letzter Schliff vor dem MVP-Release. Sprint 8 hat den Code fertig — Sprint 9
prüft die Qualität gegen die Design-Vorlage und räumt Code-Schulden auf,
die bei den schnellen Sprint-Iterationen liegen geblieben sind.

### Feature: UI-Vergleich gegen Design-Vorlage ⛔

Systematischer Pass durch jede sichtbare Komponente und Abgleich gegen
die Design-Handoff-Spec in `docs/design/claude-export/`.

- Komponenten-Inventar erstellen (TitleBar, LeftSidebar, TabContainer, ActionBar,
  HistoryPane, EditorPane, RightStack, FilesPanel, NotesPanel, StatsPane,
  PlanPane, alle Modale)
- Pro Komponente: Screenshot der laufenden App vs. `claude-export/prototype.html`
  bzw. `app.jsx` + `styles.css` + `components.jsx` als Referenz
- Abweichungen kategorisieren: kritisch (Layout/Lesbarkeit), kosmetisch
  (Spacing/Color-Drift), Spec-Erweiterung (Feature in Vorlage, das wir
  bewusst weggelassen haben)
- Findings-Liste mit Priorisierung; kritische Befunde direkt fixen,
  kosmetische ggf. Phase 2 verschieben
- Hover-Pattern, Status-Indikatoren, Modal-Backdrops, Pill-Styles, Status-Dots
  systematisch durchgehen (Architektur 6.0.3 / 6.0.4)
- Kanji-/Display-Font-Konsistenz prüfen (`var(--td-display)` vs.
  `var(--td-mono)` in den richtigen Slots)

### Feature: Code-Review + Debugging ⛔

Fokussierter Review-Pass über den Sprint-1- bis Sprint-8-Code, plus
gezielte Debugging-Session für UI- und IPC-Pfade, die in den Tests
nicht abgedeckt sind.

- Inventar der UI-Pfade, die nicht in den 396 Vitest-Tests laufen
  (xterm-Lifecycle, CodeMirror-Mount/Unmount, Modal-Focus-Trap,
  Drag/Drop, Window-Controls)
- Manueller Click-Through für die in `docs/CHANGELOG.md` (Sprint 8)
  aufgelisteten UI-Tests, plus die in den Season-Logs „Für nächste
  Season"-Hinweise
- Konsole-Lärm-Audit: alle `console.warn` / `console.error` aus dem
  laufenden Dev-Mode katalogisieren, harmlose von echten Issues trennen
- TECH_SCHULDEN-Review: jeden offenen Eintrag noch einmal gegen den
  aktuellen Code abgleichen, ggf. Status aktualisieren oder als
  „in Production-Build kein Issue" markieren
- Performance-Sanity: Memory-Footprint nach 1 h Multi-Tab-Lauf,
  PTY-Output-Throttling-Verhalten bei großen Outputs (z.B.
  `find / -type f`-Test), Token-Dashboard-Update-Frequenz
- xterm-StrictMode-Race-Workaround prüfen (TECH_SCHULDEN-Eintrag) —
  ist er in Production-Builds wirklich weg, wie der Eintrag verspricht?
- Dependency-Audit: `npm audit` durchgehen, kritische CVEs adressieren
  (aktuell 34 Vulnerabilities laut letztem `npm install`-Output)

---

## Allgemeine Bugfixes & Performance

Laufend, keine eigene Season nötig. Werden direkt behoben und im [CHANGELOG.md](../CHANGELOG.md) erfasst.

---

## Hinweise zum Phase-1-Scope

- **Worktrees** → Phase 5+ (linearer Workflow reicht)
- **WebGL-Renderer** → Phase 5+ (Canvas reicht für 2-5 Tabs)
- **Brainstorming-Panel** → Phase 5+ (Claude Desktop reicht aktuell)
- **OpenAI Codex als zweite Engine** → Phase 5+
- **Volle State-Detection mit TUI-Pattern** → Phase 2
- **Trigger-Phrasen-Schnellbuttons** → Phase 2
- **Docs-Sync-Session** → Phase 2 (wenn Token-Limits zum Schmerz werden)
- **Multiple Workspace-Ordner** → Phase 5+