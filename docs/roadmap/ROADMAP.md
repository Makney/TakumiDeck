# Roadmap – Übersicht

TakumiDeck wird in **4 Phasen** entwickelt, die jeweils in einem Versions-Milestone münden. Phase 4 ist ein Sammelort für Gray-Area-Features ohne Versionsplan.

Features haben **keine feste Reihenfolge** innerhalb einer Phase – jede Implementierung findet in einer eigenen Season statt. Ausnahme: Features mit Abhängigkeiten sind als **Feature-Blöcke** markiert (Reihenfolge muss eingehalten werden).

| Phase                              | Ziel                                          | Milestone | Status |
| ---------------------------------- | --------------------------------------------- | --------- | ------ |
| [Phase 1](./PHASE1.md)             | MVP — lauffähige Multi-Session-Workbench      | v0.1      | ✅      |
| [Phase 2](./PHASE2.md)             | Komfort und Stabilisierung                    | v1.0      | 🟡      |
| [Phase 3](./PHASE3.md)             | Power-Features und Erweiterungen              | —         | ⛔      |
| [Phase 4](./PHASE4.md)             | Experimentelles und Gray-Area (Opt-In)        | —         | ⛔      |

Abgeschlossene Features → [CHANGELOG.md](../CHANGELOG.md)

Phase 2 läuft **trigger-getrieben** — einzelne Features werden gezogen, wenn sie im Daily-Use als Schmerzpunkte spürbar werden (siehe Trigger-Hinweise pro Feature in [PHASE2.md](./PHASE2.md)).

---

## Was NICHT geplant ist

Bewusste Scope-Begrenzung — Dinge, die ein Nutzer vielleicht erwartet, die aber **nicht** Teil dieses Projekts sind:

- **Kein eigener Commit-Workflow durch die App** — Commits laufen durch Claude Code (Trigger-Phrase aus CLAUDE.md). App sendet nur den Trigger.
- **Kein Stream-JSON-Mode** — TakumiDeck spawnt Claude Code interaktiv via PTY, kein Re-Implementing der Claude-Code-UI.
- **Keine API-Key-Integration** — Alles läuft über das Anthropic-Abo.
- **Kein Auto-Resume von Sessions** — Manuelles Resume via Button reicht.
- **Kein Multi-User-Support** — Privates Tool, keine Team-Features.
- **Keine Cloud-Sync** — Alles lokal in `%APPDATA%\TakumiDeck\`.
- **Kein WebGL-Renderer** im MVP — Canvas reicht für 2-5 parallele Tabs.
- **Kein eigenes Code-Signing** — Manuelle GitHub-Releases ohne Signatur.