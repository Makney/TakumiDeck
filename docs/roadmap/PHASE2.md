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

### Feature: JSONL-Watcher Polling-Ring für Live-Token-Updates ✅

Zweiter Mechanismus neben `chokidar.awaitWriteFinish`, um Token-Bars in Echtzeit zu pushen.

- Aktuell pusht der Watcher `change`-Events erst nach 100 ms File-Stabilität — bei einer aktiv laufenden claude-Antwort kommen Updates erst am Antwort-Ende, nicht pro Token
- Parallel zur bestehenden chokidar-Pipeline ein fs-stat-Polling (~250 ms) auf den Files der aktiven Sessions
- Polling-Pfad erlaubt partielle Reads und blendet halbe Zeilen aus dem Buffer aus (Schutz gegen JSON-Parse-Errors)
- `add`-Events bleiben bei chokidar, nur die `change`-Path-Erweiterung kommt dazu

**Trigger:** Wenn der UX-Eindruck „Dashboard ist nicht live" stört — aktuell ist die State-Detection-Loop alle 2 s ein Mitigator, aber bei längeren Antworten bleiben Plan- und Per-Session-Kontext-Bars sichtbar statisch.

### Feature: Claude-UUID-basiertes Session-Mapping ✅

1:1-Mapping zwischen TakumiDeck-Session und claude-Code-Session über die UUID statt der encodeCwd-Heuristik.

- Aktuell matched der Watcher JSONL-Dateien über den encodeCwd des Eltern-Ordners gegen alle running/idle-Sessions im selben cwd — bei Mehrdeutigkeit gewinnt die jüngste Session
- Beim Spawn die erste JSONL-Zeile lesen (claude-code schreibt sie meist innerhalb von 1–2 s), die `sessionId` aus dem Inhalt extrahieren
- Neue Tabelle `claude_session_links (takumi_session_id, claude_session_id, file_path)` persistieren
- Watcher matched dann über `file_path` direkt, kein Heuristik-Pfad mehr nötig
- Per-Session-Kontext-Bar des „verlierenden" Tabs bei zwei parallelen Sessions im selben Projekt ist dann nicht mehr blind

**Trigger:** Wenn der Edge-Case „zwei Tabs im selben Projekt parallel offen, beide prompten gleichzeitig" im Daily-Use auftritt. Architektur K2 zielt ohnehin auf 2–5 Tabs, parallele Antworten im selben Projekt sind selten — aber die Heuristik ist latent fehlbar.

### Feature: Multi-Session-cwd-Backfill-Migration ✅

Einmaliger Migrations-Pass für resume-tote Sessions mit mehrdeutigem encodeCwd.

- Aktuell mapped der Sprint-6-Resume-Hotfix-Backfill eine claude-UUID aus dem JSONL-Filename auf die jüngste passende TakumiDeck-Session — die anderen bleiben `claude_session_id IS NULL` und damit resume-tot
- Beim App-Start einmalig alle JSONL-Files in `~/.claude/projects/` durchgehen und UUIDs nach `started_at`-Reihenfolge auf die Kandidaten verteilen
- Filesystem-stat plus pro-File-Sortierroutine — nur einmalig, kein Daily-Cost
- Pre-Hotfix-Sessions ohne JSONL bleiben dauerhaft resume-tot (technisch nicht reparabel), Sprint-8-UX-Hint federt das ab

**Trigger:** Wenn der User vor dem Sprint-6-Resume-Hotfix mehrfach im selben Projekt Sessions ohne JSONL-Antwort gespawnt hat. Edge-Case ist eng — 3+ Sessions im selben cwd ohne erste claude-Antwort.

### Feature: Terminal-Session ohne Claude

Neue Session-Art, die statt der claude-Binary direkt eine PowerShell spawnt — fuer Quick-Shells, ad-hoc-Befehle, Git-Operationen ohne unnoetigen Claude-Spawn.

- Neuer Session-Type `'terminal'` in `SessionType`-Enum + zod-`SessionTypeSchema` (zwei Stellen, TypeScript fängt die Call-Sites)
- Im `NewSessionModal` als 6. Button in der bestehenden Reihe — gleicher visueller Stil wie die anderen Arten, ohne separaten "Ohne Agent"-Block
- Spawn-Branch im Main (`src/main/ipc/pty.ts` Zeile ~176): wenn `input.type === 'terminal'` dann `pwsh.exe` aus PATH bevorzugen, Fallback auf `powershell.exe` (Win11-Default, immer vorhanden); kein `--session-id`/`--model`-Flag, weil die Shell die nicht kennt
- Skip-Pfade fuer den terminal-Typ: Season-Counter (`projects.allocateSeasonNumber`), JSONL-Polling-Ring-Attach (kein JSONL), Pre-Spawn-Check via `claude_binary_path` (stattdessen Shell-Resolution), TUI-Pattern-Match in `TerminalTab.tsx` (greift ohnehin nicht — kein esc-to-interrupt, kein Permission-Prompt), Modell-Dropdown im Modal, On-Demand-Kontext-Block im Modal
- Title bleibt Pflichtfeld (Konvention mit den anderen Arten — Tab-Pille braucht Bezeichnung)
- Resume + Verlauf bleiben unveraendert: Terminal-Sessions landen im selben `sessions`-Schema, Resume spawnt die Shell neu im gespeicherten `cwd`
- `current_model`/`claude_session_id` werden bei terminal-Typ auf `null` gesetzt
- `HistoryPane`-`TYPE_LABELS` ergaenzen, damit Verlauf-Filter den neuen Typ kennt

Aufwand-Schaetzung: ~150 Zeilen über 6 Dateien, plus 3-5 targeted Tests fuer den Spawn-Branch (pwsh-Fallback, Skip-Pfade).

**Trigger:** Akuter User-Wunsch aus Daily-Use: oft soll der naechste Tab keinen Claude-Spawn ausloesen (Token-Verbrauch sinnlos fuer `git status`, `npm run lint`, `ls`, schnelle PowerShell-Snippets). Heute muss man dafuer ein externes Windows-Terminal-Fenster oeffnen, was aus dem TakumiDeck-Workflow herausreisst.

### Feature: Terminal-Buffer-Persistierung ueber Resume

Wiederherstellung des xterm-Buffers nach `session:resume`, damit die Resume-Session optisch nicht „leer" startet.

- Heute laeuft Resume nur PTY-seitig: der claude-Prozess wird mit der gespeicherten Session-UUID neu gespawnt, aber der xterm-Buffer (Output-Verlauf, Permission-Antworten, frueherer Plan) ist beim Tab-Mount leer
- `@xterm/addon-serialize` ist bereits geladen — der naechste Schritt waere `serialize.serialize()` beim Tab-Close-Pfad und ein Persist in `sessions.terminal_buffer_serialized` (oder eine eigene Tabelle, falls das Volumen kritisch wird)
- Beim Resume vor `pty.create` den Buffer mit `terminal.write(serialized)` zurueckspielen; dabei `\x1b[2J\x1b[H` nicht doppelt schreiben (Renderer-Bell-Sound bei wiedergesendetem `\a` unterdruecken)
- Offene Fragen vor Implementierung: (1) maximale Buffer-Groesse pro Session (5000 Zeilen × 200 Zeichen ≈ 1 MB pro Session-Snapshot — bei 50 archivierten Sessions wird das spuerbar), (2) Persistenz-Trigger (immer beim Tab-Close, debounced beim onData, oder erst bei session:close)
- Aufloesungs-Kriterium fuer Variante A vs. B vs. C beim Implementieren: Volumen-Messung anhand der eigenen Daily-Driver-Sessions; falls 1 MB pro Session nicht akzeptabel ist, Snapshot-Last-N-Zeilen statt Voll-Buffer

**Trigger:** Sobald das erste Mal ein langer Plan oder Code-Diff-Output verloren ging, weil ein Resume den Buffer reset hat. Phase-2 Season 28 hat den `SerializeAddon` zwar geladen, aber nur fuer Buffer-Snapshots des TUI-Pattern-Match — die Persistenz bleibt offen.

---

## Bereich: Screenshots

### Feature: Screenshot-Drag-and-Drop ins Terminal ✅

Bilder per Drag-and-Drop oder Clipboard-Paste ins Terminal-Pane einfügen.

- Drag aus Explorer + Drag von Direkt-Bildern (Snipping Tool, Browser)
- Clipboard-Paste-Pfad mit MIME-Whitelist (`PNG`/`JPEG`/`GIF`/`WebP`, SVG bewusst raus)
- Ablage in `<userData>/screenshots/screenshot-<UTC-Zeitstempel>.<ext>` außerhalb des Projekt-Pfads
- Pfad wird direkt ins Terminal gepastet, sodass Claude ihn lesen kann

**Trigger:** Daily-Driver-Komfort — entfällt das manuelle Pfad-Tippen für Bild-Inputs. Feature wurde in Phase 2 Season 2 außerhalb der Roadmap implementiert und ist hier rückwirkend erfasst.

### Feature: Screenshot-Retention ✅

Aufräum-Mechanismus für `<userData>/screenshots/`.

- Beim App-Start einmal über das Verzeichnis walken: Files älter als N Tage löschen, plus Cap auf Gesamt-MiB (älteste Files zuerst)
- Defaults z.B. 30 Tage / 500 MiB als hartcodierte Start-Schwellen
- Optional Settings-Slot für die Schwellen, sobald die Defaults sich im Daily-Use bewährt haben
- Alternativ oder zusätzlich: Manual-Clear-Button in Settings

**Trigger:** Aktuell wächst der Ordner unbegrenzt — bei produktivem Daily-Use mit mehreren 4K-PNGs pro Tag sind nach drei Monaten mehrere GiB realistisch. Spätestens, wenn der Disk-Verbrauch das erste Mal auffällt.

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

### Feature: First-Start-Workspace-Wizard ✅

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

### Feature: Reset-Schedule-Aggregation im usage:window ✅

Backend-Nachzug für das in Sprint 9 eingeführte UI-Slot `LimitBar.reset_schedule`.

- Aktuell rechnet `usage:window` weiter rolling über `window_hours`, obwohl die Bar im Tooltip „Reset: Montag 00:00 (Phase-2-Backend)" anzeigt
- Ziel: bei gesetztem `reset_schedule` Window-Start vom letzten Reset-Zeitpunkt rückwärts berechnen statt rolling
- P90-Schätzung bleibt rolling (Limit-Quelle stabil), nur der Verbrauchs-Counter ändert sich
- Tooltip-Suffix `(Phase-2-Backend)` entfernen, sobald die Berechnung greift

**Trigger:** UI-Slot ist seit Sprint 9 da, Schema validiert, JSON-Editor kennt das Feld — sobald die User-Erwartung „setze ich Reset auf Montag 00:00, dann zeigt die Bar Verbrauch seit Montag" auf das Rolling-Window prallt.

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

### Feature: Aktivitäts-Heatmap ✅

GitHub-Style Calendar-Heatmap der letzten 30 Wochen.

- Pro Tag ein farbiges Quadrat
- Farbintensität proportional zum Token-Verbrauch des Tages
- 30-Wochen-Window (Standard), umschaltbar auf 52 Wochen
- Hover zeigt Datum + Token-Anzahl
- Filter: 7d / 30d / Alle

### Feature: Modelle-View ✅

Per-Modell-Aufschlüsselung als zweiter Tab neben Übersicht.

- Bar-Chart der Token-Verteilung pro Modell
- Tabelle: Modell · Sessions · Token total · Durchschnitt pro Session
- Zeitfilter analog zu Übersicht (7d / 30d / Alle)

### Feature: 30d/7d-Filter ✅

Globaler Zeit-Filter für Stats-Section.

- Toggle-Buttons "Alle / 30d / 7d"
- Filter wirkt auf Stats-Cards, Heatmap, Modelle-View
- Persistiert in Settings (zuletzt gewählter Filter)

### Feature: Cache-Hit-Statistik ✅

Getrennte Cache-Token-Spalten + Statistik über die Cache-Hit-Rate.

- Aktuell schreibt der JSONL-Watcher `tokens_in = input_tokens + cache_creation_input_tokens + cache_read_input_tokens` als Summe in eine Spalte — die drei Anteile stehen nicht getrennt zur Verfügung
- Migration: neue Spalten `tokens_cache_creation INTEGER` + `tokens_cache_read INTEGER` in `messages`
- Watcher-Patch schreibt ab Migration die Anteile getrennt mit
- Backfill der historischen Daten: `jsonl_offsets`-Reset für betroffene Sessions, einmaliger Re-Scan-Hit beim nächsten App-Start
- Stats-Section bekommt einen neuen Slot „Cache-Hit-Rate" (Anteil `cache_read` an `tokens_in_total`) — zeigt, wie effizient der Prompt-Cache greift

**Trigger:** Sobald die Frage „wie viel meiner Tokens kommen aus dem Cache" relevant wird — typischerweise wenn die Plan-Bars im 5h-Window früher voll laufen als erwartet und der User wissen will, ob mehr Cache-Reuse das Problem entschärfen würde.

### Feature: Easter-Egg-Vergleiche ✅

Spielerische Token-Vergleiche basierend auf bekannten Werken.

- "Du hast ~31× mehr Token als The Lord of the Rings verwendet"
- Konfigurierbare Vergleichs-Werke in Settings
- Default-Werke: LotR, Bibel, Harry-Potter-Reihe, etc.
- Update bei jedem Stats-Refresh

---

## Bereich: Templates

### Feature: Erweiterte Template-Variablen ✅

Zusätzliche Auto-Variablen.

- `{{LETZTE_SEASON_NAME}}` — aus SQLite, last completed Session
- `{{TECH_SCHULDEN_RELEVANT}}` — automatisch aus TECH_SCHULDEN.md geparst
- `{{LETZTE_ENTSCHEIDUNGEN}}` — Top-3-Einträge aus ENTSCHEIDUNGEN.md

**Trigger:** Wenn die Phase-1-Variablen nicht ausreichen.

### Feature: Top-N für Template-Auto-Variablen konfigurierbar ✅

Settings-Slot für die Anzahl der ins Template eingefügten Einträge.

- Aktuell sind `SCHULDEN_TOP_N` und `ENTSCHEIDUNGEN_TOP_N` hartcoded auf 3 — wer mehr oder weniger Kontext im Prompt haben möchte, müsste den Wert im Code editieren und neu builden
- Zwei `number`-Felder in `AppSettings` (`template_schulden_top_n`, `template_entscheidungen_top_n`) mit Default 3
- zod-Validation `min(0).max(20)`
- Neuer Slot im Settings-Tab „Workspace" oder einem neuen „Templates"-Tab

**Trigger:** Wenn der Top-3-Wert sich empirisch als falsch herausstellt — entweder zu spärlich (User braucht mehr Doku-Kontext im Prompt) oder zu voluminös (Token-Kosten zu hoch).

---

## Bereich: Docs-Sync

### Feature: Docs-Sync-Session ✅

Spezielle Session-Art für Doku-Komprimierung.

- Auf Knopfdruck startbar
- Sendet automatisch vorbereiteten Prompt: "Lies die definierten Doku-Dateien, erstelle kompakte Zusammenfassungen in `docs/SUMMARIES/`"
- Unterstützte Files: `ENTSCHEIDUNGEN.md`, `CHANGELOG.md`, `TECH_SCHULDEN.md`, `FEATURES.md`
- UI für Summary-Status pro Datei (gibt es eine? Wie alt? Original geändert?)

### Feature: Kontext-Checkbox-Erweiterung ✅

Aufbauend auf Phase-1-Pfad-Erinnerung.

- Wenn Summary für eine On-Demand-Datei existiert: Summary-Inhalt als Präambel injizieren statt Pfad-Erinnerung
- Hinweis im UI, wenn Summary fehlt oder veraltet ist

**Trigger:** Wenn Token-Limits in Phase 1 zum Schmerz werden — bis dahin reicht die Pfad-Erinnerung aus Phase 1.

### Feature: SUMMARIES-Resync nach Season 24

Mini-Doku-Sync-Session zur Aktualisierung der `docs/SUMMARIES/*.md` nach v0.2.1.

- Der Doku-Sync-Commit aus v0.2.0 (`ed2b724`, Season-23-Tail) lief zeitlich vor dem Season-24-Commit (`49a0753`) — entsprechend zeigen die vier Summaries den Vor-Season-24-Stand
- Konkrete Drifts (Stand v0.2.1-Release-Review): `SUMMARIES/FEATURES.md` führt Markdown-Preview Side-by-Side noch als ⛔ Offen (Original hat ✅), `SUMMARIES/CHANGELOG.md` erwähnt Season 24 nicht, `SUMMARIES/ENTSCHEIDUNGEN.md` kennt weder die display:none-Mount-Strategie noch `remark-gfm`, `SUMMARIES/TECH_SCHULDEN.md` enthält weder den Resume-Bugfix-Eintrag noch den Markdown-Layout-Eintrag
- Eine reguläre Docs-Sync-Session (Knopfdruck → vorbereiteter Prompt → Re-Erzeugung der vier Summaries) reicht aus; Frontmatter `source_hash` aktualisiert sich dabei automatisch
- Kein Code-Touch nötig — reine Inhalts-Aktualisierung

**Trigger:** Sobald das nächste Mal Kontext-Checkbox-Erweiterung im Daily-Use einen Summary heranzieht und die Diskrepanz sichtbar wird. Bis dahin ist die Drift dokumentiert, aber harmlos (Settings-Erfahrung bleibt funktional unverändert).

---

## Bereich: Editor

### Feature: Markdown-Preview Side-by-Side ✅

Erweiterung des Toggle-Modes aus Phase 1.

- Editor und Preview gleichzeitig sichtbar
- Synchronized Scrolling
- Zwei-Panel-Layout, in Settings konfigurierbar

**Trigger:** Wenn Toggle-Mode aus Phase 1 nicht ausreicht.

---

## Bereich: Settings & Persistenz

### Feature: Settings-Schema-Versionierung mit Migrations-Pipeline ✅

Versionierte Settings-Migration analog zum SQLite-Migrations-Runner.

- `SettingsSchema` bekommt ein `version`-Feld (Default 1)
- Settings-Load liest die Version und führt versionierte Migrations als TypeScript-Funktionen aus
- Pro Migration: alte Defaults erkennen, auf neue Werte mappen, Version inkrementieren
- Bekannte Default-Drifts, die eine erste Migration einsammeln würde:
  - `limit_bars`-Liste (Sprint 9: Claude-Design-Bar entfernt, Sonnet-Label umbenannt)
  - `default_limit` 1 M → 200 k (Sprint 8: Per-Modell-Limit-Defaults)
  - Sensitive-Pattern-Defaults

**Trigger:** Wachsende Bestands-User-Liste mit divergierenden Settings. Solange die User-Liste klein bleibt, ist manuelles Editieren von `settings.json` zumutbar — sobald die App weitergegeben wird oder mehrere Defaults parallel driften, wird die Migrations-Pipeline relevant.

---

## Bereich: Build & Distribution

### Feature: Auto-Update via electron-updater ✅

Automatische Updates beim App-Start.

- electron-updater integrieren
- GitHub-Releases als Update-Quelle
- "Update verfügbar"-Notification, manueller Install-Trigger

**Trigger:** Wenn TakumiDeck an Freunde verteilt wird — bis dahin reichen manuelle Builds.

### Feature: GitHub Actions Build-Pipeline ✅

CI für Releases.

- Bei Tag-Push automatisch Windows-Build erstellen
- Release auf GitHub mit Installer-Binary
- Optional: macOS/Linux-Builds wenn Zielplattform erweitert

**Trigger:** Bei Verteilung.

---

## Bereich: Right-Pane-Polish

Verbesserungen am Right-Pane-Layout aus dem MVP.

### Feature: Datei-Browser-Filter ✅

Erweiterte Filter-Funktion für den Datei-Browser.

- Filter-Suchfeld oben im Datei-Browser
- Live-Filtering nach Dateiname
- File-Type-Toggles (`.md`, `.json`, `.ts`, etc.)
- Persistiert in Settings

### Feature: Pre-Commit-Sensitive-Warning ✅

Warnung vor versehentlichem Commit von sensiblen Files.

- Pattern-Match auf typische Sensitive-Files (`.env`, `secrets.*`, `*.key`, `*.pem`)
- Visueller Warnhinweis im Pre-Commit-Panel
- Optional: Commit-Button disabled bis User die Files explizit bestätigt
- Pattern-Liste in Settings konfigurierbar

### Feature: Datei-Browser-Status-Indikatoren ✅

Visuelle Markierung von Files mit Änderungen.

- "M"-Indikator für modifizierte Files (uncommitted)
- "A"-Indikator für neu hinzugefügte Files
- "D"-Indikator für gelöschte Files
- Aktualisierung via simple-git status-Polling

---

## Bereich: Diff-Viewer

### Feature: Multi-Tab-Diff ✅

Drei Diff-Ansichten parallel.

- Working Tree Diff (= Phase 1)
- Staged Diff (`git diff --staged`)
- Session-spezifischer Diff (seit Session-Start)

**Trigger:** Wenn relevant — wenn der Single-View aus Phase 1 nicht ausreicht.

---

## Allgemeine Bugfixes & Performance

Laufend, keine eigene Season nötig. Werden direkt behoben und im [CHANGELOG.md](../CHANGELOG.md) erfasst.
