# Architektur

Dieses Dokument beschreibt die **statische Struktur** des Codes: Module, Datenflüsse, Persistenz. Es wird **während der Entwicklung** gepflegt.

Für **Designentscheidungen mit Begründung** (warum etwas so gebaut ist), siehe [TAKUMIDECK_ARCHITEKTUR.md](./TAKUMIDECK_ARCHITEKTUR.md).
Für **Warum-Entscheidungen** auf Feature-Ebene, siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md).

## Prozess-Architektur (Electron)

TakumiDeck läuft in zwei Prozessen:

- **Main-Prozess** — Node.js, Vollzugriff Filesystem/PTY/SQLite
- **Renderer-Prozess** — Chromium mit React-UI, sandboxed (`contextIsolation: true`, `nodeIntegration: false`)

Die Prozesse kommunizieren via IPC. Channels sind über `preload.ts` whitelisted und in `shared/ipc-types.ts` typisiert.

## Ordnerstruktur (geplant, wird während Sprint 1 konkretisiert)

```
TakumiDeck/
├── src/
│   ├── main/                       # Main-Prozess (Node.js)
│   │   ├── index.ts                # Entry point
│   │   ├── pty/                    # PTY-Spawn, Subprocess-Management
│   │   ├── db/                     # SQLite-Zugriff
│   │   ├── git/                    # simple-git Operationen
│   │   ├── jsonl/                  # Token-Tracking via chokidar
│   │   └── ipc/                    # IPC-Handler
│   │
│   ├── preload/
│   │   └── index.ts                # contextBridge-Whitelist
│   │
│   ├── renderer/                   # React-UI
│   │   ├── components/             # UI-Komponenten
│   │   ├── stores/                 # Zustand-Stores
│   │   ├── hooks/                  # React-Hooks
│   │   └── index.tsx               # React Entry
│   │
│   └── shared/                     # Geteilte Types
│       └── ipc-types.ts
│
├── docs/                           # Doku (du bist hier)
└── package.json
```

Schichten-Regel: **Renderer importiert nie direkt aus Main**. Alle Cross-Process-Calls gehen durch IPC.

## Datenfluss: Session erstellen
Renderer (React)
→ IPC-Call "pty:create" mit { projectPath, model }
→ Main: spawn claude --model X --resume <sessionId>
→ Main: SQLite-Insert in sessions-Table
→ Main → Renderer: IPC-Event "pty:created"
→ Renderer: Tab-Komponente mounten, xterm.js initialisieren
→ Main: chokidar watcht ~/.claude/projects/<encoded-path>/<sessionId>.jsonl
→ Bei JSONL-Update: Token-Aggregation, IPC-Push an Dashboard

## Datenfluss: Token-Tracking (Live)
Claude Code schreibt Zeile in JSONL
→ chokidar erkennt Change-Event (Main-Prozess)
→ Tail-Read der neuen Zeile, Parse als NDJSON
→ Aggregation: input_tokens + cache_creation + cache_read
→ 500ms-Debounce
→ IPC-Event "tokens:update" → Renderer
→ Recharts-Update der Bars

## Datenmodell

### SQLite-Tabellen

| Tabelle | Zweck |
|---|---|
| `projects` | Bekannte Projekte (path, name, has_git, next_season_number) |
| `sessions` | Aktive + historische Sessions (id, project_id, type, status, current_model, notes) |
| `settings` | Globale App-Settings (key/value JSON) |

Vollständiges Schema in [TAKUMIDECK_ARCHITEKTUR.md, Kapitel 4](./TAKUMIDECK_ARCHITEKTUR.md#4-persistenz).

### Externe Datenquellen (nicht in SQLite)

- **JSONL-Dateien** in `~/.claude/projects/` — Source-of-Truth für Token-Verbrauch (kein SQLite-Cache)
- **CLAUDE.md** im Projekt-Root — App-Konfiguration via YAML-Frontmatter (read-only)
- **Templates als `.md`-Dateien** in `<project>/docs/templates/` und `%APPDATA%\TakumiDeck\templates\`

## Konfiguration und Persistenz

| Daten | Ort |
|---|---|
| App-Settings | `%APPDATA%\TakumiDeck\settings.json` |
| Sessions, Projekte | `%APPDATA%\TakumiDeck\data.sqlite` |
| Globale Templates | `%APPDATA%\TakumiDeck\templates\*.md` |
| Per-Projekt-Config | `<project>/CLAUDE.md` (YAML-Frontmatter `workbench:`-Namespace) |
| Per-Projekt-Templates | `<project>/docs/templates/*.md` |
| Logs | `%APPDATA%\TakumiDeck\logs\` |

## Versionierung

- Git Remote: `https://github.com/Makney/TakumiDeck.git`
- `.gitignore` excludes runtime artefacts, `node_modules/`, `dist/`, `out/`
