# Roadmap Phase 2 – Komfort und Stabilisierung (v1.0)

**Voraussetzung:** Phase 1 abgeschlossen (v0.1 stabil im Daily-Use)

**Ziel:** TakumiDeck wird vom MVP zum produktiven Daily-Driver. Komfort-Features, die im täglichen Einsatz wichtig werden, sobald die Grundfunktionen stabil sind. Trigger sind oft empirische Schmerzpunkte aus Phase 1.

**Milestone:** Version 1.0

---

## Bereich: Sessions

### Feature: Volle State-Detection

Erweitert die reduzierte Detection aus Phase 1.

- TUI-Pattern-Matching auf serialisiertem xterm-Buffer
- Erkennt Status: `running` / `waiting` / `idle` / `permission-prompt`
- Sidebar-Badges differenzierter (z.B. gelb bei `waiting`, blinkend bei `permission-prompt`)
- Versionierte Pattern-Definition mit Schema-Test pro Claude-Code-Version

**Trigger:** Wenn empirisch wichtig — wenn häufig Permission-Prompts vergessen werden.

### Feature: Trigger-Phrasen-Schnellbuttons

Buttons in der App für die in CLAUDE.md definierten Trigger-Phrasen.

- Liest `workbench.trigger_phrases` aus aktivem Projekt
- Generiert dynamisch Buttons für jede definierte Phrase
- Button-Klick sendet Phrase via Bracketed Paste an aktive PTY-Session

**Trigger:** Komfort-Wunsch nach Phase 1.

---

## Bereich: Token-Dashboard

### Feature: 20%-Kontext-Soft-Warning

Zusätzliche Warnung für die persönliche Erfahrungsgrenze.

- Konfigurierbarer Schwellwert (Default 20%, anpassbar)
- Dezenter Hinweis "Kontext über 20% — Output-Qualität kann sinken"
- Settings-Toggle (kann ausgeschaltet werden)

**Trigger:** Wenn die 20%-Beobachtung sich im Daily-Use bestätigt.

### Feature: Modell-Filter im Verlauf-Panel

Zusätzlicher Filter zum Phase-1-Set.

- Filter nach `current_model` der Sessions
- Modell-Wechsel-History als Detail-Info pro Session

**Trigger:** Wenn relevant.

---

## Bereich: Templates

### Feature: Erweiterte Template-Variablen

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