---
source: docs/CHANGELOG.md
source_hash: cc6a90a4bb8628852ff10aceba80403f72de4905d9cbe7b21e32534751526b81
summarized_at: 2026-05-20T16:30:40Z
---

# CHANGELOG — Kompaktfassung

Chronologisches Aenderungsprotokoll abgeschlossener Sessions, neuster zuerst. Pro Eintrag: Datum · Versions-Marker · Season/Sprint · Titel; darunter „Was jetzt geht" (Nutzer-Mehrwert) + „Architektur-Notiz" (Variantenwahl, Begruendung, Implementierungs-Anker). Keine Datei-Listen — Git liefert das.

## Aktueller Stand (2026-05-19, v0.3.1)

- **v0.3.1 Hotfix Renderer-Crash:** `@xterm/addon-webgl@0.19.0` warf beim Tab-Close eine `TypeError: …'_isDisposed'`, wenn der GL-Init noch nicht durch war — kollabierte den gesamten Renderer-Tree. Fix in zwei Schichten: Pure-Helper `safeDisposeAddon`/`safeDisposeTerminal` mit `try/catch` + Label-Warn, plus globale `ErrorBoundary` ueber `<App>` (Class-Component, da React kein `componentDidCatch`-Hook hat). Suite 943/943 gruen (+5).
- **v0.3.0 Bugfix 5h-Block-Anker:** `computeSessionBlock` rundete den Anker auf die volle Stunde (`bucket * 3_600_000`) statt minutenpraezise — Footer zeigte 10:00 statt 10:34. Fix: Anker kommt jetzt aus `messages.ts` (ms-Granularitaet) ueber neue `MessageRepository.timestampsInRange`; `usage_buckets` bleibt fuer die Token-Summe (Stunden-Drift <1%).
- **Season 29 — Multi-Tab-Diff (v0.3.0):** Drei Diff-Modi via `td-dash-tab`-Pillen (Working/Staged/Session), `start_commit_sha`-Spalte (Migration 0009), zwei neue IPCs (`git:show-staged`, `git:session-diff`). Plus Komfort: Diff-Tab oeffnet automatisch beim Projekt-Wechsel, Klick auf Diff-File oeffnet Editor-Tab im Hintergrund, chokidar-Auto-Refresh (`ProjectFilesWatcher`, 200ms-Debounce, `fs:set-watched-project`+`fs:changed`-Push) — Dirty-Tabs bleiben unangetastet. Suite 935/935 gruen.
- **Bugfix `generate-latest-yml.mjs` (v0.3.0):** `fileURLToPath` statt `URL.pathname` + `.slice(1)` — letzteres crasht auf GH-Actions-Windows-Runnern mit doppeltem Drive-Letter. Season-27-Pipeline real validiert (Round 2 gruen, alle 17 Steps, 3 Assets korrekt hochgeladen). `VERSIONIERUNG.md` Schritte 9+10 zu einem CI-Step zusammengefasst.
- **Season 28 — Terminal-Polish:** 14 Hebel (WebGL-Renderer mit Canvas-Fallback, TUI-Poll-Pause fuer inaktive Tabs, `smoothScrollDuration:0`, Scrollback 5000, Strg+Shift+F/L, Scroll-to-Bottom-Button, Bell-Pulse, Strg+1..9, Strg+Mausrad-Zoom 8..32px, Rechtsklick-Menue, Doppelklick-Pfade mit `:42:5`).
- **Seasons 25–27:** Settings-Schema-Versionierung (Variante B, defensive Drift-Detection), Auto-Update via electron-updater (Variante A, Forge/Squirrel bleiben), GitHub-Actions Full-Pipeline (Tag-Push `v*` triggert Build+Release+Upload mit Pre-Build-Verify-Gates).

## Wiederkehrende Muster

- **Variants vor Code:** jede nicht-triviale Season praesentiert A/B/C mit Aufwand-Tabelle + Empfehlung; User entscheidet.
- **Pure-Helper + duenner Adapter:** Logik in `src/shared/*.ts` oder `src/renderer/components/*.ts`, IPC/UI als Adapter — Tests laufen ohne Electron/DOM/SQLite.
- **Backward-Compat ueber Default-Merge:** Schema-Erweiterungen migrieren Bestandsuser beim ersten Read; Migrations sehen raw JSON vor dem Default-Merge.
- **Targeted-Tests pro Season** (CLAUDE.md-Regel): Suite waechst monoton (zuletzt 943/943 gruen).
- **Memory-Notes als Pattern-Anker:** Lehren landen als Memory-Eintrag (Scope-Cut, fileURLToPath, UX-Defaults, StrictMode-Side-Effect-Guard, Zustand-Selector-Stable-Ref).
- **Hotfix-Surface minimal halten:** strukturell sauberere Variante wird als TECH_SCHULDEN-Trigger hinterlegt, nicht im Hotfix mitgezogen.
- **Defense-in-Depth bei third-party Bugs:** Symptom-Abfang plus globaler Sicherheits-Ring (ErrorBoundary, safeDispose), Upstream-Bump als Trigger dokumentiert.

## Phasen-Ueberblick

- **Phase 1 (Sprint 1–9, v0.1, abgeschlossen 2026-05-12):** Foundation · Sessions · Workspace · Token-Dashboard · Templates · Season-Tracker · Editor+Git · App-Chrome · Right-Pane · Polish · Pre-Release-QA (E33→41 + Vite 5→6 Security-Bump).
- **Phase 2 (v0.2.x–v0.3.x, laufend):** Volle State-Detection · Screenshot-DnD+Retention · Trigger-Pillen · Erweiterte Template-Vars · Eigene Session-Art · UUID-basiertes Session-Mapping · cwd-Backfill · Projekt-Entfernen · Kontext-Soft-Warning · Modell-Filter · Reset-Schedule · 5h-Session-Block · Stats-Cards+Heatmap+Modelle-View · Easter-Egg · Workspace-Wizard · Schema-aware Templates · Docs-Sync+Kontext-Checkbox · Markdown-Side-by-Side · Settings-Schema-Versionierung · electron-updater · GitHub-Actions-CI · Terminal-Polish · Multi-Tab-Diff · diverse Hotfixes (Renderer-Crash, 5h-Anker, generate-latest-yml).
