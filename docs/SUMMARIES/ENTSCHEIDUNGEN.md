---
source: docs/ENTSCHEIDUNGEN.md
source_hash: 678c98bef390bbd0fa94355a210b64383b7abc6913eca6b347c6cf31e2a5d1de
summarized_at: 2026-05-17T13:33:29Z
---

# ENTSCHEIDUNGEN-Kompaktfassung

Architektur- und Scope-Entscheidungen mit „Warum nicht die andere Variante?". Format pro Eintrag: Entscheidung · Varianten (A/B/C, gewaehlte markiert) · Grund · Konsequenz · optional Implementierungsdetail.

## Wiederkehrende Muster

- **Variants A/B/C vor Code** mit Aufwand und Empfehlung; **pragmatisch vor invasiv** (Lazy-Pull, on-demand, additiv); **Driver-Injection + Pure-Logik** in `src/shared/` fuer Tests ohne Electron/SQLite/xterm.
- **Spec > UX-Default** (manueller Markdown-Save trotz Notes-Auto-Save-Konvention); **Vorlage > eigene Drift** bei Konflikt (Window-Frame-Tabs, UsageBar-Zeile, Settings-Sidebar).

## Architektur-Saeulen

- **Stack:** @lydell/node-pty NAPI (kein Rebuild), xterm.js v5.5+Canvas, better-sqlite3+WAL+Migrations, eigene atomic-JSON-Settings, Zustand-Stores mit referenz-stabilen Selectors.
- **IPC-Sicherheit:** zod an jeder Boundary, Result-Pattern, `contextIsolation`+`sandbox`, default-deny Permission-Handler mit Clipboard-Whitelist, CSP doppelt (Meta+Header) dev/prod-aware.
- **Tabs:** alle xterm dauerhaft mounted, CSS-Toggle statt Snapshot. **Lifecycle** als zentrale State-Machine im Main; Phase-2-State-Detection verteilt: TUI fuer waiting/permission-prompt, JSONL fuer running/idle.

## Token-Tracking und Stats

- **JSONL-Pipeline:** chokidar (`ignored`-Predicate, kein Glob) + Per-Session-Polling-Ring (250ms). Resolver UUID-First (`jsonl_path` > `claude_session_id` > cwd-Fallback). Boot-One-Shot-Backfill mit MetaKv-Flag.
- **Datenmodell:** `messages` + `usage_buckets` parallel; Cache-Anteile getrennt seit Migration 0008 (Full-Rescan). Aggregations-Modi `rolling` / `reset_schedule` (DST-immun) / `session_block` (Default-by-Convention bei `window_hours ≤ 6`).
- **Stats-Domains:** eigene IPCs `stats:project-overview`/`stats:heatmap`/`stats:models`. Heatmap-Quartile aus nicht-leeren Tagen, 1fr/1fr-Stretch statt `aspect-ratio`.

## Sessions und Templates

- **Resume-Hotfix C:** `claude --session-id <takumi-uuid>` + Watcher-Backfill aus Filename (Migration 0003).
- **Season-Counter dynamisch** aus `MAX(sessions.season_number)+1`; Templates-Send alloziert atomar auf aktive Session.
- **Custom-Session-Typ** als Enum-Wert + `custom_type_label`-Spalte (Migration 0005), zod-`superRefine` als Pflicht-Guard.
- **Templates:** on-demand-Scan, beide Quellen separat, draggable Non-Modal-Panel, `## Vorlage`-Body-Extraktion mit Fallback. Tokens als YAML-Frontmatter-Schema (Variante B, `auto`/`input`-Discriminator) — unbekannte Tokens bleiben Literal.
- **Docs-Sync:** sechste Session-Art, hartcodierter Prompt, SHA-256-Hash im Summary-Frontmatter, NewSessionModal-Kontext-Block mit Markdown-Sections aus On-Demand-Files.

## Workspace, UI, Distribution

- **Workspace-Scanner:** Async-Walk mit Konkurrenz-Limit 4, Stop bei `CLAUDE.md`/`.git`. CLAUDE.md via gray-matter + zod-strict. Default-Project als FK-Lifeline mit cwd-Prefix-Remap.
- **Layout:** 4-Spalten-Grid 240/1.6fr/1fr/232, `frame:false` + td-titlebar uebernimmt komplett.
- **Settings:** Auto-Save 500ms (Coalescing), Live-JSON-Lint 300ms mit Apply-Knopf, 2-Spalten-Sidebar.
- **Projekt entfernen:** Hover-Trash + Modal + Doppel-Confirm + Hard-Delete-Bulk-Remap (kein Soft-Archive). **First-Start-Wizard:** Erledigt-Flag asymmetrischer Default.
- **Distribution:** Squirrel+ZIP parallel, kein Code-Signing (Phase 5+). Seed-basierte Native-Dep-Closure im ASAR (84.7→24.9 MiB). Electron 41 statt 42 wegen `better-sqlite3`-V8-13-Inkompatibilitaet.
