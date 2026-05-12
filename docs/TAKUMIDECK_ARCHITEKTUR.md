# TakumiDeck — Architektur-Referenz

**Stand:** 2026-05-12
**Status:** Architektur abgeschlossen, MVP v0.1 ready (Phase 1 komplett)
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

| Komponente | Wahl | Hinweise |
|---|---|---|
| Runtime | Electron + TypeScript | Strict mode aktiviert |
| UI | React 18 + Zustand | 4 Domain-Stores: useSessionStore, useProjectStore, useUsageStore, useUiStore |
| Storage | better-sqlite3 | Im Main-Prozess, WAL-Mode, Migrations als nummerierte SQL-Dateien |
| Terminal | xterm.js (Canvas-Renderer) + node-pty | `@xterm/addon-canvas`, `@xterm/addon-fit` |
| Editor | CodeMirror 6 | `@codemirror/lang-markdown`, `@codemirror/merge` für Diff, `oneDark` als Basis |
| Git | simple-git | Im Main-Prozess, Worktree-Operationen erst Phase 5+ |
| Charts | Recharts | Burn-Rate, Modell-Verteilung. Heatmap NICHT in Recharts (CSS-Grid mit color-mix) |
| Build | Electron Forge + Vite | Plugin: `@electron-forge/plugin-vite` für Renderer + Main |
| IPC | TypeScript-typed + zod (optional Runtime-Validation) | Result-Type-Pattern für Errors |

**Bewusste Auslassungen:**
- Kein Monaco (CodeMirror reicht für Markdown/Diff)
- Kein WebGL-Renderer (Canvas reicht für 2-5 Tabs realistisch)
- Kein electron-updater im MVP
- Kein Code-Signing
- Kein tRPC (typed IPC reicht)
- Kein Tailwind/Styled Components (CSS Modules + Tokens.css)
- Worktrees erst Phase 5+

---

## 3. Prozess-Architektur

### Electron-Standard (Hardening aktiv)

- **Main-Prozess:** Node.js, Vollzugriff Filesystem/PTY/SQLite
- **Renderer-Prozess:** Chromium mit `contextIsolation: true`, `nodeIntegration: false`
- **Preload:** Whitelist-API via `contextBridge.exposeInMainWorld`
- **IPC:** Typed via shared `ipc-types.ts`, Result-Type-Pattern für Errors

### IPC-Channel-Schema

Channels sind in **shared/ipc-channels.ts** als `const Channels = { ... } as const` definiert. Payload und Return-Types in **shared/types.ts**. Empfohlene Runtime-Validation via zod (optional aber empfohlen für robustere Fehler-Diagnose).

**Schema (nach Domain gruppiert):**

```typescript
// shared/ipc-channels.ts
export const Channels = {
  // Project-Management
  ProjectList:     "project:list",
  ProjectAdd:      "project:add",
  ProjectScan:     "project:scan-workspace",
  ProjectReadCfg:  "project:read-claude-md",   // YAML-Frontmatter parsen

  // Session-Management
  SessionOpen:     "session:open",             // Spawnt PTY + DB-Insert
  SessionClose:    "session:close",            // Status → archived
  SessionResume:   "session:resume",           // claude --resume <id>
  SessionUpdate:   "session:update",           // Status, Notes, etc.
  SessionHistory:  "session:history",          // Verlauf-Panel-Daten

  // PTY (interaktiv)
  PtyData:         "pty:data",                 // Main → Renderer
  PtyWrite:        "pty:write",                // Renderer → Main
  PtyResize:       "pty:resize",
  PtyExit:         "pty:exit",                 // Main → Renderer

  // Git
  GitStatus:       "git:status",
  GitDiff:         "git:diff",                 // Working Tree
  GitWorktrees:    "git:worktrees",            // Phase 5+, im MVP leer

  // Token-Tracking
  UsageWindow:     "usage:window",             // 5h, weekly_all, weekly_design, sonnet
  UsageHeatmap:    "usage:heatmap",            // 7×30 grid (Phase 2)
  UsageContext:    "usage:context",            // Per-Session-Kontext

  // Filesystem
  FsRead:          "fs:read",
  FsWrite:         "fs:write",
  FsListTemplates: "fs:list-templates",        // .md-Files aus templates/

  // Settings
  SettingsGet:     "settings:get",
  SettingsSet:     "settings:set",

  // Notes
  NotesSave:       "notes:save",               // Debounced 500ms

  // App-Misc
  AppOpenDataFolder: "app:open-data-folder",
  AppGetVersion:     "app:get-version",
} as const;
```

**Preload-Bridge-Shape:**

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld("api", {
  projects: { list, add, scan, readConfig },
  sessions: { open, close, resume, update, history },
  pty:      { write, resize, onData, onExit },
  git:      { status, diff, worktrees },
  usage:    { window, heatmap, context },
  fs:       { read, write, listTemplates },
  settings: { get, set },
  notes:    { save },
  app:      { openDataFolder, getVersion },
});
```

**Validation-Pattern (empfohlen):**

```typescript
// Beispiel mit zod
import { z } from "zod";

const SessionOpenInput = z.object({
  projectId: z.string().uuid(),
  type: z.enum(["feature", "bug", "review", "docs-sync"]),
  model: z.string(),
  cwd: z.string(),
});

ipcMain.handle(Channels.SessionOpen, async (event, input) => {
  const validated = SessionOpenInput.parse(input);  // Throws bei Invalid
  // ... handler logic
});
```

**Result-Type für Errors:**

```typescript
type IpcResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
```

Alle IPC-Handler returnen `IpcResult<T>` statt zu throwen — saubere Fehler-Behandlung im Renderer.

**PTY-Output-Throttling:**

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
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  added_manually BOOLEAN DEFAULT 0,
  has_git BOOLEAN DEFAULT 0,
  next_season_number INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                  -- UUID, matched zu Claude Codes session-uuid
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,                   -- 'feature' | 'bug' | 'review' | 'docs-sync'
  season_number INTEGER,                -- NULL für non-feature types
  status TEXT NOT NULL,                 -- 'running' | 'waiting' | 'idle' | 'completed' | 'archived' | 'interrupted' | 'error'
  current_model TEXT,                   -- Aus JSONL geparst
  worktree_branch TEXT,                 -- NULL im MVP, später für Worktrees
  notes_md TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                   -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);

CREATE TABLE usage_buckets (
  bucket_start INTEGER NOT NULL,        -- epoch hour
  model TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  PRIMARY KEY (bucket_start, model)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                   -- JSON
);

CREATE INDEX idx_messages_session_ts ON messages(session_id, ts);
CREATE INDEX idx_usage_bucket ON usage_buckets(bucket_start);
```

**Bewusst NICHT in SQLite:**
- Templates (= .md-Dateien im Filesystem)
- Token-Daten (= JSONL-Dateien in `~/.claude/projects/`)

### Stats-Aggregation und Token-Tracking

**Drei Datenquellen, jeweils mit unterschiedlichem Zweck:**

1. **JSONL-Files** in `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`
   - Source-of-Truth für die **aktuelle Session** (Live-Tracking)
   - chokidar-Watch mit 500ms-Debounce
   - Wird gelesen für: Per-Session-Kontext-Bar, State-Detection (Event-Frequenz)

2. **`messages`-Tabelle** in SQLite
   - Persistente Kopie der JSONL-Daten für **historische Auswertung**
   - Pro Session: alle Messages mit `tokens_in`, `tokens_out`
   - Wird befüllt: nach Session-Ende durch JSONL-Parser
   - Wird gelesen für: Verlauf-Panel mit Token-Zahlen, Per-Session-Stats

3. **`usage_buckets`-Tabelle** in SQLite
   - Pre-aggregierte Token-Summen pro **Stunde × Modell**
   - Wird befüllt: kontinuierlich beim Schreiben in `messages`-Tabelle
   - Wird gelesen für: Plannutzung-Bars (5h, weekly_all, etc.) und Heatmap (Phase 2)
   - Performance-Vorteil: Direkte Aggregation ohne JSONL-Tail

**Aggregation-Flow:**

```
Live-Update (während Session läuft):
JSONL geschrieben
→ chokidar erkennt Change
→ Tail-Read der neuen Zeile
→ Per-Session-Kontext-Bar updaten (sofort)
→ State-Detection updaten (sofort)
Persist-Flow (nach jeder Message):
JSONL-Zeile parsen
→ INSERT in messages-Tabelle
→ UPDATE usage_buckets (bucket_start = floor(ts / 3600))
→ IPC-Push an Plannutzung (debounced 500ms)
```

**Plannutzung-Bars sind konfigurierbar via Settings:**

```typescript
// Beispiel-Konfiguration
{
  "limit_bars": [
    {
      "id": "5h",
      "label": "5-Stunden-Limit",
      "window_hours": 5,
      "filter": "all",                // Alle Modelle
      "limit_method": "p90"            // P90 über letzte 192h
    },
    {
      "id": "weekly_all",
      "label": "Wöchentlich · alle Modelle",
      "window_hours": 168,
      "filter": "all",
      "limit_method": "p90"
    },
    {
      "id": "weekly_design",
      "label": "Wöchentlich · Claude Design",
      "window_hours": 168,
      "filter": "top_tier",            // Opus 4.7, 4.6
      "limit_method": "p90"
    },
    {
      "id": "weekly_sonnet",
      "label": "Nur Sonnet",
      "window_hours": 168,
      "filter": "sonnet",              // Sonnet 4.6, 4.5
      "limit_method": "p90"
    }
  ]
}
```

Filter-Logik:
- `"all"` — alle Token aus `usage_buckets`
- `"top_tier"` — nur `model LIKE 'opus%'`
- `"sonnet"` — nur `model LIKE 'sonnet%'`
- `"haiku"` — nur `model LIKE 'haiku%'`
- Custom-Filter via `model_pattern: "claude-opus-4-7"` möglich

**Heatmap (Phase 2):**

```sql
-- Stündliche Buckets der letzten 30 Wochen
SELECT 
  date(bucket_start, 'unixepoch') AS day,
  SUM(tokens) AS daily_tokens
FROM usage_buckets
WHERE bucket_start >= strftime('%s', 'now', '-30 weeks')
GROUP BY day
ORDER BY day;
```

Frontend-Rendering: pures CSS-Grid (7 Zeilen × 30 Spalten) mit color-mix-Stufen — laut Claude-Design-Handoff performanter als Recharts.

### Settings-JSON (komplett)

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

  "limit_bars": [
    { "id": "5h", "label": "5-Stunden-Limit", "window_hours": 5, "filter": "all", "limit_method": "p90" },
    { "id": "weekly_all", "label": "Wöchentlich · alle Modelle", "window_hours": 168, "filter": "all", "limit_method": "p90" },
    { "id": "weekly_design", "label": "Wöchentlich · Claude Design", "window_hours": 168, "filter": "top_tier", "limit_method": "p90" },
    { "id": "weekly_sonnet", "label": "Nur Sonnet", "window_hours": 168, "filter": "sonnet", "limit_method": "p90" }
  ],

  "p90_window_hours": 192,

  "token_warning_thresholds": {
    "yellow": 70,
    "orange": 85,
    "red": 95
  },

  "terminal_font_family": "JetBrains Mono, Cascadia Code, MesloLGS NF",
  "terminal_font_size": 13,

  "theme": "dark",
  "accent_color": "#4ade80",

  "shortcuts": {
    "new_session": "Ctrl+N",
    "templates": "Ctrl+T",
    "settings": "Ctrl+K",
    "tab_next": "Ctrl+Tab",
    "tab_prev": "Ctrl+Shift+Tab"
  }
}
```

### Layout-Constants

Diese Werte sind **fest im Code** verankert (keine Settings), folgen Claude-Designs Handoff-Spec:

```typescript
// renderer/styles/layout.ts
export const LAYOUT = {
  // Title-Bar
  TITLEBAR_HEIGHT: 36,

  // Main-Grid
  COL_LEFT_WIDTH: 240,        // Sidebar
  COL_MID_WIDTH: "1fr",       // Terminal + CodePane
  COL_RIGHT_WIDTH: 232,       // Files + Notes

  ROW_TOP_HEIGHT: "1fr",      // Terminal + CodePane
  ROW_BOTTOM_HEIGHT: 300,     // Stats + PlanPane

  // Innen-Layouts
  TAB_BAR_HEIGHT: 28,
  TERMINAL_FOOTER_HEIGHT: 24,
  FILES_FLEX: 0.55,           // 55% des Right-Pane für Files
  NOTES_FLEX: 0.45,           // 45% für Notes

  // Spacing-Skala (px)
  SPACING: [4, 6, 8, 10, 12, 14, 16],

  // Border-Radius (sehr konservativ — fast keine Rundungen)
  RADIUS_PILL: 2,             // Pills, Buttons, List-Items
  RADIUS_MODAL: 4,            // Modale (einzige Ausnahme)
  RADIUS_TOAST: 3,            // Toasts
} as const;
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

### 6.0 Datei-Struktur (Frontend)
```
Komponenten-Tree wie im Claude-Design-Handoff vorgegeben:
src/
├── main/
│   ├── index.ts              # app lifecycle, BrowserWindow
│   ├── ipc/                  # session, pty, git, db, fs handlers
│   │   ├── project.ts
│   │   ├── session.ts
│   │   ├── pty.ts
│   │   ├── git.ts
│   │   ├── usage.ts
│   │   ├── fs.ts
│   │   ├── settings.ts
│   │   └── notes.ts
│   ├── pty/manager.ts        # node-pty pool keyed by sessionId
│   ├── git/worktree.ts       # simple-git wrapper
│   ├── jsonl/watcher.ts      # chokidar + parser
│   └── db/
│       ├── connection.ts     # better-sqlite3 init + WAL
│       ├── migrations/
│       │   └── 0001_init.sql
│       └── repos/            # projects, sessions, messages, usage
├── preload/
│   └── index.ts              # contextBridge → window.api
├── shared/
│   ├── ipc-channels.ts
│   └── types.ts              # Project, Session, UsageWindow, etc.
└── renderer/
├── index.html
├── main.tsx
├── App.tsx               # Layout-Grid
├── stores/
│   ├── projects.ts       # useProjectStore (Zustand)
│   ├── sessions.ts       # useSessionStore
│   ├── usage.ts          # useUsageStore
│   └── ui.ts             # useUiStore
├── panels/
│   ├── TitleBar.tsx
│   ├── LeftSidebar.tsx
│   ├── TerminalPane.tsx
│   ├── CodePane.tsx      # Tabs + Split, CodeMirror
│   ├── FilesPanel.tsx
│   ├── NotesPanel.tsx
│   ├── StatsPane.tsx     # Übersicht + Heatmap (Phase 2)
│   └── PlanPane.tsx      # Plannutzung
├── modals/
│   ├── NewSessionModal.tsx
│   ├── TemplatesModal.tsx
│   ├── PreCommitModal.tsx
│   └── SettingsModal.tsx
├── components/           # Pill, StatusDot, MiniBar, ListItem, etc.
└── styles/
├── tokens.css        # CSS Custom Properties (aus Claude-Design-Export)
└── app.css
```

### 6.0.1 Modal-System

Vier Modale werden im MVP implementiert (Claude-Design-Handoff-Spec):

| Modal | Trigger | Zweck |
|---|---|---|
| `NewSessionModal` | Sidebar "+ Neue Session" oder `Ctrl+N` | Neue Session erstellen (Typ, Modell, Season) |
| `TemplatesModal` | `Ctrl+T` | Template-Picker mit Variablen-Filling |
| `PreCommitModal` | Sensitive-Files im Staged-Diff (Phase 2) | Warnung bei `.env`, Keys, Tokens |
| `SettingsModal` | `Ctrl+K` oder Settings-Icon | App-Konfiguration |

**Modal-Pattern (einheitlich):**
- Backdrop: `rgba(0,0,0,0.55)` mit `backdrop-filter: blur(2px)`
- Dialog: `--td-panel`-Background, `1px --td-line-2`-Border, `border-radius: 4px`
- Close via `Esc` oder `×`-Button
- `max-width: 540px` (Standard) oder `820px` (large variant für Settings)

### 6.0.2 Tastatur-Shortcuts

Globale Shortcuts (in `renderer/main.tsx` registriert):

| Shortcut | Aktion |
|---|---|
| `Ctrl+T` | Templates-Modal öffnen |
| `Ctrl+K` | Settings-Modal öffnen |
| `Ctrl+N` | Neue-Session-Modal öffnen |
| `Esc` | Aktives Modal schließen |
| `Ctrl+Tab` | Nächster Terminal-Tab |
| `Ctrl+Shift+Tab` | Vorheriger Terminal-Tab |

Erweiterbar via Settings (Phase 3).

### 6.0.3 Hover-Pattern

**Einheitliches Hover-Verhalten** für alle interaktiven Elemente (aus Claude-Design-Spec):

- Border-Color → `var(--td-accent-line)`
- Color → `var(--td-accent)`
- **Kein** Background-Change
- Transition: `120ms ease-out`

Code-Beispiel:
```css
.td-action-btn {
  transition: border-color .12s, color .12s;
}
.td-action-btn:hover {
  border-color: var(--td-accent-line);
  color: var(--td-accent);
}
```

### 6.0.4 Status-Indikatoren

**Status-Dots** mit semantischen Farben:

| Status | Farbe | Effekt |
|---|---|---|
| `running` | `--td-accent` (emerald) | Glow via `box-shadow: 0 0 8px rgba(74,222,128,0.6)` |
| `waiting` | `--td-warn` (amber) | Statisch |
| `idle` | `--td-text-mute` (grau) | Statisch |
| `completed` | `--td-blue` | Statisch |
| `interrupted` | `--td-orange` | Statisch |
| `archived` | `--td-text-mute`, opacity 0.5 | Statisch |

**Pulse-Animation** für `running` (optional, aus CSS-Spec):
```css
.td-status-dot.running {
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

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

### Phase 1 (MVP) — ✅ abgeschlossen 2026-05-12

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

✅ Alle 8 Sprints abgeschlossen 2026-05-12 — die Sektion bleibt unverändert als Architektur-Plan-Historie. Aktueller Feature-Status in [FEATURES.md](./FEATURES.md), implementierte Abweichungen vom Plan in [CHANGELOG.md](./CHANGELOG.md) (z.B. Mid-Sprint-Right-Pane-Pivot Sprint 7, Sprint 9 als zusätzlicher QA-Sprint).

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

Die folgenden Fragen wurden während Sprint 1 entschieden — die Antworten stehen zur Nachvollziehbarkeit hier, Details in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md).

- React State-Library Pattern — **4 Zustand-Domain-Stores** (`useSessionStore`, `useProjectStore`, `useUsageStore`, `useUiStore`).
- IPC-Channel-Naming-Convention — **Doppelpunkt** (`project:list`, `pty:create`).
- SQLite-Migration-Strategie — **Schema-versioniert** via `PRAGMA user_version`, nummerierte SQL-Dateien.
- Tailwind vs. CSS-Modules vs. Styled-Components — **CSS-Modules + `tokens.css`** (CSS Custom Properties).
- Test-Setup — **Vitest**, Foundation-Smoke-Tests ab Sprint 1.
- Logging-Library — **electron-log**.

---

## Anhang: Antwort-Log der Grill-Session

Vollständige Frage-Antwort-Historie ist in der separaten Datei `CLAUDE_WORKBENCH_GRILL_STAND.md` (Zwischenstand nach Frage 14).
