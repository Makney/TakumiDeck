---
source: docs/TECH_SCHULDEN.md
source_hash: 95221912b354a6d055e6380a0bcd97369f821b7e0c30ed153cf2540938575760
summarized_at: 2026-05-20T16:30:40Z
---

# TECH_SCHULDEN — Kompaktfassung

Bewusst aufgeschobene oder vereinfachte Loesungen — Code laeuft, ist aber wissentlich nicht optimal. Format pro Eintrag: Bereich · Was · Warum so · Risiko · Aufloesung (mit Trigger). Abgrenzung: ENTSCHEIDUNGEN.md = Why-Tradeoffs, FEATURES.md = neue Features, hier = bestehender Code mit bekannter Schuld. Erledigte Eintraege bleiben mit ✅+Datum stehen.

## Wiederkehrende Muster

- **Aufloesungs-Trigger statt vorzeitiger Refactor:** „beim N-ten Aufrufer" (3./4.), „beim ersten echten User-Schmerz", „bei naechster Erweiterung an dieser Stelle".
- **Pure-Logik akzeptiert oft schon den Aufholpfad** (Easter-Egg-`works`-Param, Markdown-Editor-Split-Ratio) — nur Settings-Schema+UI fehlen bis zum echten Bedarf.
- **Defense-in-Depth bei third-party Bugs:** Symptom-Abfang mit Diagnose-Warn als Library-Bump-Trigger statt stummen Schluck (z.B. `[safeDispose]`-Log).

## Third-party und Build

- **`@xterm/addon-webgl@0.19.0` Dispose-Bug (Bugfix 2026-05-19):** WebGL-Init nicht durch + Tab-Close = `TypeError '_isDisposed'`. Symptom abgefangen via `safeDispose*`-Helper + ErrorBoundary. Trigger: `npm outdated`-Pass nach `^0.20.0`.
- **Electron-Bump auf 42 blockiert** durch `better-sqlite3` V8-13-Inkompatibilitaet (Source-Bruch, nicht Toolchain) — Auflosung: bei jedem `better-sqlite3`-Release Prebuilds pruefen.
- **Build-CVE-Tail** (`tar`/`tmp`/`better-sqlite3`-Tarball, 28 CVEs) — Build-only, Upstream-Maintainer-Probleme.
- **Migration-Runner-Tests gegen Fake-Driver** statt echter SQLite (electron-rebuild-ABI-Konflikt mit Vitest).

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

- **Auto-Refresh ueberschreibt Dirty-Tabs nicht — aber zeigt auch keinen Warn-Marker (Season 29):** Externe Aenderung im Dirty-Tab geht beim naechsten Ctrl+S verloren. Drei Sub-Entscheidungen offen (Marker-Position/Action/Re-Sync). Trigger: erste Daily-Use-Inzidenz.
- **Per-Tab-Font-Zoom nicht persistiert (Season 28):** Strg+Mausrad-Zoom lebt nur in React-`useState`. Drei Aufholpfade: Global-Override [pragmatisch] / Per-Project / Per-Session+Migration.
- **Markdown-Editor-Split-Layout 50/50 fix (Season 24):** keine draggable Splitter, keine Pane-Groessen-Persistenz. Aufholpfad: Splitter, Settings-Slot, Per-Datei-Memory.
- **Easter-Egg-Werk-Liste hartcodiert (Season 19):** Pure-Logik nimmt bereits optionale `works`-Liste — K2-Aufholpfad braucht nur Settings-Schema+UI-Block.
- **Heatmap-Cells leicht rechteckig auf breiten Panes** (`aspect-ratio` raus wegen 300px-Bottom-Row-Clipping).
- **Wrap-Mechanismus Action-Bar:** min-width-Trick + Container-Query als Schutznetz (redundant, beide drin).
- **Squirrel-Installer ohne setupIcon und Branding** (Default-Electron-Icon).

## Konventionen, Latenz

- **`exactOptionalPropertyTypes: false`** in tsconfig (kaskadiert ueber dutzende Optional-Properties).
- **`useUsageStore.refreshContext` feuert vor deferiertem `pty:create`** (zwei harmlose Console-Warns pro Tab-Open).
- **xterm-`dimensions`-Console-Error im Dev-StrictMode** (Production unbeeintraechtigt, xterm-Issue blockiert durch v5.5-Pin).
- **Notes-Auto-Save bei Hard-Quit best-effort** (kein synchroner IPC).
- **`awaitWriteFinish: 100ms`-Latenz im JSONL-Watcher** (durch Season-15-Polling-Ring mitigiert).

## Aufgeloeste Schulden (Auswahl)

Datei-Tab-Persistenz, Sensitive-Patterns konfigurierbar, Modell-Limits 1M→200k, Crash-Recovery fuer orphane Sessions (alle Sprint 8), Legacy-Sessions UI-blind (Sprint 6), Default-Project FK-Lifeline (Sprint 4), Empty-State `__default__` (Sprint 5), tote `.td-sidebar-*`-CSS (Sprint 7), AppSettings-Test-Fixture (Season 20), `latest.yml`-Manual-Script (Season 27 via CI), Reset-Berechnung im Aggregat (Season 16), Top-N hartcodiert (Season 20).
