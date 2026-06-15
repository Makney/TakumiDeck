# Glossar

Domain-spezifische Begriffe, Abkürzungen und projekt-interne Konzepte. Diese Datei lesen, wenn ein unbekannter Begriff in einem User-Prompt auftaucht oder beim Planen eines Features die Domäne unklar ist.

## Wann kommt ein Eintrag rein?

- Ein Begriff hat eine projekt-spezifische Bedeutung, die von der allgemeinen Verwendung abweicht.
- Eine Abkürzung wird verwendet, die nicht universell bekannt ist.
- Ein Domain-Konzept lässt sich nicht aus Code oder Doku allein erschließen.

**Nicht hier rein:** allgemeine Programmier-Begriffe, Framework-Konzepte aus offiziellen Docs.

---

## Projekt-interne Begriffe

### Season

Eine fokussierte Entwicklungs-Session mit einem klar abgegrenzten Feature-Ziel. Entspricht einer Anwendung von `templates/SEASON_PROMPT.md`. Wird retrospektiv in `SEASON_LOG.md` getrackt und über das Ergebnis in `CHANGELOG.md` dokumentiert.

### Phase

Eine Gruppe von Seasons, die zu einem Versions-Milestone (v0.1, v1.0, …) führt. Drei Phasen sind in `roadmap/ROADMAP.md` definiert; Details pro Phase in `roadmap/PHASE<N>.md`.

### Workbench-Konfiguration

Die `workbench:`-Sektion im YAML-Frontmatter der `CLAUDE.md`. Enthält App-spezifische Konfiguration, die TakumiDeck beim Öffnen eines Projekts liest: `project_name`, `default_model`, `current_phase_file`, `trigger_phrases`, `on_demand_files`.

### Trigger-Phrase

Definierte User-Eingabe, die einen automatischen Workflow auslöst. Konfiguriert in `workbench.trigger_phrases` der CLAUDE.md. Aktuell zwei Trigger:

- `docs_update` (Default: `"ist korrekt umgesetzt"`) – Doku-Updates nach Feature-Implementation
- `commit` (Default: `"commit"`) – Git-Commit-Workflow

---

## TakumiDeck-spezifische Domain-Begriffe

### PTY (Pseudo-Terminal)

Mechanismus, mit dem TakumiDeck Claude Code als interaktiven Subprocess startet. Implementation via `node-pty`. Erlaubt Input/Output wie in einem echten Terminal — inklusive Cursor-Position, Farben, Slash-Commands.

### JSONL (JSON Lines)

Format, in dem Claude Code seine Sessions persistiert. Eine Zeile = eine Message. Liegt unter `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. TakumiDeck nutzt diese Files als Source-of-Truth für Token-Tracking.

### P90-Detection

Algorithmus zur Schätzung von Anthropic-Limits. Analysiert den Verbrauch der letzten 192 Stunden und nimmt das 90. Perzentil als Limit-Schätzung. Notwendig, weil Anthropic die exakten Limits nicht öffentlich dokumentiert und sie sich im Lauf der Zeit ändern.

### Bracketed Paste Mode

Terminal-Escape-Sequenz (`\x1b[200~...\x1b[201~`), die einen Block aus Text als zusammenhängende Eingabe markiert. TakumiDeck nutzt das, um mehrzeilige Templates ans PTY zu senden, ohne dass Claude Code sie zeilenweise interpretiert.

### Worktree (Git)

Git-Mechanismus zum Auschecken eines Branches in einen separaten Ordner. Erlaubt parallele Arbeit an mehreren Branches im gleichen Repo. **Seit Season 37 aktiv genutzt:** Eine Feature-/Custom-Session kann beim Anlegen (NewSessionModal) optional einen eigenen Worktree mit eigenem Branch bekommen. Die Worktrees liegen als Sibling-Ordner neben dem Projekt im Layout `<projektordner>-worktrees/<branch-slug>` (nicht im Projekt selbst, damit Workspace-Scanner und Datei-Watcher sie nicht als Projekt-Teil erfassen). Der Diff-Tab „vs. main" zeigt den Worktree-Stand gegen den Basis-Branch, das Pre-Commit-Panel ist worktree-bewusst, und beim Archivieren wird der Worktree mit Dirty-Schutz aufgeräumt. Der Branch lässt sich über das **Merge-Modal** („vs. main"-Tab bzw. Verlauf-Aktion) nach `main`/`master` zurückführen — Voraussetzung ist ein sauberer Haupt-Checkout, der auf dem Basis-Branch steht. **Terminal-Sessions (Quick-Shells) bekommen keinen Worktree** (Schema-Ausschluss) — sie brauchen weder Branch noch Diff-Baseline.

### Bracketed-Paste-fähige Trigger

Texte, die via Bracketed Paste an die aktive Claude-Code-Session gesendet werden — z.B. Trigger-Phrasen oder befüllte Templates. Müssen einzeilig oder mit Bracketed Paste umschlossen sein, sonst startet Claude Code die Verarbeitung schon nach der ersten Zeile.

### Lifecycle-States

Die 5 möglichen Status einer Session, geführt durch die zentrale State-Machine `SessionLifecycle` im Main-Prozess:

- **running** — Claude Code arbeitet aktiv (letzte JSONL-Aktivität < 3 s)
- **idle** — Spawned, aber inaktiv (letzte JSONL-Aktivität ≥ 3 s, kein Exit)
- **completed** — Geordneter Exit, claude-Prozess hat sich selbst beendet
- **interrupted** — Hard-Stop (App-Quit, Hard-Crash, User schließt Tab während running)
- **error** — Spawn-Fehler oder Lifecycle-Inkonsistenz

Sichtbar im UI als Sidebar-Status-Dot-Farben (grün/orange/grau), Verlauf-Filter, Resume-Bedingungen. Resume ist erlaubt aus `completed` / `interrupted` / `error` — nicht aus `running` / `idle` (laufende Session, wird via Tab-Wechsel weiterverwendet).

### encodeCwd

Projekt-spezifische Mapping-Konvention: Aus einem Working-Directory-Pfad (z.B. `D:\Projekte\TanaLib`) wird der entsprechende JSONL-Container-Pfad in `~/.claude/projects/` abgeleitet. Claude Code escaped Path-Separatoren (`/`, `\`) zu `-`, sodass `D:\Projekte\TanaLib` zu `D--Projekte-TanaLib` wird. TakumiDeck implementiert dieselbe Transformation, um JSONL-Files den eigenen Sessions zuzuordnen.

### Legacy-Bucket (`__default__`-Project)

Sammel-Container für Sessions, die in Sprint 2/3 gespawnt wurden, bevor der Workspace-Scanner (Sprint 4) existierte. Diese Sessions haben `project_id` = `00000000-0000-0000-0000-000000000001` und werden in der Sidebar unter „Sprint-2/3-Legacy" gezeigt, sofern `session_count > 0`. Im Verlauf-Panel sichtbar, Resume funktioniert seit dem Sprint-6-Hotfix. Bei Erstinstallation ab Phase 1 nicht mehr relevant.

### Kontext-Balken

UI-Element pro Session, zeigt aktuell genutzten Kontext (`input_tokens + cache_creation + cache_read`) gegen das Modell-Limit. Snapshot-basiert (letzter Wert, nicht Maximum). Farb-Schwellen: gelb 70%, orange 85%, rot 95%.

### Limit-Bar / Plannutzungs-Bar

UI-Element im PlanPane für globale Token-Limits (5 h, weekly all, weekly top-tier, weekly sonnet, custom). Stellt aggregierten Verbrauch über eine Zeitspanne in % des P90-Schätzlimits dar — im Gegensatz zum **Kontext-Balken**, der nur die aktuelle Session und den aktuellen Modell-Kontext zeigt. Konfigurierbar via `limit_bars[]` im Settings-JSON-Editor.