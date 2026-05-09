# Änderungsprotokoll

Dieses Dokument hält **abgeschlossene** Entwicklungs-Sessions fest. Es ist ein Spickzettel für das zukünftige Ich (und Co-Agenten), um zu sehen *was wann warum* gebaut wurde, ohne durch Git-History graben zu müssen.

## Regel für neue Einträge

Nach jedem erfolgreich implementierten Feature:

1. **Hier** einen neuen Abschnitt mit Datum oben anfügen (neuster zuerst).
2. In [FEATURES.md](./FEATURES.md) den betroffenen Eintrag von ⛔/🟡 auf ✅ setzen.
3. Wenn Roadmap-Phasen erledigt sind, in [ROADMAP.md](./ROADMAP.md) streichen oder als „erledigt" markieren.
4. Wenn architektonische Entscheidungen dabei waren, einen Eintrag in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md) – dort geht es nur um das *Warum*.

Ein Eintrag ist **kurz und anwendungsorientiert**: „Was kann der Nutzer jetzt, was vorher nicht ging?", plus die wichtigsten Dateien, die sich geändert haben. Die *detaillierte* Code-Beschreibung gehört in die Commit-Message, nicht hierhin.

**Keine „Geänderte Dateien"-Listen** — das liefert die Git-History. Eintrag konzentriert sich auf den Nutzer-Mehrwert und die dahinter stehenden Entscheidungen.

---

## 2026-05-09 — Season 1: Foundation-Skelett

### Was jetzt geht

- **Die App startet.** `npm start` (oder `start-dev.bat`) öffnet ein Electron-Fenster mit dem Foundation-Smoke-View, das Version + komplettes Default-Settings-JSON vom Main-Prozess über die typed IPC-Bridge empfängt. Vorher gab es nur Doku, keinen lauffähigen Code.
- **Persistente Datenstruktur ist da.** Beim ersten Start legt die App `%APPDATA%\TakumiDeck-dev\` mit `settings.json` (Defaults aus Architektur K4), `data.sqlite` (WAL-Mode + komplettes Schema aus `0001_init`), `logs/` und `templates/` an.
- **IPC-Boundary ist sicher.** `contextIsolation: true` + `sandbox: true` + zod-Runtime-Validation für jedes Payload — Renderer hat keinen Node-Zugriff, fehlerhafte Calls liefern saubere Result-Objekte statt Exceptions.

### Umgesetzte Entscheidungen

- **Eigene JSON-Operationen statt electron-store** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Atomic write via `.tmp` + rename, zod-Validierung beim Lesen.
- **zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Verhindert, dass spätere Channels still ohne Validation eingeführt werden.
- **electron-log** als Logging-Library, schreibt in `<userData>/logs/main.log` (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)).
- **Vitest-Setup direkt mit Foundation-Smoke-Tests** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). 20 Tests grün: Result-Helper, zod-Schemas, SettingsStore-Roundtrip, Migration-Runner.

### Offen geblieben (bewusst verschoben)

- **PTY + xterm.js + Tabs** — Kern von Sprint 2.
- **Volles Layout (Sidebar / Terminal / Right-Pane / Plannutzung)** — der Smoke-View ist nur ein JSON-Dump, das echte Layout kommt mit den jeweiligen Sprints (Sidebar mit Sprint 4, Right-Pane mit Sprint 7).
- **Migration-Tests gegen echte SQLite-Verbindung** — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), Fake-Driver-Pattern stattdessen.

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

## YYYY-MM-DD — Season <Nummer>: <Feature-Name>

### Was jetzt geht

- **<Kern-Mehrwert aus Nutzersicht>.** Ein Satz, der beschreibt, was neu möglich ist. Vorher-Zustand kurz mit dazugegeben („Vorher war …").
- **<Zweiter Mehrwert, falls mehrere>.**

### Umgesetzte Entscheidungen

- **Variante A / B / C gewählt.** Kurz Begründung, warum die Alternative nicht genommen wurde. (Details gehören in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md), hier nur der Anker.)
- **<Andere Entscheidung mit Scope-Charakter>.**

### Offen geblieben (bewusst verschoben)

- **<Teil, der explizit ausgeklammert wurde>.** Wandert nach Phase 2 / in eine eigene Season / in die Roadmap.
