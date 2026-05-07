# Design-Entscheidungen

Dieses Dokument hält die **Warum-Entscheidungen** fest, nicht die Was-Entscheidungen. Wenn jemand (auch das zukünftige Ich in einer neuen Session) fragt *„warum haben wir damals nicht einfach …?"*, dann steht es hier.

## Wann kommt ein Eintrag hier rein?

- Scope- oder Architektur-Frage mit **mehreren sinnvollen Lösungen**.
- Entscheidung für eine Variante, die **später hinterfragt werden könnte**.
- Bewusst offen gelassene Baustellen, damit sie nicht als „vergessen" wirken.

**Nicht** hier rein: triviale Umsetzungsdetails, Bugfixes ohne Design-Anteil, kurzfristige Präferenzen.

## Format pro Eintrag

- Eine `##`-Überschrift mit prägnantem Titel.
- Abschnitte in dieser Reihenfolge:
  - **Entscheidung:** der gewählte Weg, 1–2 Sätze.
  - **Varianten:** A / B / C mit Kernmerkmal, markiert welche gewählt wurde.
  - **Grund:** *warum* A gewinnt — oder warum B/C disqualifiziert sind.
  - **Konsequenz:** was das für zukünftige Arbeit bedeutet (kein Boilerplate — nur wenn relevant).
  - Optional **Implementierungsdetail:** wenn die Umsetzung selbst eine Wahl war (z.B. Whitelist statt Blacklist).

Neue Einträge wandern **oben** an (neuster zuerst). Keine Daten in den Titel — der Titel ist thematisch, das Datum steckt implizit in der Git-History.

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

**Entscheidung:** TakumiDeck wählt Variante A / B / C – kurz benennen, was sich dadurch konkret unterscheidet.

**Varianten:**

- **A** <Kurzbeschreibung> (gewählt)
- **B** <Kurzbeschreibung>
- **C** <Kurzbeschreibung>

**Grund:** Hier steht, warum A gewinnt. Dieser Abschnitt ist der eigentliche Mehrwert der Datei — nicht abkürzen. Idealerweise ein konkretes Szenario, das B / C schmerzhaft macht, und ein Szenario, das A trivial macht.

**Konsequenz:** Was bedeutet diese Entscheidung für spätere Arbeit? („Wir müssen ab jetzt bei jeder neuen Spalte …", „Ein späteres Feature X lässt sich hier …").

**Implementierungsdetail:** *(optional)* kurze Notiz zu einer Umsetzungs-Wahl, die der Grund-Abschnitt nicht mitbehandelt.
