---
source: docs/ENTSCHEIDUNGEN.md
source_hash: 71bcb8d01f2c27dc43a5d3b5331d4fd25738d17e9d44bf3dc51e3d6c2d870b2f
summarized_at: 2026-05-20T16:30:40Z
---

# ENTSCHEIDUNGEN — Kompaktfassung

Architektur- und Scope-Entscheidungen mit „Warum nicht die andere Variante?". Format pro Eintrag: Entscheidung · Varianten (A/B/C, gewaehlte markiert) · Grund · Konsequenz · optional Implementierungsdetail. Neue Eintraege wandern oben an, kein Datum im Titel (Git liefert das).

## Wiederkehrende Muster

- **Variants A/B/C vor Code** mit Aufwand und Empfehlung; User entscheidet.
- **Pragmatisch vor invasiv:** Lazy-Pull, on-demand-Scan, additiv statt strukturellem Bruch.
- **Driver-Injection + Pure-Logik** in `src/shared/`/`components/`: Tests laufen ohne Electron/SQLite/xterm.
- **„Konvenient vor traditionell"** als Daily-Driver-Default (Side-by-Side-Markdown, Auto-Update als Banner, User-Werte ueberleben Migrations).
- **Spec > UX-Default** (manueller Markdown-Save trotz Notes-Auto-Save-Konvention).
- **Vorlage > eigene Drift** bei Konflikt (Window-Frame-Tabs, UsageBar-Zeile, Settings-Sidebar).
- **Minimal-invasive Build-Stack-Aenderungen:** Forge/Vite/Squirrel bleiben (electron-updater statt electron-builder), weil Forge-Vite-Externals-Falle in Phase 1 schon Tag gekostet hat.
- **Defense-in-Depth bei third-party Bugs:** Symptom-Abfang + globaler Sicherheits-Ring (ErrorBoundary, safeDispose) statt stummen Schluck.

## Aktuelle Entscheidungen (Bugfixes + Season 24–29)

- **Renderer-Crash-Schutz: ErrorBoundary + Pre-Dispose (C):** `safeDispose*`-Helper + `ErrorBoundary` ueber `<App>`. A (nur try/catch) maskiert Diagnose; B (Pre-Dispose-only) loest nur das aktuelle Symptom; C bringt Defense-in-Depth fuer kuenftige Effect-Cleanup-Bugs.
- **5h-Block-Anker aus `messages.ts` (A):** ms-praeziser Anker via `MessageRepository.timestampsInRange`, Token-Summe bleibt bucket-basiert (Stunden-Drift <1%). B (eigene `session_blocks`-Tabelle) bringt zweite Source of Truth; C (`first_token_ts` pro Session) ist konzeptuell falsch fuer globale Limits.
- **Multi-Tab-Diff: Pillen-Toggle (A):** Drei Modi in der bestehenden Pane statt drei separater Tabs (B, toter Tab bei leerer Session) oder Stacked-View (C, Pixel-Verschwendung).
- **Always-visible-Diff: Auto-Open-Pairing (A):** Diff-Tab oeffnet beim Projekt-Wechsel, Klick auf Diff-File oeffnet Editor-Tab im Hintergrund. B (Inline-Diff-Marker im Editor) bricht Read-Only-Trennung.
- **Diff/Editor-Auto-Refresh: chokidar im Main + IPC-Push (A):** Gleiche Library wie JSONL-Watcher, Push-Modell verbraucht CPU nur bei Aenderungen. B (Renderer-Poll) treibt Akku-Last; C (PTY-Exit-Trigger) verpasst externe Edits.
- **Terminal-Renderer WebGL primaer mit Canvas-Fallback (A):** `@xterm/addon-webgl@0.19.0` + `loadRendererAddonWithFallback`-Helper. B (Canvas bleiben) waere Half-Fix bei N Tabs mit aktiven Animationen; C (Library-Wechsel) Over-Reach.
- **`smoothScrollDuration: 0` (Instant) statt Easing-Animation:** B (125ms) war Anfangsfehler — Easing-Animation pro Wheel-Tick addiert subjektive Latenz statt sie zu reduzieren. Konvention: Windows Terminal/iTerm/alacritty.
- **GitHub-Actions Full-Pipeline (B):** Workflow legt Release-Objekt selbst an (idempotent), Pre-Release-Flag aus Tag-Suffix (`-alpha`/`-beta`/`-rc`). A (Minimal/Upload-only) loest nur halbe Reibung; C (Matrix fuer macOS/Linux) Over-Engineering ohne Roadmap-Trigger.
- **Auto-Update electron-updater + Forge/Squirrel (A):** Roadmap-Wortlaut woertlich erfuellt, kein Build-Stack-Bruch. B (electron-builder) wuerde Forge-Externals-Falle neu freilegen. C (`update.electronjs.org`) verschenkt UX-Kontrolle.
- **Settings-Schema-Versionierung Pipeline + defensive Drift-Detection (B):** Migration 1→2 raeumt vier Default-Drifts nur bei exaktem alten Default — User-Anpassungen ueberleben. A (strikt ueberschreibend) buegelt Customizing weg; C (Deep-Merge ohne Version) skaliert nicht ueber Trivial-Drifts.
- **Markdown-Editor Side-by-Side als Default + prozentuales Sync-Scrolling (B+S1):** CodeMirror bleibt mounted via `display:none`, `active`-Flag+RAF-Reset verhindert Echo-Schleife. S2 (Heading-Anchor) bruechig bei Code-Bloecken/Tabellen.
- **GFM-Tabellen via `remark-gfm`** statt eigenem Parser oder Server-seitiger HTML-Transformation.

## Templates, Docs-Sync, Sessions

- **Template-Tokens als YAML-Frontmatter-Schema (B):** `auto`/`input`-Discriminator, Tokens ohne Schema bleiben Literal (kein Warnblock). A (Hardcoded-Listen erweitern) skaliert nicht; C (Auto-Discovery) verschenkt Semantik.
- **Docs-Sync-Session E1+P1+S1+H1:** sechste Session-Art im NewSessionModal, hartcodierter Prompt aus `shared/docs-sync.ts`, Inline-Status, SHA-256-Hash im Summary-Frontmatter.
- **Kontext-Checkbox A1+B1+C1+D1:** zweiter Block im NewSessionModal, Status-sortiert, Markdown-Section pro Datei, Pure-Helper in bestehender `docs-sync.ts`.
- **Resume-Hotfix C:** `claude --session-id <takumi-uuid>` + Watcher-Backfill aus Filename (Migration 0003).
- **Resume-UNIQUE-Hotfix v0.2.1 (A):** TabContainer raeumt `spawnedIds`+`initialPrompts` in `handleClose` mit auf. B (Schema-Felder heben) als TECH_SCHULDEN-Trigger.
- **Custom-Session-Typ:** Enum-Wert + `custom_type_label`-Spalte (Migration 0005), zod-`superRefine` als Pflicht-Guard.

## Architektur-Saeulen

- **Stack:** @lydell/node-pty NAPI (kein Rebuild), xterm.js v5.5 (kein v6 wegen Canvas-Renderer-Removal), better-sqlite3+WAL+Migrations, eigene atomic-JSON-Settings, Zustand-Stores mit referenz-stabilen Selectors.
- **IPC-Sicherheit:** zod an jeder Boundary, Result-Pattern, `contextIsolation`+`sandbox`, default-deny Permission-Handler mit Clipboard-Whitelist, CSP doppelt (Meta+Header) dev/prod-aware.
- **Tabs:** alle xterm dauerhaft mounted, CSS-Toggle statt Snapshot. Lifecycle als zentrale State-Machine im Main; Phase-2-State-Detection verteilt (TUI fuer waiting/permission-prompt, JSONL fuer running/idle).

## Token-Tracking, Stats, Workspace, Distribution

- **JSONL-Pipeline:** chokidar (`ignored`-Predicate, kein Glob) + Per-Session-Polling-Ring (250ms). Resolver UUID-First (`jsonl_path` > `claude_session_id` > cwd-Fallback). Boot-One-Shot-Backfill mit MetaKv-Flag.
- **Datenmodell:** `messages`+`usage_buckets` parallel; Cache-Anteile getrennt seit Migration 0008 (Full-Rescan). Aggregations-Modi `rolling`/`reset_schedule` (DST-immun)/`session_block` (Default-by-Convention bei `window_hours ≤ 6`, ms-praezise via `messages.ts`).
- **Stats-Domains:** eigene IPCs `stats:project-overview`/`stats:heatmap`/`stats:models`. Heatmap-Quartile aus nicht-leeren Tagen, 1fr/1fr-Stretch statt `aspect-ratio`.
- **Workspace-Scanner:** Async-Walk mit Konkurrenz-Limit 4, Stop bei `CLAUDE.md`/`.git`. Default-Project als FK-Lifeline mit cwd-Prefix-Remap.
- **Distribution:** Squirrel+ZIP parallel, kein Code-Signing (Phase 5+). Seed-basierte Native-Dep-Closure im ASAR (84.7→24.9 MiB). Electron 41 statt 42 wegen `better-sqlite3`-V8-13-Inkompatibilitaet.
