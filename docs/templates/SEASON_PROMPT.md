# Season-Prompt-Template

Dieses Template wird beim Erstellen einer neuen Season-Session verwendet. TakumiDeck (App) liest es, befüllt die `{{...}}`-Variablen automatisch + via Formular und sendet das Ergebnis ans aktive PTY via Bracketed Paste.

**Auto-Variablen** (von TakumiDeck befüllt):

- `{{PROJEKT_NAME}}` — aus CLAUDE.md
- `{{NEXT_SEASON_NR}}` — aus SQLite (next_season_number)
- `{{CURRENT_PHASE_FILE}}` — aus CLAUDE.md (`workbench.current_phase_file`)
- `{{DATUM}}` — heute (`YYYY-MM-DD`)

**Optionale Auto-Variablen** (Phase 2 Season 4 — opt-in pro Template):

- `{{LETZTE_SEASON_NAME}}` — letzte completed Feature-Session
- `{{TECH_SCHULDEN_RELEVANT}}` — Top-3 offene Einträge aus `docs/TECH_SCHULDEN.md`
- `{{LETZTE_ENTSCHEIDUNGEN}}` — Top-3 aus `docs/ENTSCHEIDUNGEN.md`

**User-Variablen** (im Formular einzugeben):

- `{{FEATURE_NAME}}` — Pflicht
- `{{AUFGABE}}` — Pflicht
- `{{HINWEISE}}` — Optional

---

## Vorlage (Inhalt)
```
Season {{NEXT_SEASON_NR}}: {{FEATURE_NAME}}
Einstieg: Diese Dateien zuerst lesen

docs/CHANGELOG.md              — Was wurde zuletzt gebaut? (oberster Eintrag reicht)
docs/FEATURES.md               — Aktueller Feature-Status
{{CURRENT_PHASE_FILE}}         — Offene Features der aktuellen Phase
/memory prüfen                 — Veraltete Auto-Memory-Einträge können CLAUDE.md-Regeln überschreiben

Deine Aufgabe
{{AUFGABE}}
Hinweise für diese Season (optional)
{{HINWEISE}}
```
---

## Welche Roadmap-Datei ist die richtige?

`{{CURRENT_PHASE_FILE}}` wird automatisch aus der CLAUDE.md gelesen. Falls manuell zu setzen:

| Aufgabe gehört zu                 | Datei                              |
| --------------------------------- | ---------------------------------- |
| MVP / Lauffähigkeit               | `docs/roadmap/PHASE1.md`           |
| Komfort / v1.0                    | `docs/roadmap/PHASE2.md`           |
| Power-Features / langfristig      | `docs/roadmap/PHASE3.md`           |
| Unklar / übergreifend             | `docs/roadmap/ROADMAP.md` (Übersicht) |

---

## Warum so kurz?

`CLAUDE.md` wird automatisch geladen und enthält bereits:

- Projekt-Steckbrief + Verweis auf Architektur-Doku
- Alle Working Rules (inkl. Trigger-Phrasen)
- Coding-Prinzipien und Doku-Update-Regeln

Das Template kommuniziert nur noch das **Was** (Aufgabe) und das **Wann nicht** (Scope-Abgrenzung via Hinweise). Alles andere ist bereits im Kontext.

## Was gehört in „Hinweise" und was nicht?

**Gehört rein:**

- Vorab-Entscheidungen (z.B. „keine neue Abhängigkeit hinzufügen")
- Scope-Abgrenzung zu nahen Features („Feature X ist NICHT Teil dieser Season")
- Bekannte Fallstricke aus ähnlichen Seasons
- Empfohlene Lese-Reihenfolge bei verschachtelten Features

**Gehört NICHT rein:**

- Architektur-Wiederholung (steht in `ARCHITEKTUR.md` / `TAKUMIDECK_ARCHITEKTUR.md`)
- Regel-Wiederholung (steht in `CLAUDE.md` + `CODING_RULES.md`)
- Detaillierte Umsetzungs-Schritte (erzwingt Tunnelblick; lieber Ziele beschreiben und dem Agenten die Wahl lassen)

---

## Beispiel: Befüllter Prompt

Bei einer realen Season könnte der finale Prompt so aussehen (am Beispiel einer fiktiven Season 3 für TakumiDeck):
```
Season 3: PTY-Spawn
Einstieg: Diese Dateien zuerst lesen

docs/CHANGELOG.md              — Was wurde zuletzt gebaut?
docs/FEATURES.md               — Aktueller Feature-Status
docs/roadmap/PHASE1.md         — Offene Features der aktuellen Phase
/memory prüfen

Deine Aufgabe
Implementiere PTY-Spawn für Claude-Code-Sessions:

IPC-Channels pty:create, pty:write, pty:resize, pty:kill
Buffer-Throttling (16ms)
Session-DB-Insert beim Spawn

Voraussetzung: SQLite-Schema läuft, IPC-Foundation steht.
Hinweise für diese Season (optional)

Library: @homebridge/node-pty-prebuilt-multiarch (keine andere)
xterm.js-Integration ist NICHT Teil dieser Season — kommt in Sprint 2 Feature 2
Einlesen: TAKUMIDECK_ARCHITEKTUR.md Kapitel 3 (Prozess-Architektur)
```