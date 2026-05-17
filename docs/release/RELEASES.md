# Releases – Übersicht

Liste **aller veröffentlichten Versionen** von {{PROJEKT_NAME}}. Quelle der Wahrheit für die Release-Historie.

Schema und Ablauf → [VERSIONIERUNG.md](./VERSIONIERUNG.md)

Aktuelle Release-Version: **`{{CURRENT_VERSION}}`** *(siehe auch `workbench.current_version` in [CLAUDE.md](../../CLAUDE.md))*

---

## Geplante Releases

Welche Versionen als Nächstes anstehen — wird beim Erreichen umbenannt (von „geplant" zu eingerücktem Datum).

| Version  | Geplanter Inhalt                                           | Phase   | Status |
| -------- | ---------------------------------------------------------- | ------- | ------ |
| `0.1.0`  | Phase 1 abgeschlossen — minimal lauffähige Version         | Phase 1 | ⛔      |
| `0.1.1`  | Erstes Phase-2-Patch-Release (Feature-Block X stabilisiert) | Phase 2 | ⛔      |
| `1.0.0`  | Phase 2 abgeschlossen — ausgereifte Anwendung              | Phase 2 | ⛔      |

---

## Released

Tabelle aller veröffentlichten Versionen, **neueste zuerst**. Jeder Eintrag verlinkt auf eine eigene Release-Notes-Datei.

| Version | Datum      | Typ      | Phase   | Notes                                    |
| ------- | ---------- | -------- | ------- | ---------------------------------------- |
| —       | —          | —        | —       | *(noch kein Release veröffentlicht)*    |

Sobald veröffentlicht, Zeile nach diesem Muster anfügen (neuste oben):

```text
| `0.1.0` | 2026-MM-DD | Phasen-Milestone | Phase 1 | [Release Notes](./v0.1.0.md) |
```

Typ-Spalte: `Phasen-Milestone` (Phasen-Ende, semver-Minor- oder Major-Bump), `Minor` (größerer Block ohne Phasen-Ende), `Patch` (Zwischen-Release), `Hotfix` (Notfall-Fix).

---

## Pflege-Regeln

- **Pro Release eine eigene Datei** `v<MAJOR>.<MINOR>.<PATCH>.md` in diesem Ordner. Vorlage → [TEMPLATE.md](./TEMPLATE.md).
- **Nichts aus dieser Tabelle löschen.** Auch zurückgezogene Releases bleiben drin und werden mit `(zurückgezogen)` in der Notes-Spalte markiert.
- **Versionsnummern nicht überspringen.** Nach `0.1.1` folgt `0.1.2`, nicht `0.1.5`.
- **„Geplante Releases" pflegen**, wenn sich der Plan ändert — z.B. wenn ein Patch-Release zu groß wird und stattdessen ein Minor-Sprung wird.
