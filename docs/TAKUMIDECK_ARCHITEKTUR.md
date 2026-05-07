# TakumiDeck — Architektur-Referenz

**Stand:** 2026-05-07
**Status:** Architektur abgeschlossen, ready für Sprint 1
**Name:** TakumiDeck — "Takumi" (匠 = Meisterhandwerker) + "Deck" (Kommandobrücke)

---

## 1. Projekt-Identität

**TakumiDeck** ist ein persönliches Multi-Session-Management-Tool für Claude Code. Wraps Claude Code als Engine und ergänzt sie um produktive Karosserie: Multi-Session-Tabs, Token-Dashboard, Templates, Season-Tracker, Diff-Viewer, Markdown-Editor, Notizen.

Der Name reflektiert die Funktion: Als **Takumi** (Meisterhandwerker) sitzt der Nutzer auf dem **Deck** (Kommandobrücke) und dirigiert die parallel laufenden Claude-Sessions wie ein Steuermann seine Crew.

- **Nutzungsmodell:** Privat, GitHub-privat, eventuell Freunden zur Verfügung gestellt
- **Aktuelle Projekte:** 2 (TanaLib, ZenValuation), perspektivisch 1–3
- **Plattform:** Windows 11 primär
- **Lebenszyklus:** Daily-Driver, kontinuierliche Iteration

### Naming-Konventionen

| Kontext | Schreibweise |
|---|---|
| GitHub Repo | `TakumiDeck` |
| App-Name in UI | `TakumiDeck` |
| package.json `name` | `takumi-deck` |
| AppData-Ordner | `TakumiDeck` |
| App-Bundle-ID (optional) | `de.makney.takumideck` |

---

## 2. Technischer Stack (final)

| Komponente | Wahl |
|---|---|
| Runtime | Electron + TypeScript |
| UI | React |
| State | Zustand |
| Storage | better-sqlite3 |
| PTY | @homebridge/node-pty-prebuilt-multiarch |
| Terminal | @xterm/xterm + Addons (fit, search, serialize, web-links) — **Canvas-Renderer**, kein WebGL |
| File-Watching | chokidar |
| Git | simple-git |
| Charts | Recharts |
| Editor | CodeMirror 6 + lang-markdown + lang-yaml + merge + markdown-preview |
| Build | Electron Forge |

**Bewusste Auslassungen:**
- Kein Monaco (CodeMirror reicht für Markdown/Diff)
- Kein WebGL-Renderer (Canvas reicht für 2-5 Tabs realistisch)
- Kein electron-updater im MVP
- Kein Code-Signing
- Kein tRPC (typed IPC reicht)

---

## 3. Prozess-Architektur

### Electron-Standard (Hardening aktiv)

- **Main-Prozess:** Node.js, Vollzugriff Filesystem/PTY/SQLite
- **Renderer-Prozess:** Chromium mit `contextIsolation: true`, `nodeIntegration: false`
- **Preload:** Whitelist-API via `contextBridge.exposeInMainWorld`
- **IPC:** Typed via shared `ipc-types.ts`, Result-Type-Pattern für Errors

### IPC-Channel-Liste (~30 Channels)

**PTY/Session-Management:**
- `pty:create`, `pty:write`, `pty:resize`, `pty:kill`, `pty:resume`
- `pty:data` (Main → Renderer), `pty:exit` (Main → Renderer)

**Project-Management:**
- `project:scan-workspace`, `project:add`, `project:get-list`, `project:read-claude-md`

**Session-Database:**
- `session:create`, `session:update-status`, `session:update-notes`, `session:archive`, `session:get-history`

**Token-Tracking:**
- `tokens:get-current-usage`, `tokens:get-session-context`, `tokens:on-update` (Subscription)

**Git-Integration:**
- `git:get-diff`, `git:get-status`

**File-System:**
- `fs:read-file`, `fs:write-file`, `fs:list-templates`

**Settings:**
- `settings:get`, `settings:set`

**Misc:**
- `app:open-data-folder`, `app:get-version`

### PTY-Output-Throttling

- Buffer im Main-Prozess pro Session
- Flush-Interval: 16ms (60fps)
- Verhindert IPC-Overload bei Bursts

---

## 4. Persistenz

### AppData-Struktur

```
%APPDATA%\TakumiDeck\                (oder TakumiDeck-dev im Dev-Mode)
├── data.sqlite
├── settings.json
├── templates\                      (globale Templates, projekt-übergreifend)
│   ├── 00_brainstorm.md
│   └── ...
├── logs\
└── cache\
```

Zugriff via Settings-Dialog "Open Data Folder"-Button.

### SQLite-Schema

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  added_manually BOOLEAN DEFAULT 0,
  has_git BOOLEAN DEFAULT 0,
  next_season_number INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                  -- UUID, matched zu Claude Codes session-uuid
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                   -- 'feature' | 'bug' | 'review' | 'docs-sync'
  season_number INTEGER,                -- NULL für non-feature types
  status TEXT NOT NULL,                 -- 'running' | 'waiting' | 'idle' | 'completed' | 'archived' | 'interrupted' | 'error'
  current_model TEXT,                   -- Aus JSONL geparst
  worktree_path TEXT,                   -- NULL im MVP, später für Worktrees
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                   -- JSON
);
```

**Bewusst NICHT in SQLite:**
- Templates (= .md-Dateien im Filesystem)
- Token-Daten (= JSONL-Dateien in `~/.claude/projects/`)

### Settings-JSON (Beispiel)

```json
{
  "workspace_path": "C:\\Users\\Sebastian\\Projects",
  "default_model": "claude-sonnet-4-6",
  "model_limits": {
    "claude-opus-4-7": 1000000,
    "claude-opus-4-6": 1000000,
    "claude-sonnet-4-6": 1000000,
    "claude-sonnet-4-5": 200000,
    "claude-haiku-4-5": 200000
  },
  "default_limit": 200000,
  "terminal_font_family": "MesloLGS NF, Cascadia Code",
  "terminal_font_size": 14,
  "p90_window_hours": 192,
  "token_warning_thresholds": { "yellow": 70, "orange": 85, "red": 95 },
  "theme": "dark"
}
```

---

## 5. CLAUDE.md-Konvention (geändert ggü. Vorlage)

### YAML-Frontmatter (NEU — ersetzt `## On-Demand Files`-Section)

```yaml
---
workbench:
  project_name: TakumiDeck
  default_model: claude-sonnet-4-6
  current_phase_file: docs/roadmap/PHASE1.md
  trigger_phrases:
    docs_update: "ist korrekt umgesetzt"
    commit: "commit"
  on_demand_files:
    - path: docs/CODING_RULES.md
      trigger: "Read for every implementation or refactoring task"
      auto_inject: false
    - path: docs/roadmap/PHASE1.md
      trigger: "Read for Phase 1 features only"
      auto_inject: false
---

# TakumiDeck – Agent Context
[Markdown-Body wie gehabt, aber OHNE `## On-Demand Files`-Section]
```

### Vorlagen-Repo-Updates (notwendig)

1. YAML-Frontmatter in CLAUDE.md mit `workbench:`-Section
2. `docs/MARKDOWN_RULES.md` Punkt 11 anpassen: "No YAML frontmatter, **except in CLAUDE.md** for tool configuration"
3. `## On-Demand Files`-Section aus CLAUDE.md entfernen (wandert ins YAML)
4. `## Current Status`-Section schlanker (nur auto-geladene Doku)
5. Templates: `{{...}}`-Variablen-Syntax statt `[NUMMER]` etc.

### Read-Only durch App

App schreibt nicht in CLAUDE.md. Editieren via Markdown-Editor der App (CodeMirror).

---

## 6. Komponenten-Architektur

### 6.1 Workspace-Manager

- **Erkennung:** Rekursives Scannen, stoppt bei jedem `.git`, max-depth 5
- **Marker:** `CLAUDE.md` = Pflicht, `.git` = optional (aktiviert Diff/Commit)
- **Zusatz:** "+ Add Project"-Button für externe Pfade
- **Refresh:** Initial beim App-Start + manueller Refresh-Button (kein Live-Watcher)

### 6.2 Session-Manager

- **PTY-Spawn:** `claude --model <id>`, cwd = Projektpfad
- **Modell-Auswahl:** Im Erstellen-Dialog, human-readable Labels ("Opus 4.7"), Model-IDs intern
- **Default-Modell-Hierarchie:** Per-Projekt (CLAUDE.md YAML) > Global (settings.json)
- **Lifecycle:**
  - `claude`-Prozess endet → Status `completed`
  - Manueller "Archiv" → Status `archived`
  - App schließt → laufende Sessions → Status `interrupted`
  - Manueller "Resume" → spawnt `claude --resume <session-id>`
- **Modell-Tracking:** Aus JSONL-Field `message.model` (auto-detected bei `/model`-Wechsel)
- **State-Detection (MVP):** "running vs. not-running" via JSONL-Event-Frequenz (last line <3s ago)
- **Notizen:** Expandable Mehrzeilen-Textarea, Auto-Save mit 500ms Debounce, Plain-Text

### 6.3 Terminal-UI

- **xterm.js mit Canvas-Renderer** für alle Tabs
- **Tab-System:** Mehrere Sessions parallel, Tab-Wechsel ohne Session-Verlust
- **Sidebar-Status-Badge:** Grüner Punkt bei Aktivität, grau sonst, orange bei `interrupted`
- **Notizfeld:** Unter dem Terminal, expandable

### 6.4 Token-Dashboard

- **Immer sichtbar:**
  - 5h-Verbrauch (mit P90-Schätzung als Limit, "geschätzt"-Tooltip)
  - Wochen-Verbrauch (analog)
  - Per-aktive-Session: Kontext-Balken (`input + cache_creation + cache_read` vs. Per-Modell-Limit)
- **Farb-Schwellen:** gelb 70%, orange 85%, rot 95%
- **Auf Klick (Detail-Panel):**
  - Per-Projekt-Verbrauch (24h, 7 Tage, 30 Tage)
  - Per-Modell-Aufschlüsselung
  - Burn-Rate-Diagramm (Recharts)
- **Live-Update:** chokidar mit 500ms-Debounce, max 2 UI-Updates/Sek
- **Limit-Detection:** P90 über letzte 192h (konfigurierbar)
- **Per-Modell-Limits:** Aus Settings-JSON, editierbar

### 6.5 Template-Manager

- **Templates als .md-Dateien:**
  - Pro-Projekt: `<projekt>/docs/*_TEMPLATE.md`
  - Global: `%APPDATA%\TakumiDeck\templates\*.md`
- **Variablen-Syntax:** `{{VARIABLE_NAME}}` (Regex `\{\{([A-Z_]+)\}\}`)
- **Auto-Variablen (MVP):**
  - `{{PROJEKT_NAME}}` — aus CLAUDE.md
  - `{{NEXT_SEASON_NR}}` — aus SQLite
  - `{{CURRENT_PHASE_FILE}}` — aus CLAUDE.md
  - `{{DATUM}}` — heute (`YYYY-MM-DD`)
- **User-Variablen (MVP):**
  - `{{FEATURE_NAME}}` — Pflicht
  - `{{AUFGABE}}` — Pflicht
  - `{{HINWEISE}}` — Optional
- **Send-Mechanismus:** Bracketed Paste Mode (`\x1b[200~...\x1b[201~`)
- **Kein In-App-Template-Editor** — Editieren via Markdown-Editor

### 6.6 Season-Tracker

- **Nummerierung:** Hybrid A+B
  - Beim Session-Erstellen: `season_number = next_season_number`, increment
  - Lücken bei Abbruch akzeptiert
  - Bug/Review/Docs-Sync: kein season_number, nur Type-Badge
- **Verlauf-Panel:** Liste aller Sessions des aktiven Projekts
  - Felder: Season-Nummer/Typ, Name, Status, Modell, Datum, Notizen-Count
  - Klick → Detail-Panel mit Notizen, Token-Verbrauch, Resume-Button
- **Filter (MVP):** Typ, Status, Volltext-Suche
- **Filter (Phase 2):** Modell, Modell-Wechsel-Detection
- **Keine Verlinkung zu CHANGELOG/SEASON_LOG.md im MVP**

### 6.7 Git-Integration

- **Diff-Viewer:** Working Tree Diff via simple-git, gerendert mit CodeMirror 6 + @codemirror/merge
- **Pre-Commit-Panel:**
  - Branch-Anzeige
  - Geänderte Files (Liste)
  - Sensitive-File-Warnung (`.env`, `secrets.*`, etc.)
  - Button "Send 'commit' to active session"
- **Kein eigener Commit durch die App** — Commit läuft über Claude Code (Trigger-Phrase aus CLAUDE.md)
- **Kein Pull/Fetch/Branch-Switch im MVP**

### 6.8 Markdown-Editor

- **CodeMirror 6** mit `@codemirror/lang-markdown`, `@codemirror/lang-yaml`
- **Schnellzugriff-Liste:**
  - `workbench.on_demand_files` aus CLAUDE.md YAML
  - Plus immer: CLAUDE.md, CHANGELOG, FEATURES, ROADMAP, ENTSCHEIDUNGEN
  - Indikator für editierte/ungesicherte Files
- **Fuzzy-Search-Fallback** für seltene Files
- **Manueller Save** (Ctrl+S, "unsaved changes"-Indikator)
- **Inline-YAML-Validierung** für CLAUDE.md
- **Preview-Toggle** (Editor ↔ Preview umschaltbar) — `react-markdown` für Rendering

### 6.9 Settings-Dialog

- **Erreichbar via Menü-Button** (nicht Sidebar)
- **Tab-Kategorien:**
  - Allgemein (Theme, Workspace-Pfad, "Open Data Folder")
  - Workspace (Pfad, "+ Add Project"-Liste)
  - Modelle (Liste mit Limits, "Edit Raw JSON")
  - Token-Tracking (P90-Window, Warning-Schwellen)
  - Terminal (Font-Family, Font-Size)
  - About (Version, Repo-Link)
- **Mix aus UI und Raw-JSON:** Häufige Settings via Form, komplexe via "Edit Raw JSON"

---

## 7. App-Lifecycle

### Beim App-Schließen
- Laufende Sessions: Status → `interrupted`
- Subprocess wird beendet (SIGTERM)
- JSONL-Dateien bleiben in `~/.claude/projects/` erhalten
- SQLite-Commits sicher abgeschlossen

### Beim App-Öffnen
- Initial-Workspace-Scan
- Interrupted Sessions sichtbar mit orangem Badge
- Manuelles "Resume" via Button (kein Auto-Resume)

### Build-Strategie
- **Dev:** `npm start` mit separatem AppData (`userData = '...-dev'`), eigenes `.bat` für Schnellstart
- **Production:** `npm run make` via Electron Forge → Installer
- **Distribution:** Manuelle GitHub Releases ohne Code-Signing
- **GitHub Actions:** Erst wenn aktiv geteilt

---

## 8. Phasen-Plan

### Phase 1 (MVP)

Komplette Liste — siehe Kapitel 6 oben. Kernfeatures:
- Workspace-Manager + Projekt-Erkennung
- Multi-Session-Manager mit Lifecycle
- Token-Dashboard (5h + Wochen + Per-Session)
- Template-Manager (Read .md, Variablen, Bracketed Paste)
- Season-Tracker
- Diff-Viewer + Pre-Commit-Panel
- Markdown-Editor mit Preview-Toggle
- Settings-Dialog
- Build via Electron Forge

### Phase 2 (nach MVP-Stabilisierung)

| Feature | Trigger |
|---|---|
| Volle State-Detection (waiting/idle, Permission-Prompts) | Wenn empirisch wichtig |
| Trigger-Phrasen-Schnellbuttons | Komfort-Wunsch |
| Docs-Sync-Session | Wenn Token-Limits zum Schmerz werden |
| Erweiterte Template-Variablen | Bei Bedarf |
| 20%-Kontext-Soft-Warning | Wenn Beobachtung sich bestätigt |
| Auto-Update via electron-updater | Bei Verteilung an Freunde |
| GitHub Actions Build | Bei Verteilung |
| Markdown-Preview Side-by-Side | Falls Toggle nicht reicht |
| Modell-Filter im Verlauf-Panel | Wenn relevant |
| Diff-Viewer Multi-Tab (Working/Staged/Session) | Wenn relevant |

### Phase 5+ (langfristig)

| Feature | Trigger |
|---|---|
| Mehrere Workspace-Ordner | Wenn relevant |
| Brainstorming-Panel (eventuell Opcode-Pattern) | Wenn Schmerzpunkt mit Claude Desktop |
| OpenAI Codex als zweite Engine | Wenn relevant |
| Semantische Chunk-Suche (FTS5) | Wenn Doku massiv wächst |
| Worktree-Support | Wenn parallele Branches gebraucht werden |
| Pull/Fetch/Branch-Switch | Bei Co-Dev |

---

## 9. Build-Reihenfolge (Sprints)

**Strategie:** MVP-MVP zuerst (Skeleton in 1-2 Wochen), dann iterativ erweitern.

### Sprint 1: Skelett
1. Electron Forge + TypeScript + React Setup
2. Preload + IPC + contextBridge (typed)
3. SQLite-Setup mit better-sqlite3
4. Settings-System (read/write JSON)

### Sprint 2: Sessions
5. PTY-Spawn (`claude` Subprocess, hartcodierter Pfad)
6. xterm.js-Integration (single Tab)
7. PTY-Throttling (16ms Buffer)
8. Session-DB-Schema + Create/Update

### Sprint 3: Multi-Session
9. Tab-System mit mehreren Sessions
10. Session-Lifecycle (Status-Transitions)
11. Resume-Funktion
12. Notizen-Feld

### Sprint 4: Workspace
13. Workspace-Scanner (rekursiv, stoppt bei .git, max-depth 5)
14. CLAUDE.md-Parser (YAML-Frontmatter + Markdown-Body)
15. Project-Sidebar
16. Per-Projekt-Filtering der Sessions

### Sprint 5: Token-Dashboard
17. JSONL-Watcher (chokidar mit Debounce)
18. Token-Aggregation (input + cache_creation + cache_read)
19. P90-Detection über letzte 192h
20. Dashboard-UI (Recharts) mit Bars + Detail-Panel

### Sprint 6: Templates + Season-Tracker
21. Template-File-Parser (Regex `\{\{...\}\}`)
22. Variable-Filling-Logik
23. Bracketed-Paste-Send via PTY
24. Season-Tracker + Verlauf-Panel

### Sprint 7: Editor + Git
25. CodeMirror Markdown-Editor + YAML-Validation
26. Markdown-Preview-Toggle (react-markdown)
27. Diff-Viewer (CodeMirror Merge)
28. Pre-Commit-Panel + Send-Commit-Button

### Sprint 8: Polish
29. Settings-Dialog komplett mit Tabs
30. Error-Handling, Edge-Cases (Permission-denied, korrupte JSONL, etc.)
31. Dark-Theme einheitlich
32. Build + Distribution

**Kalendarische Schätzung:** ~2-3 Monate (nebenher mit Claude Code als Helfer)
**Vollzeit-Equivalent:** ~25-35 Tage

---

## 10. Schlüssel-Designprinzipien

1. **Persönliches Tool, kein Produkt** — keine Settings-UI für Edge-Cases, hardcoded Konventionen wo sinnvoll
2. **MVP-Disziplin** — Worktrees, Brainstorming, Codex, Multi-Workspace alle in Phase 5+
3. **Single-Source-of-Truth** — CLAUDE.md ist Master-Config (App + Claude Code), JSONL ist Token-Wahrheit
4. **JSONL ist King** — kein SQLite-Cache für Tokens, vermeidet Sync-Probleme
5. **Robustheit > Convenience** — JSONL-Event-Frequenz statt fragiles TUI-Pattern-Matching
6. **Files > App-State** — Templates sind .md-Files, App rendert nur, Git-trackbar
7. **Sessions ≠ App-Lifecycle** — App ist Manager, kein Babysitter, manuelles Resume
8. **Forward-Compatibility** — Worktree-Schema vorhanden, Codex-Engine austauschbar designet
9. **20%-Kontext-Beobachtung als Designprinzip** — App hilft schlank zu starten, nicht primär komprimieren
10. **Claude Code committet** — App umgeht den Workflow nicht, Commit via Trigger-Phrase

---

## 11. Identifizierte Reibungen im bestehenden Vorlagen-System (alle adressiert)

1. **On-Demand-Files-Liste war 3x da** → Single Source in YAML-Frontmatter
2. **Trigger-Phrasen waren in Prosa** → Strukturiert in YAML
3. **`next_season_number` in CLAUDE.md** → wandert in SQLite (kein Diff-Lärm)
4. **Vorlagen-Tokens vs. App-Template-Variablen** → Akzeptable Doppelnutzung der `{{...}}`-Syntax
5. **`templates/SEASON_PROMPT.md` als File vs. SQLite** → File als Source-of-Truth, kein Import

---

## 12. Was bewusst NICHT gebaut wird

- **Brainstorming via API-Key** — Alles übers Abo, keine separate Cost-Tracking-Logik
- **Auto-Resume von Sessions** — Zu viele Edge-Cases, manuelles Resume reicht
- **Worktrees im MVP** — Workflow ist seasonbasiert linear, kein Bedarf
- **Stream-JSON-Mode** — wäre Re-Implementation der Claude-Code-UI, riesiger Pflegeaufwand
- **WebGL-Renderer** — Canvas reicht für 2-5 Tabs realistisch
- **Code-Signing** — Privates Tool, einmalige SmartScreen-Warnung okay
- **electron-updater** — Manuelle Builds reichen
- **Eigener Commit-Workflow durch die App** — Claude Code committet, App sendet nur Trigger
- **Pull/Fetch/Branch-Switch** — Solo-Entwickler, irrelevant
- **Markdown-Preview Side-by-Side** — Toggle reicht im MVP

---

## 13. Offene Fragen für Sprint 1 (Implementations-Detail-Level)

Die folgenden Fragen werden während Sprint 1 entschieden, sind keine Architektur-Fragen mehr:

- React State-Library Pattern (Zustand-Slices vs. Single-Store)
- IPC-Channel-Naming-Convention (Doppelpunkt vs. Punkt)
- SQLite-Migration-Strategie (manuell vs. Schema-Versionierung)
- Tailwind vs. CSS-Modules vs. Styled-Components
- Test-Setup (Vitest? Wann anfangen?)
- Logging-Library (electron-log? winston? console.log?)

---

## Anhang: Antwort-Log der Grill-Session

Vollständige Frage-Antwort-Historie ist in der separaten Datei `CLAUDE_WORKBENCH_GRILL_STAND.md` (Zwischenstand nach Frage 14).
