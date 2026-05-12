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

---

### git.worktrees-Channel nicht im Bridge implementiert

- `src/preload/preload.ts:117–126`, `src/shared/types.ts:532–539`, `src/shared/ipc-channels.ts:27–30` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Die Architektur-Referenz (Kapitel 3) listet `git:worktrees` als Channel und `git.worktrees` als Bridge-Wrapper. Beide fehlen im aktuellen Stand; `Channels.GitWorktrees` existiert nicht in `ipc-channels.ts`, `api.git.worktrees` nicht im `RendererApi`-Interface.
- **Begründung:** Die Architektur-Doc markiert den Channel selbst als „Phase 5+, im MVP leer". Worktree-Verwaltung ist Phase-2-Feature; in Phase 1 verlässt sich der UX-Flow auf den manuellen Worktree-Workflow außerhalb von TakumiDeck. Bridge-Skeleton ohne Main-Handler + UI wäre toter Code.
- **Trigger:** Sobald Worktree-Tooling in einer Roadmap-Phase aufgenommen wird — dann `Channels.GitWorktrees`, Main-Handler in `src/main/ipc/git.ts` und `api.git.worktrees`-Wrapper in einem Sprint zusammen anlegen und diesen Eintrag auflösen.
