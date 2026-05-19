# Releases – Übersicht

Liste **aller veröffentlichten Versionen** von TakumiDeck. Quelle der Wahrheit für die Release-Historie.

Schema und Ablauf → [VERSIONIERUNG.md](./VERSIONIERUNG.md)

Aktuelle Release-Version: **`0.3.0`** *(siehe auch `workbench.current_version` in [CLAUDE.md](../../CLAUDE.md))*

---

## Geplante Releases

Welche Versionen als Nächstes anstehen — wird beim Erreichen umbenannt (von „geplant" zu eingerücktem Datum).

| Version  | Geplanter Inhalt                                              | Phase   | Status |
| -------- | ------------------------------------------------------------- | ------- | ------ |
| `0.3.1`  | Phase-2-Patch — Aufholen der `OFFEN_<BEREICH>.md`-Einträge aus dem v0.3.0-Release-Review (u.a. `messages(ts)`-Index für den 5h-Block-Hot-Path) + SUMMARIES-Resync nach Season 29 | Phase 2 | ⛔      |
| `1.0.0`  | Phase 2 abgeschlossen — alle Phase-2-Roadmap-Features ✅      | Phase 2 | ⛔      |

---

## Released

Tabelle aller veröffentlichten Versionen, **neueste zuerst**. Jeder Eintrag verlinkt auf eine eigene Release-Notes-Datei.

| Version | Datum      | Typ      | Phase   | Notes                                                          |
| ------- | ---------- | -------- | ------- | -------------------------------------------------------------- |
| `0.3.0` | 2026-05-19 | Minor    | Phase 2 | [Release Notes](./v0.3.0.md)                                   |
| `0.2.1` | 2026-05-17 | Hotfix   | Phase 2 | [Release Notes](./v0.2.1.md)                                   |
| `0.2.0` | 2026-05-17 | Minor    | Phase 2 | [Release Notes](./v0.2.0.md)                                   |
| `0.1.2` | 2026-05-12 | Patch    | Phase 1 | *(rückwirkend erfasst, keine eigene Release-Notes-Datei)*      |
| `0.1.1` | 2026-05-11 | Patch    | Phase 1 | *(rückwirkend erfasst, keine eigene Release-Notes-Datei)*      |
| `0.1.0` | 2026-05-10 | Phasen-Milestone | Phase 1 | *(rückwirkend erfasst, keine eigene Release-Notes-Datei)* |

Sobald veröffentlicht, Zeile nach diesem Muster anfügen (neuste oben):

```text
| `0.2.1` | 2026-MM-DD | Patch | Phase 2 | [Release Notes](./v0.2.1.md) |
```

Typ-Spalte: `Phasen-Milestone` (Phasen-Ende, semver-Minor- oder Major-Bump), `Minor` (größerer Block ohne Phasen-Ende), `Patch` (Zwischen-Release), `Hotfix` (Notfall-Fix).

---

## Pflege-Regeln

- **Pro Release eine eigene Datei** `v<MAJOR>.<MINOR>.<PATCH>.md` in diesem Ordner. Vorlage → [TEMPLATE.md](./TEMPLATE.md).
- **Nichts aus dieser Tabelle löschen.** Auch zurückgezogene Releases bleiben drin und werden mit `(zurückgezogen)` in der Notes-Spalte markiert.
- **Versionsnummern nicht überspringen.** Nach `0.1.1` folgt `0.1.2`, nicht `0.1.5`.
- **„Geplante Releases" pflegen**, wenn sich der Plan ändert — z.B. wenn ein Patch-Release zu groß wird und stattdessen ein Minor-Sprung wird.
