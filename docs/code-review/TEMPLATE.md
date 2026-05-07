# Code-Review-Template

Bauplan für **wiederkehrende** Code-Reviews. Code-Reviews sind ein zweiter, gezielt laufender Pass über einen abgegrenzten Bereich des Codes — sie ergänzen die normale Season-Arbeit, sind aber kein Refactoring.

## Konzept

Für jeden Review-**Bereich** (z.B. `DB`, `Core`, `UI`, `API`, …) gibt es genau eine `code-review/OFFEN_<BEREICH>.md`-Datei. Dort stehen Befunde, die **bekannt und bewusst offen** sind — damit spätere Review-Durchgänge nicht immer dieselben Punkte erneut melden.

Ein Review-Durchgang läuft so:

1. **Bereich wählen** — z.B. „Datenbank-Schicht".
2. **`code-review/OFFEN_<BEREICH>.md` anlegen oder öffnen** — siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md).
3. **Review-Prompt bauen** (Template unten) und als Season-Prompt starten.
4. **Befund-Report prüfen** — neue Befunde vs. bereits dokumentiert.
5. **Fixes durchführen** (auf Signal „fix it").
6. **Offen gebliebene neue Befunde** in die `code-review/OFFEN_<BEREICH>.md` eintragen.

## Template-Prompt (kopieren, anpassen)

```
# Code-Review: <BEREICH>

## Kontext
CLAUDE.md ist auto-geladen (Projekt-Steckbrief, Regeln).

**Vor dem Review zwingend lesen:** docs/code-review/OFFEN_<BEREICH>.md
Die dort gelisteten Punkte sind **bekannt und bewusst offen** – bitte
nicht erneut melden, außer es gibt eine neue Erkenntnis dazu.

## Deine Aufgabe
Führe einen Code-Review des <BEREICHS> durch.

**Zu lesende Dateien:**
- <datei-1>
- <datei-2>
- …

**Worauf du achtest:**
- Neue Bugs oder fehlerhafte Logik seit dem letzten Review
- Regressionen: Funktionen, die früher korrekt waren und jetzt abweichen
- Neu hinzugekommene Felder/Funktionen: werden sie konsistent behandelt?
- Fehlendes Error-Handling bei neuen Code-Pfaden
- Stil-Abweichungen vom restlichen Code
- <weitere bereichsspezifische Prüfpunkte, z.B. "SQL-Injection", "Thread-Safety", "Memory-Leaks", "unverbundene Signale">

**Vorgehensweise:**
1. Lies zuerst docs/code-review/OFFEN_<BEREICH>.md komplett
2. Lies die oben genannten Dateien vollständig
3. Erstelle einen Befund-Report: Kategorie (Bug / Warnung / Verbesserung)
   + Abgrenzung "ist NEU gegenüber code-review/OFFEN_<BEREICH>.md"
4. Warte auf mein "fix it" bevor du etwas änderst

## Hinweise
- Kein Refactoring ohne Auftrag
- Jede Stelle mit Dateiname + Zeilennummer
- Bereits dokumentierte offene Punkte NICHT wiederholen
```

## Bereich-Auswahl

Die Bereiche folgen der `ARCHITEKTUR.md`. Typische Aufteilungen:

- **Datenschicht** — DB-Zugriffe, Migrations, ORMs
- **Domänen-Logik** — Kernberechnungen, Parser, Scanner, Services
- **Präsentation** — UI-Shell (Haupt-Layout, Navigation) vs. UI-Detail (Formulare, einzelne Views)
- **Integrations-/API-Schicht** — wenn externe Dienste oder eigene HTTP-Schnittstellen existieren

Je Review eine überschaubare Datei-Menge (Richtwert: 3–5 Dateien, 500–2000 Zeilen gesamt). Größere Bereiche splitten statt in einem Durchgang zu bewältigen.

## Was hier NICHT rein gehört

- **Security-Audits** großer Größenordnung — eigenes Format, externe Checkliste.
- **Performance-Profiling** — braucht Messung, keinen Code-Lesedurchgang.
- **Feature-Reviews** („Ist das Feature sinnvoll?") — gehört in Roadmap-Diskussionen, nicht ins Code-Review.
