---
source: docs/CHANGELOG.md
source_hash: 4611a5bb888a7b8d9026d2f1a2211b992b1713225ce26b781dce9f747d914a48
summarized_at: 2026-05-31T14:39:24Z
---

# CHANGELOG — Kompaktfassung

Chronologisches Protokoll **abgeschlossener** Dev-Sessions (neuster zuerst). Pro Eintrag: Datum · Version · Season/Sprint · Titel, darunter „Was jetzt geht" (Nutzer-Mehrwert) + „Architektur-Notiz" (Variantenwahl + Begruendung). Keine Datei-Listen — Git liefert das.

## Zeitleiste

- **Phase 1 / MVP (v0.1, Sprint 1–9, 2026-05-09 bis -12):** Foundation (Electron+Forge+Vite+React, typed IPC, SQLite, Settings) → Multi-Session/PTY/xterm → Workspace-Scanner → Token-Dashboard → Templates + Season-Tracker → Editor+Git+Right-Pane → App-Chrome → Polish → Pre-Release-QA (UI-Vergleich, Code-Review, Security-Bump Electron 33→41 / Vite 5→6).
- **Phase 2 (v0.2–v0.4, Season 1–34, ab 2026-05-12):** Volle State-Detection, Screenshot-DnD+Retention, Trigger-Pillen, erweiterte Templates, Eigene/Terminal/Docs-Sync-Session-Arten, Live-Token-Polling + UUID-Path-Mapping + Boot-Backfill, Reset-Schedule/Cache-Hit/5h-Session-Block, Stats-Cards/Heatmap/Modelle-View, Easter-Egg, Workspace-Wizard, Settings-Schema-Versionierung, Auto-Update + GitHub-Actions-Pipeline, Terminal-Polish, Multi-Tab-Diff, UI-Overhaul (symmetrische Sidebars, 36px-Header-Band), Buffer-Persistierung, user-erweiterbare Modell-Liste (Opus 4.8).
- **Bugfixes** durchgaengig dazwischen: Resume-UNIQUE-Constraint (mehrfach), WebGL-Dispose-Race, 5h-Block-Anker, generate-latest-yml Windows-Pfad, Ctrl+C-Copy.

## Wiederkehrende Muster

- **Variants-first:** nicht-triviale Seasons starten mit A/B/C + Aufwand-Tabelle + Empfehlung; User entscheidet.
- **Pure-Helper + duenner Adapter:** Logik in `src/shared/*` oder `components/*.ts`, IPC/UI als Adapter — Tests ohne Electron/xterm/SQLite.
- **Backward-Compat via Default-Merge:** Schema-Erweiterungen migrieren Bestandsuser beim ersten Read; Migrationen additiv/idempotent (0005–0010).
- **Targeted-Tests pro Season** (CLAUDE.md-Regel); jeder Eintrag endet mit gruener Suite + sauberem typecheck/lint.
- **Reuse statt Neubau** (Bracketed-Paste, `fs:changed`-Watcher, Stats-IPCs) und **Defense-in-Depth** bei third-party Bugs (ErrorBoundary, safeDispose).
