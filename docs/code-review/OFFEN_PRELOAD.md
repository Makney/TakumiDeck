# Code-Review — Bekannte offene Punkte (Preload-Bridge)

Befunde aus dem Preload-Bridge-Review, die **bewusst nicht gefixt** werden.

---

## Format pro Eintrag

- `###`-Überschrift mit kurzer Kennung
- Datei + Zeilenreferenz (`datei.ext:42`)
- **Kategorie:** Bug / Warnung / Verbesserung / Design-by-Choice
- **Beschreibung:** 1–3 Sätze, was der Befund ist
- **Begründung:** warum er offen bleibt
- Optional **Trigger:** unter welcher Bedingung der Befund doch angegangen wird

---

### api.notes-Domain nicht im Bridge implementiert

- `src/preload/preload.ts:48–155`, `src/shared/types.ts:490–564`, `src/shared/ipc-channels.ts` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Die Architektur-Referenz (Kapitel 3) listet `api.notes` als erwartete Domain-Gruppe. Im Bridge fehlt sie; das `RendererApi`-Interface enthält keine `notes`-Sektion; in `ipc-channels.ts` existieren keine `notes:*`-Channels.
- **Begründung:** Notes-Feature ist nicht Teil von Phase 1. Bridge-Skeleton ohne Main-Handler + UI würde nur toten Code erzeugen (verstößt gegen Simplicity-First → CODING_RULES.md). Die Architektur-Doc beschreibt den Ziel-Zustand, nicht den Phase-1-Stand.
- **Trigger:** Sobald Notes als Feature in `docs/roadmap/PHASE<N>.md` aufgenommen wird — dann `api.notes`-Gruppe, `notes:*`-Channels und Main-Handler in einem Sprint zusammen anlegen und diesen Eintrag auflösen.
