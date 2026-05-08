# Handoff: TakumiDeck — Claude-Code Workbench

## Overview
TakumiDeck ist ein lokales Desktop-Cockpit für Claude-Code-Sessions: ein Multi-Pane-Workbench (Terminal + Diff/Editor + Files + Notizen + Token-Dashboard + Plannutzung), in dem Entwickler:innen mehrere parallele Claude-Code-Instanzen pro Projekt managen, Git-Worktrees umschalten und Token-Verbrauch gegen die Plan-Limits beobachten. Die Designs in diesem Bundle sind **Referenzen**, keine Production-Quellen — sie zeigen Look, Layout und Verhalten. Aufgabe ist, sie in die unten beschriebene Electron-Codebasis zu übertragen.

## Target Stack (verbindlich)
| Layer | Choice | Hinweise |
|---|---|---|
| Runtime | **Electron** + **TypeScript** | Strict mode. Renderer ↔ Main über kontextisolierten Preload + typed IPC (`zod`-validiert empfohlen). |
| UI | **React 18** + **Zustand** | Kein Redux. Ein Store pro Domäne (`useSessionStore`, `useProjectStore`, `useUsageStore`, `useUiStore`). |
| Storage | **better-sqlite3** | Im Main-Prozess. Migrations als nummerierte SQL-Dateien. WAL-Mode an. |
| Terminal | **xterm.js** (Canvas-Renderer) + **node-pty** | `@xterm/addon-canvas`, `@xterm/addon-fit`. PTY-Spawn im Main, Stream-Bytes via IPC `pty:data` / `pty:write` / `pty:resize`. |
| Editor | **CodeMirror 6** | `@codemirror/lang-markdown` für `.md`, `@codemirror/merge` für Diff-Pane, `oneDark` als Basis. |
| Git | **simple-git** | Im Main-Prozess. Worktree-Operationen, Diff-Stats, Branch-Listings. Kein Schreiben ohne explizite User-Aktion. |
| Charts | **Recharts** | Plan-Burn-Rate, Heatmap (SVG-Grid), Modell-Verteilung. |
| Build | **Electron Forge** | Maker: `@electron-forge/maker-squirrel`, `-zip`, `-dmg`. Plugin: `@electron-forge/plugin-vite` (Vite für Renderer + Main). |

## Fidelity
**High-fidelity.** Farben, Typografie, Spacing und Interaktionen sind final. Pixel-genaue Umsetzung.

## Repository-Layout (Vorschlag)
```
takumideck/
├── forge.config.ts
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── package.json
├── src/
│   ├── main/
│   │   ├── index.ts              # app lifecycle, BrowserWindow
│   │   ├── ipc/                  # session, pty, git, db, fs handlers
│   │   ├── pty/manager.ts        # node-pty pool keyed by sessionId
│   │   ├── git/worktree.ts       # simple-git wrapper
│   │   └── db/
│   │       ├── connection.ts     # better-sqlite3 init + WAL
│   │       ├── migrations/0001_init.sql
│   │       └── repos/            # projects, sessions, messages, usage
│   ├── preload/
│   │   └── index.ts              # contextBridge → window.api
│   ├── shared/
│   │   ├── ipc-channels.ts
│   │   └── types.ts              # Project, Session, UsageWindow, ...
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── stores/               # zustand stores
│       ├── panels/
│       │   ├── TitleBar.tsx
│       │   ├── LeftSidebar.tsx
│       │   ├── TerminalPane.tsx
│       │   ├── CodePane.tsx       # tabs + split, CodeMirror
│       │   ├── FilesPanel.tsx
│       │   ├── NotesPanel.tsx
│       │   ├── StatsPane.tsx      # Übersicht + Heatmap (Recharts)
│       │   └── PlanPane.tsx       # Plannutzung
│       ├── modals/
│       │   ├── NewSessionModal.tsx
│       │   ├── TemplatesModal.tsx
│       │   ├── PreCommitModal.tsx
│       │   └── SettingsModal.tsx
│       ├── components/            # Pill, StatusDot, MiniBar, ...
│       └── styles/
│           ├── tokens.css         # CSS custom properties
│           └── app.css
└── design_reference/              # die HTML-Mocks aus diesem Handoff
```

## Design Tokens
Alle Tokens aus `design/styles.css` 1:1 nach `src/renderer/styles/tokens.css` übernehmen. Wichtigste:

```css
:root {
  --td-bg:        #0d0f0e;
  --td-bg-2:      #131614;
  --td-bg-3:      #181b19;
  --td-panel:     #111413;
  --td-panel-2:   #15191b;
  --td-line:      #232826;
  --td-line-2:    #2c322f;
  --td-line-3:    #3a4240;
  --td-text:      #d8dad6;
  --td-text-dim:  #8a8f8a;
  --td-text-mute: #5b605b;
  --td-accent:    #4ade80;       /* emerald — primärer Akzent */
  --td-accent-soft: rgba(74, 222, 128, 0.14);
  --td-accent-line: rgba(74, 222, 128, 0.35);
  --td-warn:      #f0b400;
  --td-orange:    #ff8a3c;
  --td-red:       #ef5d5d;
  --td-blue:      #5cb8ff;
  --td-purple:    #b594ff;

  --td-mono: "JetBrains Mono", "Cascadia Code", ui-monospace, Consolas, monospace;
  --td-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --td-display: "VT323", "JetBrains Mono", monospace;
}
```

**Schriftrollen:**
- `--td-display` (VT323) — nur Panel-Headlines (`Projekte`, `Aktive Seassions`, `Verlauf`, `Dateien`, `Notizen`, `Plannutzung`, „Übersicht"). 16–18 px.
- `--td-mono` (JetBrains Mono) — Body, Listenitems, Tabs, Stats-Werte, Code/Diff. 11–13 px.
- `--td-sans` (Inter) — nur Modal-Body und Settings-Formulare. 13 px.

**Spacing-Skala:** 4 / 6 / 8 / 10 / 12 / 14 / 16 px. Kein border-radius außer 2 px auf Pills/Buttons. Border-Linien sind echte 1 px `var(--td-line)`.

## Layout
4-Spalten-Grid, 2 Reihen, 1 px Gap (zeigt durch `--td-line` Hintergrund):

```
grid-template-columns: 240px  1fr   1fr   232px
grid-template-rows:    1fr    300px
```

| Cell | Inhalt |
|---|---|
| col 1, rows 1–2 | **Linke Sidebar**: Projekte / Aktive Seassions / Verlauf |
| col 2, row 1 | **Terminal** (xterm.js mit Tabs) |
| col 3, row 1 | **CodePane** (Diff + Markdown-Tabs, optional Split) |
| col 2, row 2 | **Übersicht** (Stats-Grid 2×4 + Heatmap rechts) |
| col 3, row 2 | **Plannutzung** |
| col 4, rows 1–2 | **Rechte Sidebar**: Dateien (oben ~55 %) + Notizen (unten) |

Title-Bar oben: 36 px, draggable (`-webkit-app-region: drag`), Brand-Lockup `匠 TakumiDeck`, rechts Fenster-Buttons.

## Screens / Views

### 1. TitleBar (36 px)
Brand-Lockup links: Kanji `匠` in `--td-accent` + `TakumiDeck` in `--td-mono`. Mitte: aktiver Projekt-Pfad als `--td-text-mute`. Rechts: drei native-style Window-Buttons (− / ☐ / ×).

### 2. Linke Sidebar — `LeftSidebar.tsx`
Drei vertikal gestapelte Sektionen, jede mit `--td-display`-Headline und 1 px Top-Border.

- **Projekte** — Liste; jedes Item: 📁-Glyph, Projektname, optionaler Active-Count-Badge rechts (Zahl in `--td-accent-soft` mit `--td-accent`-Text). Aktives Projekt hat `border-left: 2px solid var(--td-accent)` und `--td-bg-3`-Hintergrund. Footer: `+ Add Project`-Button mit `--td-line`-Border.
- **Aktive Seassions** — Liste; Status-Dot links (running = `--td-accent`, idle = `--td-warn`, stopped = `--td-text-mute`), darunter Session-Name. Footer: `+ Neue Seassion` öffnet `NewSessionModal`.
- **Verlauf** — Liste fertiger Sessions; ✓ links, Name rechts. Letzter Eintrag mit `…`-Glyph statt ✓ wenn unfertig.

### 3. Terminal-Pane — `TerminalPane.tsx`
Tab-Bar oben (Höhe 28 px, `--td-bg-2`-Hintergrund): jeder Tab `▶ <name>` mit `×`-Close. Aktiver Tab: `--td-bg`-Hintergrund + 1 px-Top-Border in `--td-accent`. `+`-Button und `▾`-Dropdown rechts.

Body: xterm.js Instance, Canvas-Renderer, FontFamily = `--td-mono`, FontSize 13. Welcome-Banner als Initial-Output (Sprite vor erstem PTY-Spawn):
```
Claude Code v2.1.133
Sonnet 4.6 · Claude Pro
~/Desktop/<projekt>
```
Über dem Banner ein 8-Bit-Pixel-Avatar (44 × 44, transparent).

Footer-Statusbar (24 px, oberer Border `--td-line`): links `Try "how does <filepath> work?"` als Hint, mittig `? for shortcuts`, rechts Modell-Pill (`Sonnet 4.6` in `--td-accent-soft`).

**IPC:**
- `pty:spawn(sessionId, cwd, shell)` → openPty
- `pty:data(sessionId, chunk)` → an xterm `term.write(chunk)`
- `pty:write(sessionId, input)` ← user input
- `pty:resize(sessionId, cols, rows)` ← FitAddon

### 4. Code-Pane — `CodePane.tsx`
Tab-Leiste oben mit Datei-Tabs. Jeder Tab hat Mini-Badge (Diff = `--td-accent`, MD = `--td-blue`, Code = `--td-purple`). Rechts in der Tab-Leiste zwei Split-Buttons:
- `⊟` Diff oben / Markdown unten (horizontal split)
- `⊞` Markdown oben / Diff unten
- Erneut klicken → Single-Tab.

Body: CodeMirror 6, `oneDark` + Custom-Theme das `--td-bg`, `--td-text`, `--td-accent` als Cursor verwendet. Diff-View nutzt `@codemirror/merge` `unifiedMergeView`. Hinzugefügte Zeilen: Hintergrund `--td-add` (rgba green 10%), Linien-Marker `--td-add-line`. Entfernte Zeilen: `--td-rem` / `--td-rem-line`. Zeilennummern in `--td-text-mute`. Nicht-modifizierte Bereiche kollabieren als `▸ N unmodified lines`-Disclosure.

Footer: Worktree-Selector — drei Pills (`▢ Lokal`, `📁 <projekt>`, `⎇ <branch>`, `▢ Worktree`) mit `+`-Button daneben (öffnet Worktree-Modal).

### 5. Files-Panel (rechte Sidebar oben, ~55 %)
Headline `Dateien` in `--td-display`. Filter-Eingabe darunter: Mono-Input mit Hint-Text `Dateien filtern… (?Text zur Inhaltssuche)`. Liste: jedes Item Glyph (📁 für Folder, `</>` für Code-Datei in `--td-text-mute`) + Name. Klick → öffnet im Code-Pane.

### 6. Notes-Panel (rechte Sidebar unten)
Headline `Notizen` in `--td-display`. Textarea, `--td-mono`, persistiert in SQLite pro `sessionId`. Auto-Save mit 500 ms Debounce, Save-State-Pill rechts oben (`Speichert…` → `Gespeichert ✓` → fade out).

### 7. Übersicht (Bottom-Mitte) — `StatsPane.tsx`
Kopf: zwei Tabs `Übersicht` / `Modelle`, rechts Range-Toggle `Alle | 30d | 7d`. Body splittet vertikal:

- **Links (~50 %)**: 2×4 Stat-Grid. Jede Kachel: kleine Caption oben in `--td-text-mute` (`--td-mono`, 10 px, uppercase, letter-spacing 0.06em), Wert darunter in `--td-mono`, 18 px, `--td-text`. Kacheln: Sitzungen, Nachrichten, Token gesamt, Aktive Tage, Aktuelle Streak, Längste Streak, Spitzenstunde, Bevorzugtes Modell.
- **Rechts (~50 %)**: Heatmap 7 × 30, Cells 1 fr × 1 fr, Gap 4 px. Werte → 5 Stufen (`--td-bg-3` → 4 Grünstufen ableiten via `color-mix(in oklab, var(--td-accent) X%, var(--td-bg))`). Tooltip on hover. Footer-Caption: `Du hast ~31× mehr Token als The Lord of the Rings verwendet.`

### 8. Plannutzung (Bottom-Code-Spalte) — `PlanPane.tsx`
Headline `Plannutzung` mit `→`-Detail-Button rechts (öffnet Burn-Rate-Modal). Drei Limit-Rows:
- `5-Stunden-Limit` — Prozent-Pill rechts (`0% · Reset in 4h`), Recharts `LineChart` als 2 px Mini-Sparkline darunter, x = letzte 5 h, Linie in `--td-accent`.
- `Wöchentlich · alle Modelle` — gleiche Struktur, Reset in 1 T.
- `Wöchentlich · Claude Design` — gleiche Struktur.
- `Nur Sonnet` — gleiche Struktur.

Bar-Color-Logik:
```ts
const barColor = (pct: number) =>
  pct >= 90 ? "var(--td-red)"
  : pct >= 75 ? "var(--td-warn)"
  : "var(--td-accent)";
```

### 9. Modale
Backdrop: `rgba(13, 15, 14, 0.72)` mit `backdrop-filter: blur(2px)`. Dialog: `--td-panel`-Hintergrund, 1 px `--td-line-2`-Border, max-width 520 px, Close = `Esc`.

- **NewSessionModal** — Felder: Typ (Pills `Bug | Refactor | Feature | Doku`), Modell (Radio Sonnet 4.6 / Opus 4.7 / Haiku 4.5), Season-Vergabe (Dropdown S1–S5). CTA `Session starten`.
- **TemplatesModal** — `Ctrl+T`. Liste vorgespeicherter Prompt-Templates; Klick sendet via Bracketed-Paste an aktives PTY.
- **PreCommitModal** — Triggert vor `git commit` wenn `simple-git diff --staged` sensitive Patterns matcht (`.env`, Keys, Tokens). Liste der riskanten Files mit Override-Checkbox.
- **SettingsModal** — `Ctrl+K`. Sechs Tabs: Allgemein, Modelle, Shortcuts, Git, Datenbank, Über.

## Interactions & Behavior
- **Shortcuts**: `Ctrl+T` Templates, `Ctrl+K` Settings, `Ctrl+N` Neue Session, `Esc` schließt Modale, `Ctrl+Tab` / `Ctrl+Shift+Tab` Terminal-Tabs durchschalten.
- **Klick-Hover-Pattern**: alle interaktiven Elemente bekommen on hover `border-color: var(--td-accent-line)` und `color: var(--td-accent)`, ohne Background-Change. 120 ms ease-out.
- **Status-Dots** (sessions): `running` pulst (1.4 s ease-in-out, opacity 0.5 → 1).
- **Toasts**: bottom-right, `--td-bg-2`-Hintergrund, 1 px `--td-accent-line`, fade-out nach 2.4 s.
- **Auto-Save Notes**: Debounce 500 ms.

## State Management (Zustand-Stores)

```ts
// stores/projects.ts
type ProjectStore = {
  projects: Project[];
  activeProjectId: string | null;
  setActive(id: string): void;
  add(name: string, path: string): Promise<void>;
};

// stores/sessions.ts
type SessionStore = {
  sessions: Record<string, Session>;     // keyed by id
  activeSessionId: string | null;
  open(projectId: string, opts: NewSessionOptions): Promise<string>;
  close(id: string): Promise<void>;
  setNotes(id: string, md: string): void; // debounced persist
};

// stores/usage.ts
type UsageStore = {
  windows: { fiveHour: Window; weeklyAll: Window; weeklyDesign: Window; sonnet: Window };
  heatmap: number[][];                   // 7×N
  refresh(): Promise<void>;              // pulls from sqlite
};

// stores/ui.ts
type UiStore = {
  modal: null | "new-session" | "templates" | "pre-commit" | "settings";
  splitOrient: null | "diff-top" | "md-top";
  range: "all" | "30d" | "7d";
  dashTab: "overview" | "models";
  open(modal: UiStore["modal"]): void;
  close(): void;
};
```

## Datenmodell (better-sqlite3)

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,                -- bug|refactor|feature|doku
  model TEXT NOT NULL,               -- sonnet-4.6|opus-4.7|haiku-4.5
  season TEXT,
  status TEXT NOT NULL,              -- running|idle|stopped|done
  notes_md TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL,
  worktree_branch TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                -- user|assistant|tool
  content TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);

CREATE TABLE usage_buckets (
  bucket_start INTEGER NOT NULL,     -- epoch hour
  model TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  PRIMARY KEY (bucket_start, model)
);

CREATE INDEX idx_messages_session_ts ON messages(session_id, ts);
CREATE INDEX idx_usage_bucket ON usage_buckets(bucket_start);
```

WAL aktivieren: `db.pragma('journal_mode = WAL')`. Statements als prepared statements cachen.

## IPC-Channels (typed)
```ts
// shared/ipc-channels.ts
export const Channels = {
  ProjectList: "project:list",
  ProjectAdd:  "project:add",
  SessionOpen: "session:open",
  SessionClose:"session:close",
  PtyData:     "pty:data",       // main → renderer
  PtyWrite:    "pty:write",      // renderer → main
  PtyResize:   "pty:resize",
  GitStatus:   "git:status",
  GitDiff:     "git:diff",
  GitWorktrees:"git:worktrees",
  UsageWindow: "usage:window",
  UsageHeatmap:"usage:heatmap",
  NotesSave:   "notes:save",
} as const;
```

Preload exposed shape:
```ts
contextBridge.exposeInMainWorld("api", {
  projects: { list, add },
  sessions: { open, close, setNotes },
  pty:      { write, resize, onData },
  git:      { status, diff, worktrees },
  usage:    { window, heatmap },
});
```

## Recharts-Integration
Plan-Bars über CSS (`<div>` + Inline-Width). Burn-Rate-Modal nutzt `<LineChart>` (5-Stunden-Trend, x = epoch-hour, y = tokens), Stroke `var(--td-accent)`, kein Fill. Modell-Verteilung als `<PieChart>` mit `labelLine={false}`. Heatmap selbst NICHT in Recharts — pures CSS-Grid mit OKLab-color-mix-Stufen ist performanter.

## Assets
Pixel-Avatar (44 × 44, transparent PNG) für Terminal-Welcome — derzeit Placeholder im Mock, vor Build durch finalen Asset ersetzen. Sonst keine Bitmap-Assets nötig.

Fonts via `@fontsource`:
- `@fontsource/jetbrains-mono` (400/600)
- `@fontsource/inter` (400/500/600)
- `@fontsource/vt323` (400)

## Files (in this bundle)
```
design_handoff_takumideck/
├── README.md           ← dieses Dokument
└── design/
    ├── TakumiDeck Prototyp.html    ← Entry-Point, lädt die JSX-Files
    ├── app.jsx                     ← Root-Komponente + Layout-Grid
    ├── components.jsx              ← alle Panels + Modale + Pills
    ├── data.js                     ← Mock-Daten (Projekte, Sessions, Heatmap, Plan)
    ├── styles.css                  ← komplette Token-Palette + Layout-CSS
    └── tweaks-panel.jsx            ← Tweaks-UI (kann im Build entfallen)
```

Öffne `TakumiDeck Prototyp.html` in einem aktuellen Browser, um Layout, Hover-States, Modale und Tweaks live zu sehen.

## Empfohlene Implementierungs-Reihenfolge
1. Electron-Forge-Skeleton (Vite + TS + React) hochziehen, Window mit `frame: false` + custom title bar.
2. Tokens.css + Layout-Grid 1:1 portieren — App soll mit toten Panels schon korrekt aussehen.
3. better-sqlite3 + Migrations + Repos. Seed mit 1 Projekt, 2 Sessions.
4. Zustand-Stores + Preload-API stub'en, Renderer gegen Mocks rendern.
5. xterm.js + node-pty: erst eine PTY pro App, dann Multi-Tab + Session-Mapping.
6. CodeMirror 6 in der Code-Pane, dann `@codemirror/merge` für Diff.
7. simple-git-Integration: Status, Diff, Worktree-List → CodePane-Footer + PreCommitModal.
8. Usage-Tracking: parser für Claude-Code-Output → `usage_buckets`, dann StatsPane + PlanPane.
9. Modale, Shortcuts, Toasts.
10. Forge-Maker konfigurieren, Code-Sign-Setup, erste Builds.

## Out of Scope für v1
- Cloud-Sync / Multi-Device.
- Echte LLM-Calls aus dem Renderer (alles geht durch das CLI im PTY).
- Light-Theme — Dark only zum Start.
