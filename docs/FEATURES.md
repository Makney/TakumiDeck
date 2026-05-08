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
| `Electron-Skelett`              | ⛔      |           |
| `IPC-Foundation`                | ⛔      |           |
| `SQLite-Foundation`             | ⛔      |           |
| `Settings-System`               | ⛔      |           |

## Sessions (Sprint 2-3)

Multi-Session-Management.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `PTY-Spawn`                     | ⛔      |           |
| `xterm.js-Terminal`             | ⛔      |           |
| `Tab-System`                    | ⛔      |           |
| `Session-Lifecycle`             | ⛔      |           |
| `Resume-Funktion`               | ⛔      |           |
| `Modell-Auswahl`                | ⛔      |           |
| `State-Detection (reduziert)`   | ⛔      |           |
| `Notizen pro Session`           | ⛔      |           |

## Workspace (Sprint 4)

Projekt-Erkennung und -Verwaltung.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `Workspace-Scanner`             | ⛔      |           |
| `CLAUDE.md-Parser`              | ⛔      |           |
| `Project-Sidebar`               | ⛔      |           |

## Token-Dashboard (Sprint 5)

Live-Tracking von Token-Verbrauch.

| Feature                         | Status | Bemerkung |
| ------------------------------- | ------ | --------- |
| `JSONL-Watcher`                 | ⛔      |           |
| `Token-Aggregation`             | ⛔      |           |
| `P90-Detection`                 | ⛔      |           |
| `Dashboard-UI`                  | ⛔      |           |

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
| `Übersicht/Modelle-Toggle (Skeleton)` | ⛔ |           |

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