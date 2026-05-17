# Release Notes Template

Vorlage für **eine einzelne Release-Notes-Datei**. Beim Erstellen kopieren als `v<MAJOR>.<MINOR>.<PATCH>.md` (z.B. `v0.1.0.md`, `v0.1.1.md`) in diesen Ordner.

Bei der Kopie alles ab der nächsten Trennlinie übernehmen — der erklärende Teil oben bleibt nur in dieser TEMPLATE-Datei.

## Was reingehört

- **Versions-Header** mit Datum, Typ (Major / Minor / Patch / Hotfix), zugehöriger Phase. Schema-Definition → [VERSIONIERUNG.md](./VERSIONIERUNG.md).
- **Pre-1.0-Breaking-Banner** — bei Pre-1.0-Releases mit nicht abwärtskompatiblen Änderungen erscheint ein `⚠ Breaking`-Banner direkt über dem H1 (siehe Beispiel unten). Pflicht laut [VERSIONIERUNG.md → Breaking Changes vor 1.0.0](./VERSIONIERUNG.md#breaking-changes-vor-100).
- **Was jetzt geht** — Nutzer-Mehrwert (analog [CHANGELOG.md](../CHANGELOG.md), aber für **alle** Features des Release-Bündels, nicht nur das letzte).
- **Code-Review-Ergebnis** — Befund-Zahlen + Verweis auf gefixte Punkte und auf bewusst offen Gelassene.
- **Bekannte Einschränkungen** — was im Release fehlt oder unrund ist.
- **Upgrade-Hinweise** — falls Migrationen, Daten-Umzüge oder Setup-Änderungen nötig sind.

## Was NICHT reingehört

- **Detail-Commit-Liste** — Git-Tag-Diff liefert das (`git log v<vorherige>..v<diese>`).
- **Doppelte Architektur-Erklärungen** — verlinken auf `ARCHITEKTUR.md` oder `ENTSCHEIDUNGEN.md`.
- **Roadmap-Ausblick** — gehört in `roadmap/PHASE<N>.md`, nicht in Release-Notes.

---

<!-- Optional: Pre-1.0-Breaking-Banner. Nur stehen lassen, wenn MAJOR=0 UND nicht abwärtskompatible Änderungen enthalten sind. Sonst Banner und HTML-Kommentar komplett entfernen. -->
> ⚠ **Breaking** — kurze Zusammenfassung des Bruchs in einem Satz. Details siehe „Upgrade-Hinweise".

<!-- markdownlint-disable-next-line MD025 -- zweites H1 ist Template-Content, wird beim Kopieren zum H1 der neuen Release-Notes-Datei -->
# {{PROJEKT_NAME}} v<MAJOR>.<MINOR>.<PATCH>

- **Datum:** YYYY-MM-DD
- **Typ:** Major / Minor / Patch / Hotfix *(Major = Phasen-Milestone oder, ab 1.0, jeder Breaking Change)*
- **Phase:** Phase <N> ([→ Roadmap](../roadmap/PHASE<N>.md))
- **Vorgänger:** v<vorherige-version> *(oder „—" bei erstem Release)*
- **Git-Tag:** `v<MAJOR>.<MINOR>.<PATCH>`

## Was jetzt geht

- **<Kern-Mehrwert aus Nutzersicht>.** Ein bis zwei Sätze. Vorher-Zustand kurz mitgeben („Vorher war …").
- **<Zweiter Mehrwert>.**
- **<Dritter Mehrwert>.**

Für Detail-Einträge je Feature → [docs/CHANGELOG.md](../CHANGELOG.md) (Einträge zwischen v<vorherige> und v<diese>).

## Enthaltene Features (Status-Schnappschuss)

Verweis auf [FEATURES.md](../FEATURES.md). Hier nur die Features, die **mit diesem Release** auf ✅ gegangen sind:

- ✅ **<Feature A>** *(Bereich)*
- ✅ **<Feature B>** *(Bereich)*

## Code-Review-Ergebnis

Release-Review nach [REVIEW_TEMPLATE.md](./REVIEW_TEMPLATE.md), durchgeführt am YYYY-MM-DD.

- **Geprüfte Dateien:** <Anzahl> (Diff `v<vorherige>..HEAD` zum Review-Zeitpunkt).
- **Befunde:**
  - Bugs gefixt: <Anzahl>
  - Warnungen behoben: <Anzahl>
  - Verbesserungen verschoben (in `code-review/OFFEN_*.md` aufgenommen): <Anzahl>
- **Bewertung:** Release-fähig / Release-fähig mit Auflagen / nicht freigegeben.

## Bekannte Einschränkungen

- **<Einschränkung>.** Was ist offen, warum bleibt es offen, wo wird es verfolgt (Verweis auf `OFFEN_<BEREICH>.md` oder `roadmap/PHASE<N>.md`).

## Upgrade-Hinweise

*(Abschnitt entfernen, wenn nicht relevant.)*

- **DB-Migration nötig:** ja / nein. Falls ja: Migrations-Schritt beschreiben.
- **Setup-Änderungen:** ja / nein. Falls ja: Verweis auf [DEV_SETUP.md](../DEV_SETUP.md).
- **Breaking Changes:** ja / nein. Falls ja: was muss der Nutzer manuell anpassen. Pre-1.0-Breaking (`MAJOR=0`) erfordert zusätzlich den `⚠ Breaking`-Banner über dem H1 (siehe [VERSIONIERUNG.md](./VERSIONIERUNG.md#breaking-changes-vor-100)).

## Architektur-Entscheidungen dieses Releases

Verweis-Bullets auf neue Einträge in [ENTSCHEIDUNGEN.md](../ENTSCHEIDUNGEN.md), die im Release-Zeitraum entstanden sind. Hier keine Wiederholung der Begründung.

- **<Entscheidung>** → [ENTSCHEIDUNGEN.md](../ENTSCHEIDUNGEN.md)
