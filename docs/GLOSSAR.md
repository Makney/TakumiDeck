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

Git-Mechanismus zum Auschecken eines Branches in einen separaten Ordner. Erlaubt parallele Arbeit an mehreren Branches im gleichen Repo. **Im MVP nicht genutzt** — Schema vorhanden für spätere Aktivierung.

### Bracketed-Paste-fähige Trigger

Texte, die via Bracketed Paste an die aktive Claude-Code-Session gesendet werden — z.B. Trigger-Phrasen oder befüllte Templates. Müssen einzeilig oder mit Bracketed Paste umschlossen sein, sonst startet Claude Code die Verarbeitung schon nach der ersten Zeile.

### Kontext-Balken

UI-Element pro Session, zeigt aktuell genutzten Kontext (`input_tokens + cache_creation + cache_read`) gegen das Modell-Limit. Snapshot-basiert (letzter Wert, nicht Maximum). Farb-Schwellen: gelb 70%, orange 85%, rot 95%.