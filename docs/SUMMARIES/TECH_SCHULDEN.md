---
source: docs/TECH_SCHULDEN.md
source_hash: 1b22749feb27a0060b76a0061dde5a40c89717a9afe789d3080576efa0469dbd
summarized_at: 2026-05-31T14:39:24Z
---

# TECH_SCHULDEN — Kompaktfassung

Register **bewusst aufgeschobener oder vereinfachter Loesungen** — Code laeuft, ist aber wissentlich nicht optimal. Format pro Eintrag: Bereich · Was · Warum so · Risiko · Aufloesung (mit Trigger). Abgrenzung: ENTSCHEIDUNGEN.md = Why-Tradeoffs, FEATURES.md = neue Features, hier = bestehender Code mit bekannter Schuld. Erledigtes bleibt mit ✅ + Datum stehen.

## Wiederkehrende Muster

- **Trigger-basierte Vertagung statt vorzeitigem Refactor:** „beim N-ten Aufrufer", „bei der ersten/zweiten echten Daily-Use-Inzidenz", „bei naechster Erweiterung an dieser Stelle". Risiko meist niedrig, vereinzelt mittel (Datenverlust/Release/Responsiveness).
- **Pure-Logik akzeptiert oft schon den Aufholpfad** (Easter-Egg-`works`-Param, Split-Ratio) — nur Settings-Schema + UI fehlen bis zum echten Bedarf.
- **Defense-in-Depth bei third-party Bugs:** Symptom-Abfang mit Diagnose-Warn als Bump-Trigger, kein stummer Schluck.

## Offene Schulden (nach Thema)

- **Performance/Architektur:** JSONL-Ingestion synchron im Main-Thread (Worker-Auslagerung vertagt bis Season-35-Quick-Wins gemessen sind).
- **Build/Release:** CI-Release bricht (electron-forge resolved 0 Maker auf neuem Runner → manueller Fallback); Electron-42-Bump durch better-sqlite3 blockiert; Build-CVE-Tail; Migration-Runner-Tests gegen Fake-Driver; `exactOptionalPropertyTypes: false`.
- **Persistenz-Luecken:** Terminal-Buffer-Verlust bei App-Crash; Per-Tab-Font-Zoom nicht persistiert; Datei-Browser-Tree refresht nicht bei Struktur-Aenderungen; Auto-Refresh ueberschreibt Dirty-Tabs ohne Warn-Marker.
- **Third-party:** @xterm/addon-webgl-Dispose-Bug (Symptom abgefangen, Upstream offen).
- **Daten-Approximationen:** Pre-Hotfix-Sessions ohne JSONL resume-tot + verlieren Aggregate; `messages.model`-Backfill approximiert; cache_creation/read in tokens_in summiert; Multi-Session-cwd-Backfill nimmt nur juengste.
- **Duplikation/Komplexitaet:** DoubleConfirm/Statement-Cache/Session-Action-Pattern; Hotspots TemplatesModal, state-detection-`tick`, `listHistoryForProject`.
- **Config/Polish/Asset:** Modell-Auto-Refresh nur env-Key/keine Pagination; Easter-Egg-Werkliste & Split-Layout hartcodiert; Modell-Auto-Refresh-Limits; Brand-Logo-Quell-PNGs extern auf dem Desktop.

## Aufgeloeste Schulden (✅, Auswahl)

Spawn-Tracking ins SessionTab-Schema, latest.yml-Post-Make → CI-Hook, AppSettings-Fixture-Dup, Datei-Tab-Persistenz, konfigurierbare Sensitive-Patterns, Modell-Limits 1M→200k, Crash-Recovery, tote `.td-sidebar-*`-CSS, Legacy-Bucket/`__default__`, Default-Project-FK, Top-N hartcodiert.
