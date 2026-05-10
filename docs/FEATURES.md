# Feature-Status

Legende:

- ✅ **fertig** – läuft im aktuellen Build
- 🟡 **teilweise** – Grundgerüst steht, es fehlt was Offensichtliches
- ⛔ **offen** – noch nicht angefasst

Nach jedem umgesetzten Feature wird der Eintrag hier auf ✅ gesetzt und in [CHANGELOG.md](./CHANGELOG.md) ein Eintrag angelegt.

Alle offenen Features mit Details → [roadmap/](./roadmap/)

---

## Foundation (Sprint 1)

Grundgerüst der Electron-App.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Electron-Skelett`              | ✅      | 2026-05-09 — Forge + Vite + React, Hardening (sandbox, FuseV1, contextIsolation) |
| `IPC-Foundation`                | ✅      | 2026-05-09 — typed Channels, Result-Pattern, zod an allen Boundaries |
| `SQLite-Foundation`             | ✅      | 2026-05-09 — better-sqlite3, WAL, Migration-Runner mit `PRAGMA user_version` |
| `Settings-System`               | ✅      | 2026-05-09 — eigene JSON-Operationen mit atomic write |

## Sessions (Sprint 2-3)

Multi-Session-Management.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `PTY-Spawn`                     | ✅      | 2026-05-09 — @lydell/node-pty (NAPI), 16ms-Buffer-Flush, Pre-Check für Binary + cwd |
| `xterm.js-Terminal`             | ✅      | 2026-05-09 — Canvas-Renderer + Addons (fit, search, serialize, web-links), Single-Tab |
| `Tab-System`                    | ✅      | 2026-05-09 — Multi-Tab mit Pillen, +-Button, Ctrl+Tab/Ctrl+Shift+Tab, alle xterm dauerhaft mounted (Variante A) |
| `Session-Lifecycle`             | ✅      | 2026-05-09 — zentrale `SessionLifecycle`-State-Machine, alle 5 Status-Übergänge inkl. Resume |
| `Resume-Funktion`               | ✅      | 2026-05-09 — ↻-Button auf completed/interrupted/error, `claude --resume <id>` mit gespeichertem cwd/Modell |
| `Modell-Auswahl`                | ✅      | 2026-05-09 — NewSessionModal mit Modell-Dropdown (Opus 4.7…Haiku 4.5), Default aus settings.default_model |
| `State-Detection (reduziert)`   | ✅      | 2026-05-10 — Last-Event-Timestamp-Logik (<3 s = running, sonst idle), 2-s-Tick im Main, Lifecycle-State-Machine um running ↔ idle erweitert |
| `Notizen pro Session`           | ✅      | 2026-05-09 — collapsible Footer, 500 ms Debounce + onBlur + onUnmount + beforeunload (Variante B) |
| `Copy/Paste im Terminal`        | ✅      | 2026-05-09 (Sprint 3.5) — Smart Ctrl+C/V, Ctrl+Shift+C/V, Ctrl+Insert/Shift+Insert; Bracketed-Paste; dezente Selection-Tonung |

## Workspace (Sprint 4)

Projekt-Erkennung und -Verwaltung.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Workspace-Scanner`             | ✅      | 2026-05-09 — Async-Walk mit Konkurrenz-Limit (Variante A), max-depth 5, Stop bei `CLAUDE.md` / `.git`, FsLikeDriver für Tests |
| `CLAUDE.md-Parser`              | ✅      | 2026-05-09 — `gray-matter` + zod-Validierung, strict für `trigger_phrases`, locker für `on_demand_files` |
| `Project-Sidebar`               | ✅      | 2026-05-09 — 240 px Sidebar mit Active-Highlight + Running-Badge, `+`/`↻`-Buttons, Per-Projekt-Tab-Filter, Sprint-2/3-Legacy-Bucket sichtbar bei `session_count > 0` |

## Token-Dashboard (Sprint 5)

Live-Tracking von Token-Verbrauch.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `JSONL-Watcher`                 | ✅      | 2026-05-10 — chokidar v5 mit `ignored`-Predicate (kein Glob), `awaitWriteFinish` 100 ms, Initial-Scan persistiert byte-offsets in jsonl_offsets-Tabelle |
| `Token-Aggregation`             | ✅      | 2026-05-10 — messages-Tabelle pro JSONL-Zeile + usage_buckets Hourly-Aggregat, Filter all/top_tier/sonnet/haiku/custom |
| `P90-Detection`                 | ✅      | 2026-05-10 — rolling 192 h, Fallback auf model_limits bei <24 Buckets, Limit-Quelle ('p90'/'fixed'/'fallback') im Tooltip |
| `Dashboard-UI`                  | ✅      | 2026-05-10 — untere Zeile 300 px, eine UsageBar pro limit_bar (CSS-Bars), Per-Session-Kontext-Bar, UsageDetailModal mit Recharts-Linie |

## Templates (Sprint 6)

Schnelles Erstellen von Standard-Prompts.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Template-Reader`               | ⛔      |           |
| `Variable-Filling`              | ⛔      |           |
| `Template-Send`                 | ⛔      |           |

## Season-Tracker (Sprint 6)

Nummerierung und Verlauf von Sessions.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Season-Nummerierung`           | ⛔      |           |
| `Verlauf-Panel`                 | ⛔      |           |

## Editor + Git (Sprint 7)

Markdown-Editor und Diff-Viewer.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Markdown-Editor`               | ⛔      |           |
| `YAML-Validierung`              | ⛔      |           |
| `Markdown-Preview-Toggle`       | ⛔      |           |
| `Diff-Viewer`                   | ⛔      |           |
| `Pre-Commit-Panel`              | ⛔      |           |

## App-Chrome (Sprint 7-8)

Header-Bar und globale UI-Komponenten.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Header-Bar`                    | ⛔      |           |
| `Action-Bar`                    | ⛔      |           |
| `Tastatur-Hints`                | ⛔      |           |

## Right-Pane (Sprint 7)

Permanent sichtbarer Right-Pane mit Diff, Editor und Notizen.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Right-Pane-Layout`             | ⛔      |           |
| `Datei-Tabs`                    | ⛔      |           |
| `Datei-Browser`                 | ⛔      |           |

## Stats-Section (Sprint 5, Skeleton)

Im MVP nur Skeleton. Volle Implementation in Phase 2.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Übersicht/Modelle-Toggle (Skeleton)` | ✅ | 2026-05-10 — Übersicht-View mit 3 Mini-Karten (Aktuelle Session, letzte 5 h, letzte 168 h), Modelle-View als Phase-2-Hinweispille |

## Polish (Sprint 8)

Abschluss-Schliff vor MVP-Release.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Settings-Dialog`               | ⛔      |           |
| `Error-Handling`                | ⛔      |           |
| `Dark-Theme`                    | ⛔      |           |
| `Build + Distribution`          | ⛔      |           |

---

## Hinweise zur Pflege

- **Ein Feature pro Zeile.** Zu grobe Zeilen verlieren ihre Aussagekraft.
- **Bereiche** orientieren sich an Sprints/Roadmap.
- **Fertige Features** werden *nicht* aus der Tabelle entfernt — ✅-Markierung bleibt als Referenz, zusammen mit Datum in der Bemerkung.
- Phase-2- und Phase-3-Features werden hier ergänzt, sobald Phase 1 abgeschlossen ist (= alle Einträge oben ✅).