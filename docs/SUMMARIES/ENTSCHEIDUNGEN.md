---
source: docs/ENTSCHEIDUNGEN.md
source_hash: 45bba427a522dbf49d7c5de9c1fa3671339c1e3b83b4af9fa2965a310b4fcbb6
summarized_at: 2026-05-31T14:39:24Z
---

# ENTSCHEIDUNGEN — Kompaktfassung

Architektur- und Scope-Entscheidungsregister (newest first) mit „Warum nicht die andere Variante?". Format pro Eintrag: Entscheidung · Varianten (A/B/C, gewaehlte markiert) · Grund · Konsequenz · optional Implementierungsdetail. ~90 Eintraege von Sprint 1 bis Phase-2-Season-34.

## Durchgaengige Leitprinzipien

- **Variants A/B/C vor Code** mit Aufwand + klarer Empfehlung; User entscheidet.
- **Pure-Logik isolieren** (Driver-Injection, `src/shared/`/`components/`): Tests ohne Electron/SQLite/xterm.
- **Pragmatisch vor invasiv:** Lazy-Pull, on-demand-Scan, additiv statt strukturellem Bruch; Migration vermeiden (Default-Merge, abgeleitete Werte statt neuer Spalten).
- **„Konvenient vor traditionell"** als Daily-Driver-Default; **Vorlage > eigene Drift** bei Konflikt; **minimal-invasive Build-Stack-Aenderungen** (Forge/Vite/Squirrel bleiben).
- **Defense-in-Depth** bei third-party Bugs (ErrorBoundary, safeDispose) statt stummem Schluck.

## Thematische Cluster

- **Token/Usage:** UUID-First-Resolver mit cwd-Fallback, messages-basierter ms-praeziser 5h-Block-Anker, Session-Block- vs. Rolling- vs. reset_schedule-Aggregat (DST-immun), Cache-Hit per Full-DELETE-Migration, Per-Session-Live-Polling parallel zu chokidar, Boot-One-Shot-Backfill mit MetaKv-Flag.
- **Stats:** Lazy-Pull-IPCs (keine Vorab-Aggregat-Tabelle), parallele Endpunkte fuer Heatmap/Modelle, Quartil-Farbskala aus nicht-leeren Tagen, 1fr/1fr-Stretch, Streak „heute-oder-gestern".
- **Sessions/Terminal:** Lifecycle-Reducer im Main, TUI- vs. JSONL-State-Detection, Inline-Gates + Modell-Sentinel fuer Terminal-Sessions, Buffer-Persistierung (Scope-Cut auf Terminal-Typ), dauerhaft gemountete xterm-Instanzen, Custom-Type-Label-Spalte.
- **Editor/Diff/Right-Pane:** unifiedMergeView pro Datei, Multi-Tab-Diff-Pillen, Auto-Open-Pairing, Auto-Refresh via Main-Watcher-Push, localStorage statt Settings fuer UX-Memory, Side-by-Side-Default + prozentuales Sync-Scroll, remark-gfm.
- **Templates/Docs-Sync:** YAML-Frontmatter-Token-Schema, hartcodierter Docs-Sync-Prompt mit SHA-256-Hash, Kontext-Checkbox aus `on_demand_files`.
- **Build/Release:** electron-updater auf Forge/Squirrel + manuelles latest.yml, Full-CI-Pipeline (Variante B), Settings-Schema-Versionierung mit defensiver Drift-Detection.
- **Foundation:** @lydell/node-pty (NAPI), xterm v5.5-Pin, eigene Settings-JSON-Ops, zod an allen IPC-Boundaries, default-deny Permission-Handler, Seed-basierte ASAR-Native-Dep-Closure, Electron 41 statt 42.
