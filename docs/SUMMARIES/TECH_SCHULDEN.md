---
source: docs/TECH_SCHULDEN.md
source_hash: 42698507f0cf72f8a2954b7fc8a550cb1f3b731edbb8c8dd573b38dc2873fef8
summarized_at: 2026-05-17T13:33:29Z
---

# TECH_SCHULDEN-Kompaktfassung

Bewusst aufgeschobene oder vereinfachte Loesungen — Code laeuft, ist aber wissentlich nicht optimal. Abgrenzung: ENTSCHEIDUNGEN.md = Why-Tradeoffs, FEATURES.md = neue Features, hier = bestehender Code mit bekannter Schuld. Format pro Eintrag: Bereich · Was · Warum so · Risiko · Aufloesung.

## Wiederkehrende Muster

- **Aufloesungs-Trigger statt vorzeitiger Refactor:** „beim N-ten Aufrufer" (3. oder 4.), „beim ersten echten User-Schmerz", „bei naechster Erweiterung an dieser Stelle".
- **Erledigte Eintraege bleiben** mit ✅+Datum stehen (Sprint-2/3-Legacy ✅, Datei-Tab-Persistenz/Sensitive-Patterns/Modell-Limits/Crash-Recovery ✅ Sprint 8, Settings-Fixture ✅ Season 20).

## Refactor-Trigger (Duplikation und Komplexitaet)

- **DoubleConfirmButton-Pattern** in HistoryActionModal, RemoveProjectModal, SettingsModal/Retention — Extraktion beim vierten Aufrufer.
- **Statement-Cache-Pattern** in vier Repos (stats/model-stats/heatmap/meta-kv) — `StatementCache<K>`-Helper bei vierter Filter-Achse.
- **Session-Action-Pattern** (LeftSidebar + TabContainer) — `useSessionActions`-Hook bei drittem Aufrufer.
- **Komplexitaets-Hotspots:** TemplatesModal Cyclo 21 (Sub-Hooks vor naechster Aenderung), state-detection-loop `tick` Cog 31 (`classifyNextStatus` bei naechster Status-Erweiterung Pflicht), `listHistoryForProject` Cyclo 25 (Filter-Stack-Refactor bei fuenfter Achse).
- **Modul-Zyklen-Risiko:** Pure-Helper gehoeren nach `components/*.ts`, nicht in `panels/*.tsx`.

## Datenmodell-Drift und Edge-Cases

- **Pre-Hotfix-Sessions ohne JSONL bleiben resume-tot** + verlieren Token-Aggregate seit Migration 0008; Sprint-8-UX-Hint deckt das ab.
- **Multi-Session-im-selben-cwd-Backfill nimmt nur die juengste.**
- **Dead-code:** `projects.next_season_number` seit Season 11, `SessionPatch.ended_at` TS-Type vs. zod-Drift.
- **Approximationen:** `messages.model`-Backfill ungenau bei Modell-Wechsel (waechst raus), Boot-Backfill-Flag setzt auch bei EACCES.
- **Renderer-FileTabs des entfernten Projekts werden nicht aufgeraeumt** (UI-unsichtbar).

## Konventionen, Build, Latenz

- **Settings-Migration fuer Default-Drifts fehlt** (`limit_bars`/`model_limits`).
- **`exactOptionalPropertyTypes: false`** in tsconfig.
- **Wrap-Mechanismus Action-Bar:** min-width-Trick + Container-Query als Schutznetz.
- **Electron-Bump auf 42 blockiert** durch `better-sqlite3`-V8-13-Inkompatibilitaet (Quelltext, nicht Toolchain).
- **Build-CVE-Tail** (`tar`/`tmp`/`better-sqlite3`-Tarball) — Build-only.
- **Squirrel ohne setupIcon**, Heatmap-Cells leicht rechteckig auf breiten Panes, `useUsageStore.refreshContext` vor Spawn-IPC, xterm-`dimensions`-Race in Dev-Mode, awaitWriteFinish-100ms-Latenz (durch Season-15-Polling-Ring mitigiert), Notes-Save bei Hard-Quit best-effort, Session-Mapping-Mehrdeutigkeit (durch Season-9-UUID-First weitgehend abgeloest).
