---
variables:
  PROJEKT_NAME:         { auto: project.name }
  DATUM:                { auto: today }
  FIX_TRIGGER:          { auto: claude_md.workbench.trigger_phrases.fix }
  BEREICHE:             { input: text,     label: "Bereiche (kommagetrennt, z.B. DB,Core,UI_SHELL)", required: true }
  DATEIEN_PRO_BEREICH:  { input: textarea, label: "Dateien pro Bereich (Format siehe Vorlage)",       required: true }
  FOKUS:                { input: textarea, label: "Zusätzliche Prüfschwerpunkte (optional)" }
  HINWEISE:             { input: textarea, label: "Hinweise für diesen Lauf (optional)" }
---

# Code-Review-Start-Template

Dieses Template startet einen **Code-Review-Lauf** mit dem Sub-Agent-Pattern. TakumiDeck (App) liest es, befüllt die `{{...}}`-Variablen und sendet das Ergebnis ans aktive PTY via Bracketed Paste.

**Konzept:** Der Haupt-Agent (der diesen Prompt empfängt) führt den Review **nicht selbst durch**. Er ist Orchestrator und mir gegenüber berichtspflichtig:

1. Pro Bereich startet er einen **Sub-Agent**, der mit dem Bauplan aus [docs/code-review/TEMPLATE.md](../code-review/TEMPLATE.md) und der bereichsspezifischen [OFFEN_<BEREICH>.md](../code-review/OFFEN_TEMPLATE.md) gefüttert wird.
2. Sub-Agents lesen, prüfen, melden Befunde — sie ändern **nichts**.
3. Der Haupt-Agent sammelt alle Berichte ein, konsolidiert sie pro Bereich und Kategorie und legt sie mir vor.
4. Ich entscheide pro Befund: **fix-Trigger** (siehe `workbench.trigger_phrases.fix` in CLAUDE.md), **in OFFEN aufnehmen**, **in nächste Phase verschieben**.
5. Erst nach meinem Signal werden Fixes durchgeführt.

**Auto-Variablen** (von TakumiDeck befüllt):

- `{{PROJEKT_NAME}}` — aus CLAUDE.md (`workbench.project_name`)
- `{{DATUM}}` — heute (`YYYY-MM-DD`)
- `{{FIX_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.fix`)

**User-Variablen** (im Formular einzugeben):

- `{{BEREICHE}}` — Pflicht, kommagetrennt (z.B. `DB,Core,UI_SHELL`)
- `{{DATEIEN_PRO_BEREICH}}` — Pflicht, Block pro Bereich (Format siehe Vorlage)
- `{{FOKUS}}` — Optional, zusätzliche Prüfschwerpunkte (z.B. „Thread-Safety", „SQL-Injection")
- `{{HINWEISE}}` — Optional, Scope-Abgrenzung oder besondere Kontext-Hinweise

---

## Vorlage (Inhalt)

```text
Code-Review-Lauf — {{DATUM}}
Bereiche: {{BEREICHE}}

Du bist der Orchestrator. Du führst den Review NICHT selbst durch.
Du startest pro Bereich einen Sub-Agent und sammelst die Berichte ein.

Pflicht-Lektüre vor dem Start
- docs/code-review/TEMPLATE.md  (Bauplan und Template-Prompt)
- Pro genanntem Bereich: docs/code-review/OFFEN_<BEREICH>.md
  Falls die Datei für einen Bereich noch nicht existiert: frag mich, ob du sie aus
  docs/code-review/OFFEN_TEMPLATE.md anlegen sollst — leg sie nicht ungefragt an.

Bereichs-Scope (Datei-Listen)
{{DATEIEN_PRO_BEREICH}}

Format-Beispiel für die Datei-Listen:

  ## DB
  - core/db/schema.py
  - core/db/migrations/0007_add_album.py

  ## Core
  - core/scanner.py
  - core/parser.py

Zusätzliche Prüfschwerpunkte (optional)
{{FOKUS}}

Hinweise für diesen Lauf (optional)
{{HINWEISE}}

Ablauf, dem du folgst
1. Lies docs/code-review/TEMPLATE.md komplett.
2. Lies pro Bereich die zugehörige docs/code-review/OFFEN_<BEREICH>.md komplett —
   die dortigen Punkte sind bewusst offen, dürfen NICHT erneut gemeldet werden.
3. Starte pro Bereich EINEN Sub-Agent (general-purpose oder Explore — Explore wenn
   reine Lektüre, general-purpose wenn größere Querverbindungen). Der Sub-Agent-
   Prompt entsteht aus dem Template-Prompt in docs/code-review/TEMPLATE.md, gefüllt
   mit der bereichsspezifischen Datei-Liste, der zugehörigen OFFEN_<BEREICH>.md
   und den optionalen Prüfschwerpunkten.
   Wichtig: Jeder Sub-Agent ist read-only. Im Prompt explizit untersagen:
   keine Edits, keine Writes, kein Refactoring.
4. Wenn Bereiche unabhängig sind: starte die Sub-Agents PARALLEL (mehrere Agent-
   Aufrufe in einer einzigen Antwort).
5. Sammle alle Berichte ein. Konsolidiere zu EINEM Report:
   - gegliedert nach Bereich
   - innerhalb jedes Bereichs nach Kategorie (Bug / Warnung / Verbesserung / Design-by-Choice)
   - jeder Befund mit Datei:Zeile und einer 1-Satz-Empfehlung
   - markiere für jeden Befund: NEU vs. (versehentlich) Wiederholung aus OFFEN
6. Berichte mir den konsolidierten Report.
7. Frag mich pro Befund (oder pro Befund-Gruppe) was passieren soll:
   - „{{FIX_TRIGGER}}" — sofort fixen
   - „OFFEN" — als bewusst offen in die zugehörige OFFEN_<BEREICH>.md aufnehmen
   - „verschieben" — in die nächste Roadmap-Phase eintragen
   - „verwerfen" — kein Befund, ignorieren
8. Erst nach meiner Antwort: ausführen. Niemals selbständig fixen.
9. Nach Abarbeitung: kurze Schluss-Bilanz (Anzahl gefixt / Anzahl in OFFEN /
   Anzahl verschoben / Anzahl verworfen).

Was du NICHT tust
- Keinen Befund eigenmächtig fixen.
- Keine Refactorings „on the way".
- Keine Doku-Updates ohne explizites Signal (siehe CLAUDE.md Regel 3).
- Keine Befunde melden, die schon in OFFEN_<BEREICH>.md stehen.
```

---

## Wann ein Bereich, wann mehrere?

Pro Lauf typischerweise **2–4 Bereiche parallel**. Mehr lohnt selten — der konsolidierte Report wird sonst unübersichtlich, und du kannst Befunde nicht mehr in Ruhe einzeln entscheiden.

Wenn ein Bereich „zu groß" ist (Sub-Agent muss > ~2000 Zeilen lesen), splitte ihn in Unter-Bereiche, z.B.:

- `UI_SHELL` (Haupt-Layout, Navigation)
- `UI_DETAILS` (Formulare, einzelne Views)

Pro Unter-Bereich eine eigene `OFFEN_<UNTER_BEREICH>.md`.

## Warum Sub-Agents statt der Haupt-Agent direkt?

- **Kontext-Isolation** — der Haupt-Agent behält freien Kontext für die Konsolidierung und für deine Folge-Entscheidungen. Detail-Lektüre der Code-Dateien fällt im Sub-Agent an, nicht im Hauptkontext.
- **Parallelität** — unabhängige Bereiche laufen gleichzeitig.
- **Berichtspflicht** — der Haupt-Agent sieht nur den finalen Report jedes Sub-Agents, also dieselbe Sicht wie du. Das zwingt zur sauberen Befund-Formulierung.

## Wann kein Code-Review, sondern eine andere Vorlage?

- **Releasevorbereitung** → [RELEASE_START.md](./RELEASE_START.md). Der Release-Review prüft *alle Änderungen seit der letzten Version*, nicht *einen Bereich*.
- **Konkreter Bug** → [BUG_REPORT.md](./BUG_REPORT.md). Bug-Reports zielen auf eine spezifische Fehlbeobachtung, nicht auf eine flächige Prüfung.
- **Security-Audit** großer Größenordnung → eigenes Format, externe Checkliste (siehe Hinweis in `code-review/TEMPLATE.md`).
