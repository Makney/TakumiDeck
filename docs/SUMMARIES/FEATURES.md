---
source: docs/FEATURES.md
source_hash: 28dfab902aab15d5e57c7f1ba6f977533eb2a21776889f5f6b3fde8e640d4793
summarized_at: 2026-05-20T16:30:40Z
---

# FEATURES — Kompaktfassung

Feature-Matrix als Tabellen pro Sprint/Phase. Legende: ✅ fertig · 🟡 teilweise · ⛔ offen. Pflege: nach jedem Feature Status setzen + CHANGELOG-Eintrag anlegen.

## Phase 1 (Sprint 1–9, v0.1) — vollstaendig ✅

Abgeschlossen am 2026-05-12.

- **Foundation:** Electron+Forge+Vite+React (Hardening: sandbox, FuseV1, contextIsolation), typed IPC mit zod+Result-Pattern, better-sqlite3+WAL+Migrations-Runner, eigene atomic-JSON-Settings.
- **Sessions:** @lydell/node-pty-Spawn (NAPI), xterm.js v5.5 Canvas+Addons, Multi-Tab mit dauerhaft-mounted xterm (Variante A), zentrale Lifecycle-State-Machine, Resume mit gespeichertem cwd/Modell, NewSessionModal mit Modell-Dropdown, reduzierte State-Detection (3s-Timestamp), Notes-Footer mit Multi-Trigger-Save, Smart Copy/Paste (drei Bindings, Bracketed-Paste).
- **Workspace:** Async-Walk-Scanner mit Konkurrenz-Limit (max-depth 5), gray-matter+zod-CLAUDE.md-Parser, 240px-Sidebar mit Per-Projekt-Tab-Filter + Legacy-Bucket.
- **Token-Dashboard:** chokidar-JSONL-Watcher (kein Glob), messages+usage_buckets-Aggregat, P90 rolling 192h mit Fallback, UsageBar-CSS + Recharts-Detail-Modal.
- **Templates/Season-Tracker:** on-demand-Scan (global+projekt+Legacy), Variable-Filling mit Auto+User-Vars, Bracketed-Paste-Send via `td-template-send`-CustomEvent, atomare Season-Nummerierung, Verlauf-Panel als Replace-View mit Filter+Detail.
- **Editor+Git:** CodeMirror 6 (lang-markdown/yaml), oneDark+Custom-Theme, manueller Save mit Dirty-Indikator, js-yaml-Validierung mit 500ms-Debounce, react-markdown-Preview, `@codemirror/merge.unifiedMergeView`-Diff, PreCommitModal mit Sensitive-File-Warnung.
- **App-Chrome+Right-Pane+Polish:** 36px td-titlebar (`frame:false`), 4-Spalten-Grid (240/1fr/1fr/232), Per-Projekt-Datei-Tabs, Datei-Browser mit Skip-Liste, Settings-Modal mit 6 Tabs+Sidebar-Layout+Auto-Save+CodeMirror-JSON-Editor, V7-C-Error-Handling-Mix, Squirrel+ZIP-Distribution.
- **Pre-Release-QA:** Zwei-Pass-UI-Vergleich, Code-Review-Pass (398/398 Tests gruen), Electron 33→41 + Vite 5→6 Security-Bump.

## Phase 2 (v1.0, in Entwicklung)

- **✅ Sessions:** Volle State-Detection (TUI-Patterns+JSONL-Timestamp-Loop), Trigger-Phrasen-Pillen aus Frontmatter, Eigene Session-Art mit Freitext-Label (Migration 0005), JSONL-Polling-Ring (250ms), UUID-basiertes Session-Mapping (`jsonl_path`-Spalte + 3-Stufen-Resolver, Migration 0007), Multi-Session-cwd-Backfill (Boot-One-Shot).
- **✅ Terminal:** Screenshot-Drag-and-Drop + Clipboard-Paste (`fs:save-screenshot`), Screenshot-Retention (Boot-One-Shot, Manual-Clear), Terminal-Polish (14 Hebel: WebGL+Canvas-Fallback, TUI-Poll-Pause, Instant-Scroll, Scrollback 5000, Strg+Shift+F/L, Scroll-to-Bottom-Button, Bell-Pulse, Strg+1..9, Strg+Mausrad-Zoom, Rechtsklick-Menue).
- **✅ Projekt-Verwaltung:** Projekt entfernen mit Hover-Trash+Doppel-Confirm+Bulk-Remap (Default-Bucket immutable), First-Start-Workspace-Wizard.
- **✅ Token-Dashboard:** 20%-Kontext-Soft-Warning, Modell-Filter im Verlauf-Panel (Migration 0006), Reset-Schedule-Aggregation, 5h-Session-Block-Aggregat (ms-praeziser Anker via `messages.ts` seit v0.3.0-Bugfix), Reset-Footer unter Plannutzungs-Bars, Wochen-Reset-UI, Cache-Hit-Statistik (Migration 0008 + Full-Rescan).
- **✅ Stats & Heatmap:** 8 Stats-Cards (4x2-Grid), GitHub-Style-Heatmap mit Quartilen, Modelle-View mit Cache-Hit-Spalte, Easter-Egg-Werk-Vergleiche, 30d/7d-Filter.
- **✅ Templates:** Erweiterte Auto-Variablen (`LETZTE_SEASON_NAME`/`TECH_SCHULDEN_RELEVANT`/`LETZTE_ENTSCHEIDUNGEN`), draggable Non-Modal-Panel, Top-N konfigurierbar.
- **✅ Docs-Sync:** Docs-Sync-Session (6. Session-Art, SHA-256-Stale-Check), Kontext-Checkbox-Erweiterung aus `on_demand_files`.
- **✅ Editor:** Markdown-Preview Side-by-Side (Drei-Modi-Toolbar, prozentuales Sync-Scrolling, `display:none`-Mount, `remark-gfm`).
- **✅ Settings & Persistenz:** Settings-Schema-Versionierung (Variante B, defensive Drift-Detection).
- **✅ Build & Distribution:** Auto-Update via electron-updater, GitHub-Actions-Build-Pipeline (Tag-Push `v*` → Single-Job auf `windows-latest`).
- **✅ Diff-Viewer:** Multi-Tab-Diff (Working/Staged/Session-Pillen, Migration 0009 `start_commit_sha`, `git:show-staged`+`git:session-diff`-IPCs, Auto-Open-Pairing, chokidar-Auto-Refresh mit Dirty-Tab-Schutz).
- **⛔ Right-Pane-Polish:** Datei-Browser-Filter, Sensitive-Pattern-UI-Verfeinerung, Datei-Browser-Status-Indikatoren.

## Pflege-Hinweise

Ein Feature pro Zeile, gegliedert nach Sprints/Roadmap. Fertige Eintraege werden NICHT entfernt — ✅+Datum bleiben als Referenz. Phase-3-Block waechst erst, sobald Phase 2 vollstaendig ✅ ist.
