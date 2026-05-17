---
variables:
  PROJEKT_NAME:        { auto: project.name }
  DATUM:               { auto: today }
  CURRENT_PHASE_FILE:  { auto: claude_md.workbench.current_phase_file }
  CURRENT_VERSION:     { auto: claude_md.workbench.current_version }
  FIX_TRIGGER:         { auto: claude_md.workbench.trigger_phrases.fix }
  BUG_TITEL:           { input: text,     label: "Bug-Titel",                  required: true }
  SYMPTOM:             { input: textarea, label: "Symptom",                    required: true }
  REPRODUKTION:        { input: textarea, label: "Reproduktion (Schritte)",    required: true }
  ERWARTET:            { input: textarea, label: "Erwartetes Verhalten",       required: true }
  BETROFFENE_DATEIEN:  { input: textarea, label: "Verdachtsbereich (optional)" }
  UMGEBUNG:            { input: text,     label: "Umgebung (optional)" }
  ZUSATZINFO:          { input: textarea, label: "Zusatzinfo (optional)" }
---

# Bug-Report-Template

Dieses Template wird verwendet, um einen Bug strukturiert an den Agenten zu melden. TakumiDeck (App) liest es, befüllt die `{{...}}`-Variablen automatisch + via Formular und sendet das Ergebnis ans aktive PTY via Bracketed Paste.

**Auto-Variablen** (von TakumiDeck befüllt):

- `{{PROJEKT_NAME}}` — aus CLAUDE.md (`workbench.project_name`)
- `{{DATUM}}` — heute (`YYYY-MM-DD`)
- `{{CURRENT_PHASE_FILE}}` — aus CLAUDE.md (`workbench.current_phase_file`)
- `{{CURRENT_VERSION}}` — aus CLAUDE.md (`workbench.current_version`)
- `{{FIX_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.fix`)

**User-Variablen** (im Formular einzugeben):

- `{{BUG_TITEL}}` — Pflicht, kurze Kennung (z.B. „Scanner findet umbenannte Datei nicht")
- `{{SYMPTOM}}` — Pflicht, was siehst du tatsächlich?
- `{{REPRODUKTION}}` — Pflicht, Schritt-für-Schritt zum Auslösen
- `{{ERWARTET}}` — Pflicht, was sollte stattdessen passieren?
- `{{BETROFFENE_DATEIEN}}` — Optional, Verdachtsbereich (Datei/Modul) wenn bekannt
- `{{UMGEBUNG}}` — Optional, OS, Version, Datenstand falls relevant
- `{{ZUSATZINFO}}` — Optional, Logs, Traceback, Screenshots-Pfad

---

## Vorlage (Inhalt)

```text
Bug: {{BUG_TITEL}}
Datum: {{DATUM}} · Version: {{CURRENT_VERSION}}

Einstieg: Diese Dateien zuerst lesen

docs/CHANGELOG.md              — Wurde der betroffene Bereich kürzlich geändert?
docs/FEATURES.md               — Ist das Feature überhaupt als ✅ markiert?
{{CURRENT_PHASE_FILE}}         — Steht der Bug schon offen in der aktuellen Phase?

Symptom
{{SYMPTOM}}

Reproduktion (Schritt-für-Schritt)
{{REPRODUKTION}}

Erwartetes Verhalten
{{ERWARTET}}

Verdachtsbereich (optional)
{{BETROFFENE_DATEIEN}}

Umgebung (optional)
{{UMGEBUNG}}

Zusatzinfo (optional)
{{ZUSATZINFO}}

Deine Aufgabe
1. Reproduziere den Bug gedanklich anhand des Codes (lies die Verdachts-Dateien
   vollständig, nicht nur grep'en).
2. Identifiziere die Ursache (Root Cause), nicht nur das Symptom.
3. Präsentiere: (a) was schiefläuft und warum, (b) Fix-Vorschlag in Klartext,
   (c) ggf. Varianten A/B/C bei nicht-trivialem Eingriff.
4. Warte auf mein „{{FIX_TRIGGER}}" bevor du etwas änderst.
5. Nach dem Fix: gezielter Test nur für diesen Bug (siehe CLAUDE.md Regel 4).
```

---

## Was gehört in „Symptom" und was in „Erwartet"?

- **Symptom** beschreibt **was du siehst**, ohne Interpretation. Beispiel: „Spalte ‚Album' bleibt leer, nachdem Datei gescannt wurde."
- **Erwartet** beschreibt **was stattdessen passieren sollte**. Beispiel: „Album sollte aus dem ID3-Tag der Datei übernommen werden."

Die Trennung hilft dem Agenten, nicht ungewollt das Symptom als Spec zu interpretieren.

## Wann kein Bug-Report, sondern eine Season?

- **Funktion fehlt komplett** → das ist kein Bug, sondern ein Feature. Nutze stattdessen `SEASON_PROMPT.md`.
- **Funktion ist da, verhält sich aber falsch** → Bug-Report ist richtig.
- **Funktion ist da, ist aber unschön / langsam / unergonomisch** → kein Bug. Eintrag in `docs/TECH_SCHULDEN.md` oder Roadmap-Phase.

## Warum „warte auf den fix-Trigger"?

Bug-Reports sind häufig unterspezifiziert. Bevor der Agent eine Annahme zementiert, soll er die Ursache benennen und den Fix-Plan zeigen — damit du noch korrigieren kannst, falls die Diagnose den falschen Pfad nimmt. Das ist die gleiche Logik wie bei Code-Reviews.

Welche Phrase konkret als „fix"-Trigger zählt, steht in `CLAUDE.md` unter `workbench.trigger_phrases.fix` — TakumiDeck setzt sie beim Paste in `{{FIX_TRIGGER}}` ein.
