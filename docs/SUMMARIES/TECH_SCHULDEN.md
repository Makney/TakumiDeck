---
source: docs/TECH_SCHULDEN.md
source_hash: cc6f33451c2860af681ee021533ad7d1a936d9e486e6889204111f83208403a2
summarized_at: 2026-05-18T19:06:20Z
---

# TECH_SCHULDEN — Kompaktfassung

Bewusst aufgeschobene oder vereinfachte Loesungen — Code laeuft, ist aber wissentlich nicht optimal. Format pro Eintrag: Bereich · Was · Warum so · Risiko · Aufloesung (mit Trigger). Abgrenzung: ENTSCHEIDUNGEN.md = Why-Tradeoffs, FEATURES.md = neue Features, hier = bestehender Code mit bekannter Schuld. Erledigte Eintraege bleiben mit ✅+Datum stehen.

## Wiederkehrende Muster

- **Aufloesungs-Trigger statt vorzeitiger Refactor:** „beim N-ten Aufrufer" (3./4.), „beim ersten echten User-Schmerz", „bei naechster Erweiterung an dieser Stelle".
- **Pure-Logik akzeptiert oft schon den Aufholpfad** (Easter-Egg-`works`-Param, Markdown-Editor-Split-Ratio) — nur Settings-Schema+UI fehlen bis zum echten Bedarf.

## Refactor-Trigger (Duplikation und Komplexitaet)

- **DoubleConfirmButton-Pattern** in 3 Stellen (HistoryActionModal, RemoveProjectModal, SettingsModal/Retention) — Extraktion beim 4. Aufrufer.
- **Statement-Cache-Pattern** in 4 Repos (stats/model-stats/heatmap/meta-kv) — `StatementCache<K>`-Helper bei 4. Filter-Achse.
- **Session-Action-Pattern** (LeftSidebar+TabContainer) — `useSessionActions`-Hook bei 3. Aufrufer.
- **Spawn-Tracking als TabContainer-lokales State-Paar** — Variante B (Felder ins `SessionTab`-Schema heben) bei 3. Tracking-Container.
- **Komplexitaets-Hotspots:** TemplatesModal Cyclo 21/CRAP 462 (Sub-Hooks vor naechster Aenderung), state-detection-loop `tick` Cog 31 (`classifyNextStatus`-Extraktion bei naechster Status-Erweiterung Pflicht), `listHistoryForProject` Cyclo 25 (Filter-Stack-Refactor bei 5. Achse).
- **Modul-Zyklen-Risiko:** Pure-Helper gehoeren nach `components/*.ts`, nicht in `panels/*.tsx` (Lessons aus dem `prettyModelId`-Vorfall).

## Datenmodell-Drift und Edge-Cases

- **Pre-Hotfix-Sessions ohne JSONL bleiben resume-tot** + verlieren Token-Aggregate seit Migration 0008 (nicht reparabel ohne externe Daten; Sprint-8-UX-Hint deckt das ab).
- **Multi-Session-im-selben-cwd-Backfill nimmt nur die juengste** (Heuristik aus Sprint 5).
- **`messages.model`-Backfill mit `current_model`-Hint** (Pre-Migration-Verzerrung bei Modell-Wechsel, waechst von selbst raus).
- **Boot-Backfill-Flag setzt auch bei EACCES** — pragmatisches Best-Effort, EACCES im Daily-Use nicht realistisch.
- **Dead-Code:** `projects.next_season_number` seit Season 11, `SessionPatch.ended_at` TS-Type vs. zod-Drift (Lifecycle-Owned).
- **Renderer-FileTabs des entfernten Projekts werden nicht aufgeraeumt** (UI-unsichtbar, beim Restart weg).
- **Session-Mapping-Mehrdeutigkeit bei parallelen Tabs im selben cwd** (durch Season-9-UUID-First weitgehend abgeloest).

## UI-Polish und Komfort

- **Per-Tab-Font-Zoom nicht persistiert (Season 28):** Strg+Mausrad-Zoom lebt nur in React-`useState`. Drei Aufholpfade: (a) Global-Override im Settings-Schema [pragmatisch], (b) Per-Project in CLAUDE.md, (c) Per-Session in DB+Migration. Trigger: erste User-Inzidenz „mein Zoom haelt nicht".
- **Markdown-Editor-Split-Layout 50/50 fix (Season 24):** keine draggable Splitter, keine Pane-Groessen-Persistenz. Drei Aufholpfade: draggable Splitter, Settings-Slot `markdown_editor_split_ratio`, Per-Datei-Memory im FileTabsStore.
- **Easter-Egg-Werk-Liste hartcodiert (Season 19):** Pure-Logik nimmt bereits optionale `works`-Liste — K2-Aufholpfad braucht nur Settings-Schema+UI-Block.
- **Heatmap-Cells leicht rechteckig auf breiten Panes** (`aspect-ratio` raus wegen 300px-Bottom-Row-Clipping).
- **Wrap-Mechanismus Action-Bar:** min-width-Trick + Container-Query als Schutznetz (redundant, beide drin).
- **Squirrel-Installer ohne setupIcon und Branding** (Default-Electron-Icon).

## Konventionen, Build, Latenz

- **`exactOptionalPropertyTypes: false`** in tsconfig (kaskadiert ueber dutzende Optional-Properties).
- **Electron-Bump auf 42 blockiert** durch `better-sqlite3` V8-13-Inkompatibilitaet (Source-Bruch, nicht Toolchain) — Auflosung: bei jedem `better-sqlite3`-Release Prebuilds pruefen.
- **Build-CVE-Tail** (`tar`/`tmp`/`better-sqlite3`-Tarball, 28 CVEs) — Build-only, Upstream-Maintainer-Probleme.
- **Migration-Runner-Tests gegen Fake-Driver** statt echter SQLite (electron-rebuild-ABI-Konflikt mit Vitest).
- **`useUsageStore.refreshContext` feuert vor deferiertem `pty:create`** (zwei harmlose Console-Warns pro Tab-Open).
- **xterm-`dimensions`-Console-Error im Dev-StrictMode** (Production unbeeintraechtigt, xterm-Issue blockiert durch v5.5-Pin).
- **Notes-Auto-Save bei Hard-Quit best-effort** (kein synchroner IPC).
- **`awaitWriteFinish: 100ms`-Latenz im JSONL-Watcher** (durch Season-15-Polling-Ring mitigiert).
- **Reset-Berechnung im `usage:window`-Aggregat fehlt** (Sprint-9-UI-Slot, ✅ Season 16 aufgeloest).
- **Top-N fuer Schulden/Entscheidungen hartcodiert** (✅ Season 20 aufgeloest).

## Aufgeloeste Schulden (Auswahl)

Datei-Tab-Persistenz, Sensitive-Patterns konfigurierbar, Modell-Limits 1M→200k, Crash-Recovery fuer orphane Sessions (alle Sprint 8), Legacy-Sessions UI-blind (Sprint 6), Default-Project FK-Lifeline (Sprint 4), Empty-State `__default__` (Sprint 5), tote `.td-sidebar-*`-CSS (Sprint 7), AppSettings-Test-Fixture (Season 20), `latest.yml`-Manual-Script (Season 27 via CI), Reset-Berechnung im Aggregat (Season 16).
