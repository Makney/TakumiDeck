# Code-Review — Bekannte offene Punkte ({{BEREICH}})

Diese Datei ist die **Vorlage**. Pro Review-Bereich wird eine Kopie mit sprechendem Namen angelegt, z.B.:

- `CODE_REVIEW_OFFEN_DB.md`
- `CODE_REVIEW_OFFEN_CORE.md`
- `CODE_REVIEW_OFFEN_UI_SHELL.md`
- `CODE_REVIEW_OFFEN_UI_DETAILS.md`
- `CODE_REVIEW_OFFEN_API.md`

## Zweck

Befunde, die während eines Code-Reviews aufkommen, aber **bewusst nicht gefixt** werden — weil sie außerhalb des aktuellen Scopes liegen, weil sie eine größere Entscheidung erfordern, oder weil sie Design by Choice sind. Landen sie hier, meldet sie der nächste Review-Durchgang nicht erneut.

## Format pro Eintrag

- `###`-Überschrift mit kurzer Kennung
- Datei + Zeilenreferenz (`datei.ext:42`)
- **Kategorie:** Bug / Warnung / Verbesserung / Design-by-Choice
- **Beschreibung:** 1–3 Sätze, was der Befund ist
- **Begründung:** warum er offen bleibt (Scope / Aufwand / Priorität / bewusste Entscheidung)
- Optional **Trigger:** unter welcher Bedingung der Befund doch angegangen wird

---

## Beispiel-Eintrag

### Umbenannte Datei erzeugt verwaiste DB-Zeile

- `core/scanner.py:142` · Kategorie: **Warnung**
- **Beschreibung:** Wenn eine Datei auf der Platte umbenannt wird, legt der Scanner einen neuen Eintrag an und markiert den alten als `missing = 1`. Die alte Zeile wird nicht automatisch zur neuen umgeschrieben.
- **Begründung:** Fuzzy-Matching für Umbenennungs-Erkennung ist eigenes Feature in Phase 2. Aktuell löst der Nutzer das über das Pill-Menü („Datei neu zuordnen").
- **Trigger:** sobald das Feature „Umbenennungs-Erkennung" aus `roadmap/PHASE2.md` geplant wird — diesen Eintrag dann auflösen.

---

## Pflege-Regeln

- Einträge werden **nicht gelöscht**, wenn sie verschwinden — stattdessen als *behoben* markieren und mit Datum + Referenz auf den CHANGELOG-Eintrag annotieren. So bleibt nachvollziehbar, dass der Befund existierte.
- **Keine Gummiband-Einträge.** Wenn ein Befund hier landet, soll er so konkret sein, dass ein späterer Review-Agent ihn eindeutig wiedererkennt und nicht noch einmal meldet.
- **Kategorie „Design-by-Choice"** für Dinge, die bewusst so sind — dort steht die Begründung oft als Verweis auf `ENTSCHEIDUNGEN.md`.
