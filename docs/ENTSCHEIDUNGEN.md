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

## Settings-Backend: eigene JSON-Operationen

**Entscheidung:** TakumiDeck verwaltet `settings.json` mit eigenen `fs`-Aufrufen plus atomic write (`.tmp` + rename) statt einer Library wie `electron-store` oder `conf`.

**Varianten:**

- **A** Eigene JSON-Operationen mit zod-Validierung beim Lesen (gewählt)
- **B** `electron-store` mit JSON-Schema-Validation und dot-paths
- **C** `conf` als minimalere electron-store-Alternative

**Grund:** Settings sind das Herzstück der App-Konfiguration und werden mit der Zeit komplexer (Limit-Bars, Custom-Filter). `electron-store` zwingt seine Konventionen auf (Pfad-Auto-Wahl, magische Keys), die bei Migrations zwischen Settings-Schema-Versionen im Weg stehen würden. Eigene Operationen sind 30 Zeilen, vollständig nachvollziehbar, und passen exakt zur Architektur-Entscheidung „Master-Config in JSON-Dateien, App rendert nur" (TAKUMIDECK_ARCHITEKTUR Kapitel 10 Punkt 6).

**Konsequenz:** Wenn das Settings-Schema wächst, müssen wir Migrations selbst schreiben — kein Auto-Migration-Path. Dafür haben wir volle Kontrolle, atomic writes (kein halb-geschriebenes JSON bei Crash) und können jederzeit zu einem Schema-Versions-Feld erweitern, ohne Library-Quirks zu umgehen.

---

## zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1

**Entscheidung:** Jeder IPC-Channel mit Eingangs-Payload bekommt ein zod-Schema, das im Main-Handler vor der Logik per `.parse()` greift.

**Varianten:**

- **A** zod-Validation überall ab Sprint 1 (gewählt)
- **B** Nur an externen Daten-Boundaries (settings.json, JSONL-Files), IPC vertraut TS-Compile-Time
- **C** Komplett später nachrüsten

**Grund:** TypeScript-Types existieren nur zur Compile-Zeit; das Renderer-Bundle könnte theoretisch beliebige Payloads schicken (Bug, Memory-Corruption, Browser-Devtools-Eingriff). Bei einer wachsenden Channel-Liste (Sessions, PTY, Git, Usage in Sprints 2–7) wäre B die ständige Versuchung, den nächsten Channel „mal eben ohne Schema" einzuführen, bis der erste Bug eskaliert. Mit der zod-Convention ab Tag 1 ist das Schema Pflichtbestandteil jedes Handlers — und gleichzeitig die laufende Doku, was ein Channel akzeptiert.

**Konsequenz:** Jeder neue Channel kostet zusätzlich ein Schema in `src/shared/schemas.ts`. Im Gegenzug bekommen wir eindeutige Fehlermeldungen (zod sagt genau, welches Feld kaputt ist), nicht „TypeError: Cannot read property X of undefined" tief im Handler.

**Implementierungsdetail:** Das Patch-Schema (`AppSettingsPatchSchema`) ist mit `.partial()` auf das volle Settings-Schema aufgesetzt — kein Drift möglich.

---

## Logging via electron-log

**Entscheidung:** Main-Prozess loggt über `electron-log` nach `<userData>/logs/main.log`.

**Varianten:**

- **A** electron-log (gewählt)
- **B** `console.log` + eigener Helper, kein Datei-Output
- **C** Erst in Sprint 8 (Polish) einrichten

**Grund:** Production-Builds haben keine offene Konsole, in der `console.log` sichtbar wäre. Sobald das erste Mal jemand schreibt „bei mir geht's nicht" ohne Reproduktion, hilft nur ein File-Log. electron-log handhabt Datei-Rotation, Levels und Multi-Prozess-Logging out-of-the-box; selbst zu schreiben wäre 100+ Zeilen für ein gelöstes Problem.

**Konsequenz:** Settings-Dialog in Sprint 8 bekommt einen „Open Data Folder"-Button, und das Log liegt direkt daneben — kein zusätzlicher UX-Pfad nötig.

---

## Vitest-Setup direkt mit Foundation-Smoke-Tests

**Entscheidung:** Ab Sprint 1 ist Vitest konfiguriert, und vier Test-Dateien (Result-Helper, zod-Schemas, SettingsStore, Migration-Runner) laufen grün.

**Varianten:**

- **A** Setup jetzt + Smoke-Tests für Foundation (gewählt)
- **B** Setup jetzt, Tests folgen mit Sprint 2
- **C** Komplett später

**Grund:** Working Rule 4 verlangt „Test scope per season — Tests cover only the newly added or changed feature". Ohne Tests in Sprint 1 wäre die erste Test-Datei in Sprint 2 entstanden — und die Versuchung wäre groß, „kurz noch die Settings-Tests mitzunehmen". Damit wäre die Per-Season-Disziplin schon im zweiten Sprint hinüber. Tests jetzt zu schreiben verankert die Regel, solange der Scope klein und überschaubar ist.

**Konsequenz:** Migration-Runner ist gegen ein schmales `MigrationDriver`-Interface getestet (Fake-Driver, kein echtes SQLite). Das ist auch die Voraussetzung dafür, dass `npx vitest run` läuft, nachdem `electron-rebuild` die better-sqlite3-ABI auf Electron umgestellt hat — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).

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
