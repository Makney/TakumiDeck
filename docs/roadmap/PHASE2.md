# Roadmap Phase 2 – Komfort und Stabilisierung (v1.0)

**Voraussetzung:** Phase 1 abgeschlossen (v0.1 stabil im Daily-Use)

**Ziel:** TakumiDeck wird vom MVP zum produktiven Daily-Driver. Komfort-Features, die im täglichen Einsatz wichtig werden, sobald die Grundfunktionen stabil sind. Trigger sind oft empirische Schmerzpunkte aus Phase 1.

**Milestone:** Version 1.0

---

## Bereich: Sessions

### Feature: Volle State-Detection ✅

Erweitert die reduzierte Detection aus Phase 1.

- TUI-Pattern-Matching auf serialisiertem xterm-Buffer
- Erkennt Status: `running` / `waiting` / `idle` / `permission-prompt`
- Sidebar-Badges differenzierter (z.B. gelb bei `waiting`, blinkend bei `permission-prompt`)
- Versionierte Pattern-Definition mit Schema-Test pro Claude-Code-Version

**Trigger:** Wenn empirisch wichtig — wenn häufig Permission-Prompts vergessen werden.

### Feature: Trigger-Phrasen-Schnellbuttons ✅

Buttons in der App für die in CLAUDE.md definierten Trigger-Phrasen.

- Liest `workbench.trigger_phrases` aus aktivem Projekt
- Generiert dynamisch Buttons für jede definierte Phrase
- Button-Klick sendet Phrase via Bracketed Paste an aktive PTY-Session

**Trigger:** Komfort-Wunsch nach Phase 1.

---

## Bereich: Projekt-Verwaltung

Lücken im Phase-1-Sidebar-CRUD schließen. Phase 1 kann Projekte nur **anlegen** (Scan + Add), nicht entfernen — und scannt beim ersten Start kommentarlos den Default-Workspace `<home>/Projekte`.

### Feature: Projekt entfernen ✅

Sidebar-Action zum Entfernen eines Projekts aus der Liste.

- Rechtsklick oder Hover-Trash-Icon auf Sidebar-Eintrag → „Aus Liste entfernen"
- Bestätigungs-Dialog mit Hinweis: „Sessions und Verlauf bleiben erhalten und wandern in den Legacy-Bucket"
- Neuer IPC `project:remove` mit DB-Delete; abhängige Sessions werden vorher per UPDATE auf den Default-Project-Bucket umgehängt (gleicher Mechanismus wie `remapSessionsByCwdPrefix` aus Phase 1, nur in die andere Richtung)
- Default-Project (`DEFAULT_PROJECT_ID`) selbst kann nicht entfernt werden — UI deaktiviert die Aktion dort

**Trigger:** Empirisch — sobald die Sidebar durch alte Scans, Backup-Ordner oder umbenannte Projekte zumüllt.

### Feature: First-Start-Workspace-Wizard

Beim ersten App-Start keinen automatischen Default-Workspace-Scan, sondern explizite Auswahl.

- Erkennung „erster Start": `settings.json` existiert noch nicht (Phase 1 schreibt sie sofort beim Boot)
- Welcome-Screen vor dem normalen Layout: Begrüßung + Button „Workspace-Ordner auswählen" (öffnet `dialog.showOpenDialog` mit `openDirectory`)
- Optional zweiter Button „Erstmal überspringen" → leerer Workspace, User kann später über Settings einen Pfad setzen
- Erst nach User-Bestätigung läuft der Scanner; kein stiller Scan von `<home>/Projekte` mehr
- In Settings (Tab Workspace) bleibt der Pfad weiterhin änderbar (Phase-1-Mechanik unverändert)

**Trigger:** UX-Schmerzpunkt aus Phase 1 — beim ersten Start tauchen Projekte aus dem Default-Pfad auf, die der User nie als TakumiDeck-Projekte definiert hat. Stilles Default-Scannen verletzt zusätzlich das Prinzip der minimalen Überraschung.

---

## Bereich: Token-Dashboard

### Feature: 20%-Kontext-Soft-Warning ✅

Zusätzliche Warnung für die persönliche Erfahrungsgrenze.

- Konfigurierbarer Schwellwert (Default 20%, anpassbar)
- Dezenter Hinweis "Kontext über 20% — Output-Qualität kann sinken"
- Settings-Toggle (kann ausgeschaltet werden)

**Trigger:** Wenn die 20%-Beobachtung sich im Daily-Use bestätigt.

### Feature: Modell-Filter im Verlauf-Panel ✅

Zusätzlicher Filter zum Phase-1-Set.

- Filter nach `current_model` der Sessions
- Modell-Wechsel-History als Detail-Info pro Session

**Trigger:** Wenn relevant.

---

## Bereich: Stats und Heatmap

Erweiterung der MVP-Übersicht mit detaillierten Nutzungs-Statistiken.

### Feature: Stats-Cards ✅

Detaillierte Aggregations-Statistiken pro Projekt.

- Sitzungen total
- Nachrichten total
- Tokens gesamt
- Aktive Tage
- Aktuelle Streak (Tage in Folge mit Aktivität)
- Längste Streak
- Spitzenstunde (welche Tageszeit am produktivsten)
- Lieblingsmodell (meistgenutztes Modell)

**Trigger:** Im MVP wird der Stats-Bereich nur als Platzhalter angezeigt. Sobald das Daily-Use-Pattern stabil ist und der Wert der Stats sichtbar wird, ausbauen.

### Feature: Aktivitäts-Heatmap

GitHub-Style Calendar-Heatmap der letzten 30 Wochen.

- Pro Tag ein farbiges Quadrat
- Farbintensität proportional zum Token-Verbrauch des Tages
- 30-Wochen-Window (Standard), umschaltbar auf 52 Wochen
- Hover zeigt Datum + Token-Anzahl
- Filter: 7d / 30d / Alle

### Feature: Modelle-View

Per-Modell-Aufschlüsselung als zweiter Tab neben Übersicht.

- Bar-Chart der Token-Verteilung pro Modell
- Tabelle: Modell · Sessions · Token total · Durchschnitt pro Session
- Zeitfilter analog zu Übersicht (7d / 30d / Alle)

### Feature: Easter-Egg-Vergleiche

Spielerische Token-Vergleiche basierend auf bekannten Werken.

- "Du hast ~31× mehr Token als The Lord of the Rings verwendet"
- Konfigurierbare Vergleichs-Werke in Settings
- Default-Werke: LotR, Bibel, Harry-Potter-Reihe, etc.
- Update bei jedem Stats-Refresh

### Feature: 30d/7d-Filter ✅

Globaler Zeit-Filter für Stats-Section.

- Toggle-Buttons "Alle / 30d / 7d"
- Filter wirkt auf Stats-Cards, Heatmap, Modelle-View
- Persistiert in Settings (zuletzt gewählter Filter)

---

## Bereich: Templates

### Feature: Erweiterte Template-Variablen ✅

Zusätzliche Auto-Variablen.

- `{{LETZTE_SEASON_NAME}}` — aus SQLite, last completed Session
- `{{TECH_SCHULDEN_RELEVANT}}` — automatisch aus TECH_SCHULDEN.md geparst
- `{{LETZTE_ENTSCHEIDUNGEN}}` — Top-3-Einträge aus ENTSCHEIDUNGEN.md

**Trigger:** Wenn die Phase-1-Variablen nicht ausreichen.

---

## Bereich: Docs-Sync

### Feature: Docs-Sync-Session

Spezielle Session-Art für Doku-Komprimierung.

- Auf Knopfdruck startbar
- Sendet automatisch vorbereiteten Prompt: "Lies die definierten Doku-Dateien, erstelle kompakte Zusammenfassungen in `docs/SUMMARIES/`"
- Unterstützte Files: `ENTSCHEIDUNGEN.md`, `CHANGELOG.md`, `TECH_SCHULDEN.md`, `FEATURES.md`
- UI für Summary-Status pro Datei (gibt es eine? Wie alt? Original geändert?)

### Feature: Kontext-Checkbox-Erweiterung

Aufbauend auf Phase-1-Pfad-Erinnerung.

- Wenn Summary für eine On-Demand-Datei existiert: Summary-Inhalt als Präambel injizieren statt Pfad-Erinnerung
- Hinweis im UI, wenn Summary fehlt oder veraltet ist

**Trigger:** Wenn Token-Limits in Phase 1 zum Schmerz werden — bis dahin reicht die Pfad-Erinnerung aus Phase 1.

---

## Bereich: Editor

### Feature: Markdown-Preview Side-by-Side

Erweiterung des Toggle-Modes aus Phase 1.

- Editor und Preview gleichzeitig sichtbar
- Synchronized Scrolling
- Zwei-Panel-Layout, in Settings konfigurierbar

**Trigger:** Wenn Toggle-Mode aus Phase 1 nicht ausreicht.

---

## Bereich: Build & Distribution

### Feature: Auto-Update via electron-updater

Automatische Updates beim App-Start.

- electron-updater integrieren
- GitHub-Releases als Update-Quelle
- "Update verfügbar"-Notification, manueller Install-Trigger

**Trigger:** Wenn TakumiDeck an Freunde verteilt wird — bis dahin reichen manuelle Builds.

### Feature: GitHub Actions Build-Pipeline

CI für Releases.

- Bei Tag-Push automatisch Windows-Build erstellen
- Release auf GitHub mit Installer-Binary
- Optional: macOS/Linux-Builds wenn Zielplattform erweitert

**Trigger:** Bei Verteilung.

---

## Bereich: Right-Pane-Polish

Verbesserungen am Right-Pane-Layout aus dem MVP.

### Feature: Datei-Browser-Filter

Erweiterte Filter-Funktion für den Datei-Browser.

- Filter-Suchfeld oben im Datei-Browser
- Live-Filtering nach Dateiname
- File-Type-Toggles (`.md`, `.json`, `.ts`, etc.)
- Persistiert in Settings

### Feature: Pre-Commit-Sensitive-Warning

Warnung vor versehentlichem Commit von sensiblen Files.

- Pattern-Match auf typische Sensitive-Files (`.env`, `secrets.*`, `*.key`, `*.pem`)
- Visueller Warnhinweis im Pre-Commit-Panel
- Optional: Commit-Button disabled bis User die Files explizit bestätigt
- Pattern-Liste in Settings konfigurierbar

### Feature: Datei-Browser-Status-Indikatoren

Visuelle Markierung von Files mit Änderungen.

- "M"-Indikator für modifizierte Files (uncommitted)
- "A"-Indikator für neu hinzugefügte Files
- "D"-Indikator für gelöschte Files
- Aktualisierung via simple-git status-Polling

---

## Bereich: Diff-Viewer

### Feature: Multi-Tab-Diff

Drei Diff-Ansichten parallel.

- Working Tree Diff (= Phase 1)
- Staged Diff (`git diff --staged`)
- Session-spezifischer Diff (seit Session-Start)

**Trigger:** Wenn relevant — wenn der Single-View aus Phase 1 nicht ausreicht.

---

## Allgemeine Bugfixes & Performance

Laufend, keine eigene Season nötig. Werden direkt behoben und im [CHANGELOG.md](../CHANGELOG.md) erfasst.