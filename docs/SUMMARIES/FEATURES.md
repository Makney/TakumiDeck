---
source: docs/FEATURES.md
source_hash: 6af5884d9b61031caef1511d08dc01feb0b39ca9cc3444724d2c0c10e55a1eb6
summarized_at: 2026-05-31T14:39:24Z
---

# FEATURES — Kompaktfassung

Feature-Status-Matrix als Tabellen pro Sprint/Bereich. Legende: ✅ fertig · 🟡 teilweise · ⛔ offen. Pflege: nach jedem Feature Status setzen + CHANGELOG-Eintrag. Fertige Eintraege bleiben als Referenz (✅ + Datum).

## Gesamtstand

**Alle gelisteten Features stehen auf ✅** — kein offener (⛔) oder teilweiser (🟡) Eintrag. Phase 1 (MVP, Sprint 1–9) abgeschlossen 2026-05-12; Phase 2 laeuft trigger-getrieben und ist in der Matrix vollstaendig ✅.

## Phase 1 (Sprint 1–9, v0.1)

- **Foundation:** Electron-Skelett (Hardening sandbox/FuseV1/contextIsolation), typed IPC + zod-Boundaries + Result-Pattern, better-sqlite3 (WAL, Migrations-Runner), atomic-JSON-Settings.
- **Sessions/Workspace:** @lydell/node-pty-Spawn, xterm.js v5.5, Multi-Tab (dauerhaft mounted), Lifecycle-State-Machine, Resume, Modell-Auswahl, Notizen, Copy/Paste; Async-Walk-Scanner, gray-matter+zod-CLAUDE.md-Parser, Project-Sidebar.
- **Token-Dashboard:** chokidar-JSONL-Watcher, messages+usage_buckets-Aggregat, P90 (rolling 192h + Fallback), UsageBar + Recharts-Detail.
- **Editor/Chrome/Polish:** CodeMirror 6 (Markdown/YAML-Lint/Preview), unifiedMergeView-Diff, PreCommitModal, 36px-Titlebar, 4-Spalten-Grid, Settings-Modal (6 Tabs), Error-Handling-Mix, Squirrel+ZIP-Build.

## Phase 2 (v1.0, Season 1–34) — alle ✅

Nach Bereichen: **Sessions** (volle State-Detection, Trigger-Buttons, Eigene/Terminal/Docs-Sync-Session-Arten, Polling-Ring, UUID-Mapping, Buffer-Persistierung, erweiterbare Modell-Liste), **Terminal** (Screenshot-DnD/-Retention, 14-Hebel-Polish), **Projekt-Verwaltung** (Entfernen, First-Start-Wizard), **Token-Dashboard** (Soft-Warning, Modell-Filter, Reset-Schedule, 5h-Block, Reset-Footer, Wochen-Reset, Cache-Hit), **Stats/Heatmap** (8 Cards, Heatmap, Modelle-View, Easter-Egg, 30d/7d), **Templates** (Auto-Vars, draggable Panel, Top-N), **Docs-Sync** (Sync- + Kontext-Session), **Editor** (Side-by-Side), **Settings/Persistenz** (Schema-Versionierung), **Build** (Auto-Update, CI-Pipeline), **Right-Pane-Polish** (Filter, Sensitive-Confirm, Git-Marker), **Diff-Viewer** (Multi-Tab-Diff).

## Pflege-Hinweise

Ein Feature pro Zeile, gegliedert nach Sprint/Roadmap. Phase-3-Block waechst erst, sobald Phase 2 vollstaendig ✅ ist.
