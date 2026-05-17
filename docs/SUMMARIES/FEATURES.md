---
source: docs/FEATURES.md
source_hash: e7f265d6bacff9e7b63614f0a321d2976f9a4fd0270a7ebd596657d5c43a9de8
summarized_at: 2026-05-17T13:33:29Z
---

# FEATURES-Kompaktfassung

Feature-Matrix mit Status ✅ fertig · 🟡 teilweise · ⛔ offen. Pflege-Regel: nach jeder Umsetzung Status hier setzen + CHANGELOG-Eintrag.

## Phase 1 (v0.1) — vollstaendig ✅

Alle Sprint-1–9-Blocks auf ✅, abgeschlossen am 2026-05-12.

- **Foundation:** Electron-Skelett, IPC mit zod, SQLite/WAL/Migrations, Settings (eigene atomic-JSON-Ops).
- **Sessions:** @lydell/node-pty-Spawn, xterm.js v5.5 Canvas, Multi-Tab mit dauerhaft-mounted xterm, zentrale Lifecycle-State-Machine, Resume, NewSessionModal, reduzierte State-Detection (3s-Timestamp), Notizen mit Multi-Trigger-Save, Copy/Paste mit drei Bindings.
- **Workspace:** Async-Walk-Scanner mit Konkurrenz-Limit, gray-matter-CLAUDE.md-Parser, 3-Sektionen-Sidebar.
- **Token-Dashboard:** chokidar-Watcher + messages/usage_buckets, P90-Detection mit Fallback, CSS-Bars + Recharts im Detail-Modal.
- **Templates/Season-Tracker:** on-demand-Discovery (global + projekt), Variable-Filling mit Live-Preview, Bracketed-Paste-Send, Verlauf-Panel als Replace-View, atomare Season-Nummerierung.
- **Editor + Git:** CodeMirror 6 (lang-markdown/yaml), oneDark+Custom-Theme, manueller Save, YAML-Validator (js-yaml), Preview-Toggle, unifiedMergeView-Diff, PreCommitModal mit Sensitive-File-Warnung.
- **App-Chrome + Polish:** 36-px td-titlebar (`frame:false`), 4-Spalten-Grid, Settings-Modal mit 6 Tabs + Sidebar-Layout, Auto-Save 500ms, Error-Handling-Mix, Squirrel+ZIP-Distribution.

## Phase 2 (v1.0) — laufend

- **✅ Sessions:** Volle State-Detection (TUI+JSONL), Trigger-Phrasen-Pillen aus Frontmatter, Eigene Session-Art mit Freitext-Label, JSONL-Polling-Ring, UUID-Pfad-Mapping (`jsonl_path`-Spalte), Boot-Backfill.
- **✅ Terminal/Projekt:** Screenshot-Drag-and-Drop + Clipboard-Paste, Screenshot-Retention mit Manual-Clear, Projekt entfernen mit Bulk-Remap, First-Start-Workspace-Wizard.
- **✅ Token-Dashboard:** 20%-Kontext-Soft-Warning, Modell-Filter im Verlauf, Reset-Schedule-Aggregation, 5h-Session-Block (User-Trigger), Reset-Footer, Wochen-Reset-UI, Cache-Hit-Statistik (Migration 0008 mit Full-Rescan).
- **✅ Stats:** acht Stats-Cards, GitHub-Heatmap, Modelle-View, Easter-Egg-Werk-Vergleiche, 30d/7d-Filter.
- **✅ Templates/Docs-Sync:** Erweiterte Variablen (`LETZTE_SEASON_NAME`/`TECH_SCHULDEN_RELEVANT`/`LETZTE_ENTSCHEIDUNGEN`), Top-N konfigurierbar, draggable Non-Modal-Panel, Docs-Sync-Session (Hash-basierter Stale-Check), Kontext-Checkbox aus On-Demand-Files.
- **⛔ Offen:** Markdown-Preview Side-by-Side, Auto-Update via electron-updater, GitHub-Actions-Pipeline, Datei-Browser-Filter/-Status-Indikatoren, Sensitive-Pattern-UI-Verfeinerung, Multi-Tab-Diff.

## Pflege-Hinweise

Ein Feature pro Zeile, gegliedert nach Sprints/Roadmap. Fertige Eintraege werden nicht entfernt — ✅+Datum bleiben als Referenz. Phase-3-Block waechst erst, sobald Phase 2 vollstaendig ✅ ist.
