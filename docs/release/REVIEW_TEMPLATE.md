# Release-Code-Review-Template

Vorlage für den **gezielten Code-Review vor einem Release**. Anders als der bereichsbezogene Review in [code-review/TEMPLATE.md](../code-review/TEMPLATE.md) prüft dieser Review *alle Dateien, die sich seit der letzten Version geändert haben* — querbeet durch alle Bereiche.

## Konzept

Ein Release-Review läuft so:

1. **Vorgänger-Version bestimmen** — letzter Git-Tag oder „erstes Release" (dann ist Diff = `HEAD` gegen leeres Repo, in der Praxis: alles).
2. **Diff-Liste erzeugen:**

   ```bash
   git diff --name-only v<vorherige-version>..HEAD
   ```

   Diese Liste ist der Scope des Reviews.
3. **Bereichs-OFFEN-Dateien einsammeln** — pro betroffenem Bereich die zugehörige `code-review/OFFEN_<BEREICH>.md`, damit der Reviewer bereits bekannte Punkte nicht erneut meldet.
4. **Review-Prompt bauen** (Template unten) und als Season-Prompt starten.
5. **Befund-Report prüfen** — Kategorisierung nach Schwere.
6. **Fixes durchführen** für release-blockierende Befunde („fix it"-Signal).
7. **Nicht release-blockierende Befunde** in passende `code-review/OFFEN_<BEREICH>.md` aufnehmen.
8. **Ergebnis in der Release-Notes-Datei** (`docs/release/v<MAJOR>.<MINOR>.<PATCH>.md`) im Abschnitt „Code-Review-Ergebnis" zusammenfassen.

## Was zählt als release-blockierend?

| Kategorie       | Release-blockierend?                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **Bug**         | ja, wenn Hauptpfad oder dokumentiertes Feature betroffen. Nein, wenn Randfall mit klarer Workaround-Doku. |
| **Sicherheit**  | immer ja, sobald nicht-lokales Risiko besteht (z.B. unsicheres Login, ungeschützter HTTP-Endpoint).      |
| **Datenverlust**| immer ja.                                                                                                |
| **Warnung**     | nein. Wandert in `OFFEN_<BEREICH>.md`.                                                                   |
| **Verbesserung**| nein. Wandert in `OFFEN_<BEREICH>.md` oder in die nächste Roadmap-Phase.                                  |

---

## Template-Prompt (kopieren, anpassen)

```text
# Release-Review: v<MAJOR>.<MINOR>.<PATCH>

## Kontext
CLAUDE.md ist auto-geladen (Projekt-Steckbrief, Regeln).

Dies ist KEIN bereichsbezogener Review. Es ist ein Release-Review:
alle Dateien, die sich seit der letzten veröffentlichten Version
(v<vorherige-version>) geändert haben, werden in einem Durchgang geprüft.

**Vor dem Review zwingend lesen:**
- docs/release/VERSIONIERUNG.md (Schema und Ablauf)
- Für jeden betroffenen Bereich die zugehörige docs/code-review/OFFEN_<BEREICH>.md
  Die dort gelisteten Punkte sind **bekannt und bewusst offen** — nicht erneut melden,
  außer es gibt eine neue Erkenntnis.

## Deine Aufgabe
Führe einen Release-Review für v<MAJOR>.<MINOR>.<PATCH> durch.

**Geänderte Dateien seit v<vorherige-version>** (`git diff --name-only v<vorherige-version>..HEAD`):
- <datei-1>
- <datei-2>
- <datei-3>
- …

**Worauf du achtest (Reihenfolge nach Schwere):**
1. **Release-blockierend** — Bugs im Hauptpfad, Sicherheitslücken, möglicher Datenverlust, kaputte Migrations.
2. **Regressionen** — Funktionen, die in v<vorherige-version> korrekt waren und jetzt abweichen.
3. **Inkonsistenzen zwischen geänderten Modulen** — z.B. neues Feld in DB, das im UI nicht angezeigt wird.
4. **Fehlendes Error-Handling** in neu hinzugekommenen Code-Pfaden.
5. **Stil-Abweichungen** vom restlichen Code (CODING_RULES.md).
6. **Doku-Synchronität** — sind neue Features in FEATURES.md / CHANGELOG.md eingetragen?
7. **Breaking Changes erkannt?** — Verhaltens-, API- oder Schema-Änderungen mit Nutzer-Auswirkung. Falls ja UND Pre-1.0 (`MAJOR=0`): muss als `⚠ Breaking`-Banner in den Release-Notes erscheinen (siehe docs/release/VERSIONIERUNG.md, Abschnitt „Breaking Changes vor 1.0.0"). Falls ja UND ab 1.0: zwingt einen Major-Sprung, auch innerhalb einer Phase.

**Vorgehensweise:**
1. Lies zuerst docs/release/VERSIONIERUNG.md
2. Lies alle relevanten docs/code-review/OFFEN_<BEREICH>.md komplett
3. Lies die oben gelisteten geänderten Dateien vollständig
4. Erstelle einen Befund-Report mit Kategorie (Bug / Sicherheit / Datenverlust / Regression
   / Warnung / Verbesserung / Verbesserung-Doku) UND einer Markierung
   "release-blockierend: ja/nein" pro Befund
5. Empfehlung am Ende: Release freigeben / mit Auflagen freigeben / nicht freigeben
6. Warte auf mein "fix it" bevor du etwas änderst

## Hinweise
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte offene Punkte NICHT wiederholen
- Kein Refactoring ohne Auftrag
- Bei großem Diff (> ~20 Dateien): Bericht nach Bereichen gliedern (DB / Core / UI / API)
```

## Bei sehr großem Diff

Wenn `git diff --name-only` mehr als ~20 Dateien liefert, den Review **nach Bereichen splitten** und parallel laufen lassen — pro Bereich ein eigener Prompt mit jeweils dem entsprechenden Datei-Subset und der passenden `OFFEN_<BEREICH>.md`. Die Ergebnisse werden im Abschnitt „Code-Review-Ergebnis" der Release-Notes zusammengeführt.

## Hot-Fix-Review

Bei einem Hotfix ist der Diff klein (nur die Hotfix-Datei(en)). Trotzdem den Review durchführen, aber:

- **Zusatz-Prüfpunkt:** verursacht der Fix selbst eine neue Regression in nah anliegendem Code?
- **Tests** für den Bug, der den Hotfix nötig gemacht hat (sonst kann er stillschweigend wiederkehren).
