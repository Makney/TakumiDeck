---
variables:
  PROJEKT_NAME:    { auto: project.name }
  DATUM:           { auto: today }
  FIX_TRIGGER:     { auto: claude_md.workbench.trigger_phrases.fix }
  DOCS_TRIGGER:    { auto: claude_md.workbench.trigger_phrases.docs_update }
  COMMIT_TRIGGER:  { auto: claude_md.workbench.trigger_phrases.commit }
  BEREICHE:        { input: text,     label: "Bereiche (kommagetrennt, z.B. DB,IPC,PANELS — oder 'alle')", required: true }
  EINTRAEGE:       { input: textarea, label: "Konkrete Einträge (Block je Bereich, Kennung je Eintrag — oder 'alle')", required: true }
  AUSSCHLUSS:      { input: textarea, label: "Einträge, die diesmal NICHT angefasst werden (optional)" }
  HINWEISE:        { input: textarea, label: "Hinweise für diesen Lauf (optional)" }
---

# OFFEN-Abarbeiten-Template

Dieses Template startet einen **Abarbeitungs-Lauf** für Befunde, die in einer oder mehreren `docs/code-review/OFFEN_<BEREICH>.md` als bewusst offen markiert sind. TakumiDeck (App) liest es, befüllt die `{{...}}`-Variablen und sendet das Ergebnis ans aktive PTY via Bracketed Paste.

**Konzept:** Der Agent, der diesen Prompt empfängt, ist Implementierer und mir gegenüber berichtspflichtig. Anders als beim Code-Review-Lauf werden hier **keine neuen Befunde gesucht**, sondern **bereits dokumentierte Punkte gezielt abgearbeitet**. Pro Eintrag:

1. Agent liest den Eintrag in der zugehörigen `OFFEN_<BEREICH>.md` vollständig (Befund + Begründung + Trigger).
2. Agent liest die im Eintrag genannten Quell-Dateien vollständig (kein grep-only).
3. Agent zeigt Plan: was wird angefasst, welche Variante (A/B/C, falls eine Lösungsskizze existiert), welcher Test/welche manuelle Verifikation.
4. Ich entscheide pro Eintrag: **fix-Trigger** → umsetzen, **überspringen** → nächster Eintrag, **verschieben** → Eintrag in `OFFEN_<BEREICH>.md` bleibt offen.
5. Nach Umsetzung: Agent markiert den Eintrag mit einem `**Behoben:**`-Trailer und verschiebt ihn per Archive-Skript ins `archiv/ARCHIV_<BEREICH>.md` (Pflege-Regel aus [OFFEN_TEMPLATE.md](../code-review/OFFEN_TEMPLATE.md)).

**Auto-Variablen** (von TakumiDeck befüllt):

- `{{PROJEKT_NAME}}` — aus CLAUDE.md (`workbench.project_name`)
- `{{DATUM}}` — heute (`YYYY-MM-DD`)
- `{{FIX_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.fix`)
- `{{DOCS_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.docs_update`)
- `{{COMMIT_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.commit`)

**User-Variablen** (im Formular einzugeben):

- `{{BEREICHE}}` — Pflicht, kommagetrennt (z.B. `DB,IPC,PANELS`). `alle` schließt jede vorhandene `OFFEN_<BEREICH>.md` ein.
- `{{EINTRAEGE}}` — Pflicht, Block pro Bereich mit Kennungen (`###`-Überschrift des Eintrags oder Review-ID wie `V1`/`W-1`). `alle` bedeutet: jeden noch offenen Eintrag dieses Bereichs.
- `{{AUSSCHLUSS}}` — Optional, Kennungen die diesmal explizit nicht angefasst werden sollen (z.B. weil sie eine größere Entscheidung erfordern).
- `{{HINWEISE}}` — Optional, Reihenfolge-Wünsche, Scope-Schärfung, Erinnerung an Test-Daten.

---

## Vorlage (Inhalt)

```text
OFFEN-Abarbeiten — {{DATUM}}
Bereiche: {{BEREICHE}}

Du bist Implementierer. Du suchst KEINE neuen Befunde.
Du arbeitest ausschließlich die unten genannten, bereits dokumentierten
Einträge aus den OFFEN_<BEREICH>.md-Dateien ab — Eintrag für Eintrag,
auf mein „{{FIX_TRIGGER}}"-Signal.

Pflicht-Lektüre vor dem Start
- CLAUDE.md                                (Working Rules, insb. Variants-Regel + Trigger)
- docs/CODING_RULES.md                     (Simplicity First, Surgical Changes)
- docs/MARKDOWN_RULES.md                   (für die OFFEN-/Archiv-Annotationen)
- docs/code-review/OFFEN_TEMPLATE.md       (Pflege-Regeln + Archive-Skript-Workflow)
- Pro genanntem Bereich: docs/code-review/OFFEN_<BEREICH>.md
  Falls eine genannte OFFEN-Datei nicht existiert: STOPP, frag mich.
  Leg sie NICHT ungefragt aus dem Template an — in diesem Lauf wird
  abgearbeitet, nicht initialisiert.

Zu bearbeitende Einträge
{{EINTRAEGE}}

Format-Beispiel für die Eintrags-Liste:

  ## PANELS
  - TerminalTab Auto-Send-Timer kapselt isActive als Closure-Snapshot
  - Markdown-Preview-Layout-Switch wirkt tab-/mount-lokal

  ## DB
  - alle  (jeder noch offene Eintrag in OFFEN_DB.md)

Explizit ausgeschlossen (optional)
{{AUSSCHLUSS}}

Hinweise für diesen Lauf (optional)
{{HINWEISE}}

Ablauf, dem du folgst

Phase 1 — Inventur und Reihenfolge
1. Lies die Pflicht-Lektüre komplett.
2. Pro Bereich: lies die OFFEN_<BEREICH>.md vollständig. Sammle die Einträge,
   die in „Zu bearbeitende Einträge" stehen (`alle` = jeder Eintrag, der noch
   keinen „Behoben:"-Trailer trägt).
3. Subtrahiere alle Einträge, die in „Explizit ausgeschlossen" stehen.
4. Berichte mir die finale Arbeits-Liste als Tabelle:
     Bereich · Kennung · Datei:Zeile · Kategorie · vermuteter Aufwand
   Schlag eine Bearbeitungs-Reihenfolge vor (kleinste Risiken / kürzeste
   Wege zuerst; oder thematisch zusammen, falls mehrere Einträge dieselbe
   Datei berühren).
5. Frag mich, ob du mit dem ersten Eintrag beginnen sollst — STOPP hier.

Phase 2 — Pro Eintrag: Plan → mein „{{FIX_TRIGGER}}" → Umsetzung
Wiederhole für jeden Eintrag der Liste:

6. Lies den OFFEN-Eintrag im Original (Befund, Begründung, Trigger) und
   die im Eintrag referenzierten Quell-Dateien VOLLSTÄNDIG. Kein grep-only.
   Wenn der Code seit dem Review-Zeitpunkt verändert wurde (Zeilennummern
   passen nicht mehr, betroffene Funktion umbenannt o.ä.): erst klären —
   ist der Befund noch real? Wenn nein: vorschlagen, den Eintrag als
   „gegenstandslos" zu archivieren statt zu fixen.
7. Stelle den Plan vor:
   - Was wird angefasst (Dateien + Zeilen / neue Datei).
   - Welche Variante wählst du (falls eine Lösungsskizze A/B/C anbietet) und
     warum — kurze Begründung, keine Doktorarbeit.
   - Bei nicht-trivialem Eingriff: Varianten A/B/C inkl. Aufwand und klarer
     Empfehlung präsentieren (CLAUDE.md Regel 2). Wenn der OFFEN-Eintrag
     bereits eine Lösungsskizze enthält, übernimm sie und ergänze deinen
     Empfehlungs-Stand.
   - Wie wird verifiziert (gezielter Test, manueller UI-Check, ggf. neuer
     Test-Fall — CLAUDE.md Regel 4 nennt den erlaubten Test-Scope).
8. Warte auf mein „{{FIX_TRIGGER}}". Erst dann ändern. Wenn ich „überspringen"
   sage: weiter mit dem nächsten Eintrag, ohne Datei-Änderung. Wenn ich
   „verschieben" sage: OFFEN-Eintrag bleibt offen, Notiz im Bericht.
9. Setze um. Nur den Eintrag — keine „on-the-way"-Refactorings, keine
   Doku-Updates ohne separates Signal (CLAUDE.md Regel 3).
10. Verifiziere wie in Phase 2.7 angekündigt. Ergebnis kurz berichten.
11. Markiere den Eintrag in OFFEN_<BEREICH>.md gemäß OFFEN_TEMPLATE.md-
    Pflege-Regel mit einem Trailer direkt unter dem Eintrag — NICHT von Hand
    ins Archiv kopieren, das macht das Skript:

      **Behoben:** {{DATUM}} · Variante <X> · <Auflösungs-Notiz / Verifikation>

    Für gegenstandslose Einträge denselben Trailer, aber:

      **Behoben:** {{DATUM}} · gegenstandslos · <kurze Begründung>

    Den ursprünglichen Befund-/Begründungs-Text stehen lassen, damit der
    historische Kontext beim Verschieben ins Archiv erhalten bleibt.
12. Nächster Eintrag.

Phase 3 — Archivierung, Schluss-Bilanz und Doku
13. Wenn alle bearbeiteten Einträge ihren „Behoben:"-Trailer haben, das
    Archive-Skript laufen lassen — erst Trockenlauf, dann anwenden:
      py scripts/archive-resolved.py            (zeigt, was verschoben würde)
      py scripts/archive-resolved.py --apply     (schneidet markierte Einträge
                                                   aus und hängt sie ans passende
                                                   archiv/ARCHIV_<BEREICH>.md)
    Den Trockenlauf-Output kurz berichten, bevor du --apply ausführst.
14. Schluss-Bilanz:
    - Anzahl behoben / übersprungen / gegenstandslos / verschoben
    - Liste der geänderten Dateien (Quell-Code + OFFEN-/Archiv-Dateien)
    - Pro behobenem Eintrag: 1-Satz „was tut sich jetzt anders"
15. KEIN Doku-Update jenseits der OFFEN-/Archiv-Pflege, solange ich nicht
    „{{DOCS_TRIGGER}}" gesagt habe. Wenn etwas in CHANGELOG / FEATURES /
    TECH_SCHULDEN gehört, schlag es vor, schreib es noch nicht.
16. KEIN git-Commit, solange ich nicht „{{COMMIT_TRIGGER}}" gesagt habe.

Was du NICHT tust
- Keine neuen Befunde melden (das ist Sache von CODE_REVIEW_START.md).
- Keinen Eintrag ohne mein „{{FIX_TRIGGER}}"-Signal umsetzen.
- Keinen OFFEN-Eintrag von Hand löschen oder ins Archiv kopieren — nur den
  „Behoben:"-Trailer setzen und das Skript verschieben lassen (OFFEN_TEMPLATE.md).
- Keine Refactorings „on the way" außerhalb des aktuellen Eintrags.
- Keine Doku-Updates ohne „{{DOCS_TRIGGER}}", außer der OFFEN-/Archiv-Pflege
  selbst, die Teil der Abarbeitung ist.
- Keine Commits ohne „{{COMMIT_TRIGGER}}".
- Keine Änderung an Einträgen aus dem Ausschluss-Block.
```

---

## Wann dieses Template, wann CODE_REVIEW_START.md?

| Situation | Template |
| --- | --- |
| „Schau dir Bereich X nochmal an, finde neue Befunde" | [CODE_REVIEW_START.md](./CODE_REVIEW_START.md) |
| „Arbeite die offenen Punkte aus OFFEN_<BEREICH>.md ab" | dieses Template |
| „Eine konkrete Fehlbeobachtung soll gefixt werden" | [BUG_REPORT.md](./BUG_REPORT.md) |
| „Neues Feature bauen" | [SEASON_PROMPT.md](./SEASON_PROMPT.md) |
| „Release vorbereiten" (inkl. Diff-Review) | [RELEASE_START.md](./RELEASE_START.md) |

Die saubere Trennung verhindert, dass ein Abarbeitungs-Lauf zur erneuten Review entartet — und dass eine Review zur stillen Abarbeitung wird, bei der die Entscheidung „offen halten oder fixen?" übersprungen wird.

## Warum kein Sub-Agent-Pattern?

Anders als bei Code-Review und Release ist hier die Kontext-Last gering: die OFFEN-Einträge sind bereits konsolidiert, der Scope pro Eintrag ist klein, und jede Umsetzung braucht mein „{{FIX_TRIGGER}}"-Signal. Ein Sub-Agent würde nur Latenz und Berichts-Overhead hinzufügen, ohne Parallelitätsgewinn — sequentielle Einzel-Bearbeitung ist hier richtig.

Ausnahme: wenn `{{BEREICHE}} = alle` und die Arbeits-Liste in Phase 1 sehr lang wird (mehr als ~10 Einträge in unabhängigen Bereichen), darfst du in Phase 1.4 fragen, ob ich den Lauf splitten möchte (z.B. erst DB+IPC, dann PANELS). Splitten ist mir lieber als zu lange Wartezeiten zwischen meinen Entscheidungs-Signalen.

## Was passiert mit Einträgen, die durch zwischenzeitliche Änderungen gegenstandslos sind?

Phase 2.6 deckt das ab: der Agent prüft, ob der Befund noch real ist. Wenn nein, wird der Eintrag nicht als „behoben" archiviert, sondern mit dem Trailer `**Behoben:** {{DATUM}} · gegenstandslos · <Begründung>` versehen — z.B. *„Funktion wurde in Season 31 entfernt"*. Das Archive-Skript verschiebt ihn dann mit dieser Notiz ins `archiv/ARCHIV_<BEREICH>.md`. So bleibt der historische Kontext erhalten, aber spätere Reviews sehen, warum der Eintrag nicht mehr verfolgt wird.

## Was wenn der OFFEN-Eintrag schon eine Lösungsskizze enthält?

Dann übernimmt der Agent in Phase 2.7 diese Empfehlung als Default-Variante, präsentiert sie aber trotzdem mir zur Bestätigung. Begründung: zwischen dem Review-Zeitpunkt und dem Abarbeitungs-Lauf können Wochen liegen — die ursprüngliche Empfehlung ist Input, nicht Befehl. Wenn der Agent eine bessere Variante sieht (z.B. weil sich die Architektur drumherum geändert hat), darf er sie vorschlagen — als zusätzliche Option neben der Original-Empfehlung, nicht als Ersatz.
