---
source: docs/CHANGELOG.md
source_hash: 22ecaa8a2dcc5ea0524fa664213c2a0bcf83072214ee3999468ed1f297a71e6e
summarized_at: 2026-05-18T19:06:20Z
---

# CHANGELOG — Kompaktfassung

Chronologisches Aenderungsprotokoll abgeschlossener Sessions, neuster zuerst. Pro Eintrag: Datum · Versions-Marker · Season/Sprint · Titel; darunter „Was jetzt geht" (Nutzer-Mehrwert) + „Architektur-Notiz" (Variantenwahl, Begruendung, Implementierungs-Anker). Keine Datei-Listen — Git liefert das.

## Aktueller Stand (2026-05-18, v0.2.1)

- **CI-Bugfix `generate-latest-yml.mjs`:** `fileURLToPath` statt `URL.pathname` + `.slice(1)` — letzteres crasht auf GitHub-Actions-Windows-Runnern mit doppeltem Drive-Letter (`D:\D:\a\...`). Season-27-Pipeline real validiert (Round 2 gruen, alle 17 Steps, 3 Assets korrekt hochgeladen). `VERSIONIERUNG.md` Schritte 9+10 zu einem CI-Step zusammengefasst, manueller Fallback dokumentiert.
- **Season 28 — Terminal-Polish:** 14 Hebel gebuendelt (WebGL-Renderer mit Canvas-Fallback, TUI-Poll-Pause fuer inaktive Tabs, `smoothScrollDuration:0`, Scrollback 5000, Strg+Shift+F/L, Scroll-to-Bottom-Button, Bell-Pulse via `terminal.onBell`+`SessionTab.hasBell`, Strg+1..9, Strg+Mausrad-Zoom 8..32px, Rechtsklick-Kontextmenue, Doppelklick-Pfade mit `:42:5`). User-Trigger nach Daily-Use-Smoke-Test „Scrollen stockt".
- **Season 27 — GitHub-Actions-Pipeline:** Variante B (Full-Pipeline). Tag-Push `v*` triggert Build+Release+Upload in einem Lauf, Pre-Build-Verify-Gates fangen Version-Drift und fehlende Notes-Datei vor dem teuren Make-Step.
- **Season 26 — Auto-Update via electron-updater:** Variante A (Forge/Squirrel bleiben + Post-Make-`latest.yml`-Script). Header-Banner mit 4 States, Download+Install jeweils nach User-Klick, Dev-Mode `disabled-dev`.
- **Season 25 — Settings-Schema-Versionierung:** Variante B (Pipeline + defensive Drift-Detection pro Feld). Migration 1→2 raeumt vier Default-Drifts (Claude-Design-Bar, Sonnet-Label, `default_limit`, `model_limits`) nur bei exaktem alten Default — User-Anpassungen ueberleben.

## Wiederkehrende Muster

- **Variants vor Code:** jede nicht-triviale Season praesentiert A/B/C mit Aufwand-Tabelle + Empfehlung; User entscheidet.
- **Pure-Helper + duenner Adapter:** Logik in `src/shared/*.ts` oder `src/renderer/components/*.ts`, IPC/UI als Adapter — Tests laufen ohne Electron/DOM/SQLite.
- **Backward-Compat ueber Default-Merge:** Schema-Erweiterungen migrieren Bestandsuser beim ersten Read; Migrations sehen raw JSON vor dem Default-Merge.
- **Targeted-Tests pro Season** (CLAUDE.md-Regel): Suite waechst monoton, Test-Count am Ende jeder Architektur-Notiz dokumentiert (zuletzt 918/918 gruen).
- **Memory-Notes als Pattern-Anker:** Lehren aus einer Season landen oft als Memory-Eintrag fuer Folge-Seasons (Scope-Cut, fileURLToPath, UX-Defaults, StrictMode-Side-Effect-Guard, Zustand-Selector-Stable-Ref).
- **Hotfix-Surface minimal halten:** strukturell sauberere Variante wird als TECH_SCHULDEN-Trigger hinterlegt, nicht im Hotfix mitgezogen.

## Phasen-Ueberblick

- **Phase 1 (Sprint 1–9, v0.1, abgeschlossen 2026-05-12):** Foundation · Sessions · Workspace · Token-Dashboard · Templates · Season-Tracker · Editor+Git · App-Chrome · Right-Pane · Polish · Pre-Release-QA (E33→41 + Vite 5→6 Security-Bump).
- **Phase 2 (v0.2.x, laufend):** Volle State-Detection · Screenshot-DnD+Retention · Trigger-Pillen · Erweiterte Template-Vars · Eigene Session-Art · UUID-basiertes Session-Mapping · cwd-Backfill · Projekt-Entfernen · Kontext-Soft-Warning · Modell-Filter · Reset-Schedule · 5h-Session-Block · Stats-Cards+Heatmap+Modelle-View · Easter-Egg · Workspace-Wizard · Schema-aware Templates · Docs-Sync+Kontext-Checkbox · Markdown-Side-by-Side · Settings-Schema-Versionierung · electron-updater · GitHub-Actions-CI · Terminal-Polish.
