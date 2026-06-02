# Roadmap Phase 3 – Power-Features und Erweiterungen

**Voraussetzung:** Phase 2 abgeschlossen (v0.4.0 stabil im Daily-Use)

**Ziel:** TakumiDeck um langfristige Power-Features erweitern. Diese Phase hat keinen festen Versionsplan — Features werden je nach Bedarf gezogen, wenn der eigene Workflow oder das Tooling-Umfeld sich verändert. Die Versionierung bleibt bei 0.x und ist von der Phase entkoppelt.

**Milestone:** offen

---

Features haben keine feste Reihenfolge. Alle sind optional.

---

## Bereich: Editor

### Feature: Unterstützung für Programmiersprachen-Syntax ✅

Heute kennt der CodeMirror-Editor nur Markdown + YAML. Programmiersprachen-Files (`.ts`/`.tsx`/`.js`/`.jsx`/`.py`/`.go`/`.rs`/`.json`/`.css`/`.html`/...) werden ohne Syntax-Highlighting im Plain-Text-Modus angezeigt — beim direkten Editieren der Projekt-Files unhandlich.

- Erkennung der Sprache aus dem Datei-Suffix (Map `extension → lang-id`); Fallback-Eintraege fuer Ungewoehnliches wie `.mjs`/`.cjs`/`.cts`/`.mts`
- CodeMirror-6-Pakete pro Sprache als On-Demand-Dependencies (`@codemirror/lang-javascript`/`-python`/`-rust`/`-go`/`-json`/`-css`/`-html`); Lazy-Import beim ersten Treffer, damit der Initial-Bundle nicht aufgebläht wird
- Auto-Indent + Bracket-Matching pro Sprache fallen automatisch ueber das jeweilige `lang-*`-Paket an
- Optional: Settings-Map fuer Spezial-Faelle (z.B. `.proto`, `.toml`, `.ini`) ohne offizielles CM6-Paket — Plain-Text bleibt der Default
- Preview-Toggle bleibt fuer Markdown-Files; bei Code-Files ist die Toolbar ohne Preview-Pille

**Trigger:** Wenn das direkte Editieren von Code-Files (statt Wechsel zu VS Code) im Daily-Use haeufig genug wird, dass Plain-Text-Modus stoert. Phase 2 Season 29 (Multi-Tab-Diff) macht durch Auto-Open-Pairing erstmals jedes File aus dem Working-Tree per Klick direkt oeffenbar — damit waechst der Druck auf den Editor-Komfort fuer Nicht-Markdown-Files.

---

## Bereich: Multi-Engine-Support

### Feature: OpenAI Codex als zweite Engine

Eigener Session-Typ neben Claude Code.

- Modell-Dropdown zeigt Codex-Modelle, wenn Codex-Session gewählt
- Engine-spezifische Token-Tracking-Logik (Codex hat andere JSONL-Struktur)
- Settings-Toggle für Codex-Verfügbarkeit

**Trigger:** Wenn Codex relevant wird oder andere CLI-Agents (z.B. Aider, Cline) zum Workflow dazukommen.

### Feature: Engine-agnostisches Session-Datenmodell

Refactoring für saubere Engine-Trennung.

- `engine_type`-Feld in `sessions`-Tabelle
- Pro Engine eigene Spawn-/Resume-/JSONL-Adapter
- UI zeigt Engine-Indikator pro Session

**Voraussetzung:** Codex-Feature oben.

---

## Bereich: Workflow

### Feature: Mehrere Workspace-Ordner

Konfiguration mehrerer Hauptordner für verschiedene Kontexte.

- Settings: Liste von Workspace-Pfaden statt einem
- Sidebar-Filter nach Workspace
- Pro-Workspace-Default-Modell möglich

**Trigger:** Wenn der Workflow mehrere klar getrennte Kontexte hat (z.B. Privat-Projekte und Konsolen-Projekte mit verschiedenen Settings).

### Feature: Worktree-Support ✅

Parallele Sessions am selben Code in verschiedenen Branches.

- `git worktree add` beim Session-Erstellen mit `worktree`-Option
- Cleanup bei Session-Archive
- Diff-Viewer kann Worktree-Diff vs. main-Branch zeigen

**Voraussetzung:** Workflow ändert sich von linear-seasonbasiert zu parallel-experimentell.

### Feature: Pull/Fetch/Branch-Switch in der App

Erweiterte Git-Integration.

- Pull-Button mit Konfliktanzeige
- Branch-Switch via UI
- Branch-Liste in der Sidebar

**Trigger:** Bei Co-Dev oder Branch-heavy Workflows.

### Feature: Ueber-Projekte mit Sub-Projekten in der Sidebar

Hierarchie-Ebene oberhalb der heutigen flachen Projektliste. Aktuell stehen alle Projekte aus dem Workspace gleichberechtigt nebeneinander (Scripts, TakumiDeck, TanaLib, Vorlage, ZenValuation). Sobald die Liste waechst, fehlt eine Gruppierung — z.B. "Tools" (Scripts, Vorlage) vs. "Apps" (TakumiDeck, ZenValuation). Die Aufklapp-Pfeile `▸` neben jedem Projekt-Eintrag in der LeftSidebar stehen seit Sprint 6 da, klappen aber nichts auf — sie suggerieren die Hierarchie, die dieses Feature dann tatsaechlich liefert.

- Schema-Migration: `projects.parent_id TEXT NULL` mit Self-FK auf `projects.id` plus Index
- Workspace-Scanner muss zwei Ordner-Tiefen abdecken: Ein `CLAUDE.md`-Ordner als direktes Kind des Workspace-Roots bleibt Top-Level-Projekt, ein `CLAUDE.md`-Ordner innerhalb eines anderen Projekt-Ordners wird Sub-Projekt
- Sidebar-Rendering rekursiv: Pfeil-Toggle pro Eintrag mit parent_id, Children werden eingerueckt; Toggle-State persistiert in localStorage (Key z.B. `td.projectTree.expanded`)
- Drag&Drop oder Settings-UI fuer manuelles Verschachteln (Projekte aus dem Workspace-Scanner sind oft schon strukturell verschachtelt, aber haendisches Re-Parenting ohne FS-Aenderung soll moeglich sein)
- Aktive-Sessions-Aggregation: Counts werden vom Sub-Projekt aufs Ueber-Projekt rolled up, damit ein zugeklappter Ueber-Projekt-Knoten den orange/gelben Aufmerksamkeits-Marker eines Sub-Projekts uebernimmt (sonst geht die Sichtbarkeit aus Phase-2-Season-32 verloren, sobald die Hierarchie eingeklappt ist)
- HistoryPanel und ActiveSessionsPanel bleiben unveraendert (sie laufen pro `activeProjectId`, das immer ein Leaf-Projekt ist)

**Trigger:** Wenn die Projektliste so lang wird, dass Scrollen oder Suche noetig waere. Aktuell mit 5 Projekten noch ertraeglich.

---

## Bereich: Brainstorming

### Feature: Brainstorming-Panel

Freies Chat-Panel mit Claude, unabhängig von Sessions.

- Implementiert via Stream-JSON-Modus (Opcode-Pattern, nicht PTY)
- Markdown-Rendering, Code-Highlights, Streaming
- Projekt-Kontext anheften: Doku-Summaries als Kontext laden
- "In Projekt übertragen": Ergebnisse in eine Doku-Datei schreiben

**Trigger:** Wenn das ständige Hin- und Herwechseln zwischen Claude Desktop und TakumiDeck zum Schmerz wird.

### Feature: Neues Projekt aus Brainstorming

Setup-Dialog mit Vorlage.

- Button "Als neues Projekt" im Brainstorming-Panel
- Öffnet Setup-Dialog, vorbefüllt mit Brainstorming-Inhalten
- Erstellt neuen Projekt-Ordner mit CLAUDE.md, Doku-Struktur

**Voraussetzung:** Brainstorming-Panel oben.

---

## Bereich: Doku-Intelligenz

### Feature: Semantische Chunk-Suche

Volltext-Suche über Projekt-Doku via SQLite FTS5.

- Doku-Dateien werden in Einzel-Einträge zerlegt (pro `##`-Abschnitt ein Chunk)
- SQLite FTS5-Index für Volltextsuche
- Sidebar-Suchfeld mit Live-Results
- Relevante Chunks werden beim Session-Start automatisch vorgeschlagen (statt der ganzen Datei)

**Trigger:** Wenn die Projekt-Doku massiv wächst und einfache Pfad-Erinnerung nicht mehr reicht.

### Feature: Auto-Update von SUMMARIES

Erweitert die Phase-2-Docs-Sync.

- chokidar watcht Originale (`ENTSCHEIDUNGEN.md` etc.)
- Bei Änderung: visuelle Markierung "Summary veraltet"
- Optional: Auto-Trigger einer Docs-Sync-Session (mit User-Bestätigung)

**Voraussetzung:** Docs-Sync aus Phase 2.

---

## Bereich: Quota-Awareness

**Feature-Block** — drei Features in fester Reihenfolge. Jedes Feature liefert für sich einen brauchbaren Zustand und passt in eine eigene Season.

**Hintergrund:** Heute berechnet TakumiDeck die 5h-Block-Last selbst aus JSONL-Timestamps und Token-Counts. Das driftet vom dem ab, was Claude Codes UI-Bar zeigt, weil Server-Cache-Multiplier und Tool-Use-Kosten nicht sichtbar sind. Anthropic liefert die echten Werte (5h, 7d) offiziell via Statusline-stdin in `rate_limits.five_hour.{used_percentage, resets_at}` und `rate_limits.seven_day.{...}`. Dieser Block hebt diesen Kanal in TakumiDeck und macht ihn parallel zur Eigen-Schätzung sichtbar.

**Nicht in diesem Block:** das `overage`-Feld und Pro-Request-Token-Historie. Beide sind nur via lokalem Proxy zu bekommen und stehen aus TOS-Gründen in [Phase 4](./PHASE4.md) geparkt.

---

### Feature: Statusline-Hook liefert Anthropic-Werte in die DB

Ende-zu-Ende-Pfad vom Claude-Code-PTY-Child bis in eine SQLite-Tabelle, plus einfache Anzeige der 5h-Werte im StatsPane (ersetzt zunächst die lokale Linie, sobald ein Snapshot vorliegt).

- TakumiDeck bringt ein Mini-Statusline-Script (`td-statusline.mjs`, zero npm-Deps, Node-stdlib only) mit, das aus dem stdin-JSON von Claude Code den `rate_limits`-Block liest. Das Script schreibt einen JSON-Snapshot pro Claude-Session in einen TakumiDeck-eigenen Ordner unter `%APPDATA%\TakumiDeck\quota-snapshots\` und druckt nebenbei eine sinnvolle Statusline-Zeile.
- Beim PTY-Spawn setzt TakumiDeck eine Env-Variable mit dem Zielordner und konfiguriert für die gespawnte Claude-Code-Instanz die Statusline so, dass sie auf das mitgelieferte Script zeigt — ohne die globale User-Statusline in `~/.claude/settings.json` anzufassen. Der exakte Mechanismus (Env-Variable wie `CLAUDE_CONFIG_DIR`, isoliertes Scratch-Settings-Verzeichnis, oder Projekt-lokale Settings) ist zu Beginn dieser Season einmal manuell zu verifizieren.
- Neue Migration `0010_quota_snapshots.sql` mit Tabelle `quota_snapshots`: eine Zeile pro Claude-Session, Upsert, keine Historie in V1.
- Ein chokidar-Watcher im Main-Prozess liest die Snapshot-Files, joint die Claude-Session-ID mit der TakumiDeck-Session-ID (existierendes Pattern aus Sprint 3) und schreibt via Repo in die neue Tabelle.
- StatsPane zeigt den 5h-Wert aus dem Snapshot, sobald einer eingetroffen ist. Pre-Bootstrap-Fenster (vor erster Antwort) und Non-Pro-Subscribers: Panel bleibt auf der bestehenden lokalen Schätzung, kein leerer Slot.
- Kein Settings-Toggle in diesem Schritt — Feature ist immer an.

**Trigger:** Wenn der Drift zwischen TakumiDecks Eigen-Schätzung und dem, was Claude Codes UI-Bar zeigt, im Daily-Use spürbar wird. Wahrscheinlich nach längeren Sessions mit viel Tool-Use, weil dort der Server-Cache-Multiplier am stärksten wirkt.

**Vorabklärung:** Mechanismus für Per-Session-Statusline-Override (siehe oben). Bevor die Season startet, muss das einmal manuell verifiziert sein.

---

### Feature: Augmentierung statt Ersatz — zwei Linien plus 7d-Limit

Der StatsPane zeigt die Anthropic-Wahrheit und die TakumiDeck-Schätzung parallel nebeneinander, plus 7d-Limit als zweite Zeile, plus Reset-Zeit als Tooltip.

- Zweite Mini-Linie unter der primären 5h-Bar mit Label „lokal" für die JSONL-Eigen-Schätzung und „API" für den Anthropic-Wert. Wenn nur einer verfügbar ist, wird nur dieser gezeigt.
- 7d-Limit als neue Zeile unter dem 5h-Block, sichtbar sobald der Snapshot Daten liefert. TakumiDeck hatte bisher keine 7d-Anzeige.
- Tooltip pro Linie: „Reset um HH:MM" aus dem `resets_at`-Feld (lokalisiert) und „Datenstand vor Xs" aus dem Snapshot-Timestamp.
- Staleness-Regel: Snapshots älter als 60 s gelten als nicht da; UI fällt für die „API"-Linie still auf die lokale Schätzung zurück. Übernimmt die Reddit-Empfehlung von jake_that_dude und verhindert, dass ein abgestürztes Script veraltete Werte als Wahrheit zeigt.
- Visuelles Vokabular bleibt im bestehenden Token-System (`--td-accent`, `--td-line`, `--td-panel`); keine neuen Design-Tokens.

**Voraussetzung:** Statusline-Hook-Feature oben.

**Trigger:** Sobald Feature 1 stabil läuft. Dieses Feature macht die Daten aus Feature 1 erst richtig sichtbar.

---

### Feature: Settings-Toggle und Aufräumen

Letztes Polish-Feature des Blocks: User-Kontrolle und Operations-Hygiene.

- Settings-Schalter „Statusline-Hook für Anthropic-Werte aktiv" mit Default `on`. Wenn aus, läuft TakumiDeck weiter ausschließlich auf der lokalen Schätzung und der StatsPane zeigt nur die „lokal"-Linie. Schema-Migration defensiv pro Feld (existierendes Pattern aus v0.3.0).
- Cleanup-Hook beim PTY-Exit: das Snapshot-File der beendeten Session wird gelöscht. Idempotent.
- Boot-Sweep: beim App-Start räumt TakumiDeck verwaiste Snapshot-Files aus dem Ordner (z.B. nach einem App-Crash), bevor der Watcher startet.
- Behandlung einer vom User selbst gepflegten globalen Statusline: in diesem Feature noch keine Wrapping-Logik — TakumiDeck-gespawnte Sessions überschreiben die User-Statusline. Wrapping (Original-Script als Sub-Aufruf einbinden, dessen stdout durchreichen) ist als spätere Erweiterung denkbar, sobald jemand mit eigener Statusline TakumiDeck wirklich nutzt.

**Voraussetzung:** Beide Features oben.

**Trigger:** Sobald Feature 2 läuft. Kann eigenständig gezogen werden und blockiert nicht andere Phase-3-Features.

---

## Bereich: Plattform

### Feature: macOS-Support

Cross-Platform-Build.

- Electron Forge `make` für macOS-Targets
- AppData-Pfad-Adaptierung (`~/Library/Application Support/TakumiDeck`)
- Build-Pipeline auf GitHub Actions mit macOS-Runner
- Code-Signing via Apple Developer ID (kostet ~$99/Jahr)

**Trigger:** Wenn macOS als Zielplattform relevant wird.

### Feature: Linux-Support

Linux-Build.

- AppImage oder Debian-Package
- AppData-Pfad-Adaptierung (`~/.config/TakumiDeck`)
- Build-Pipeline auf GitHub Actions mit Linux-Runner

**Trigger:** Wenn Linux als Zielplattform relevant wird.

---

## Bereich: Polish & Power

### Feature: Helles Theme

Light-Mode-Variante.

- Theme-Toggle in Settings
- xterm.js, CodeMirror, App-Chrome alle theme-aware
- System-Theme-Detection optional

**Trigger:** Persönliche Präferenz oder externe Anforderung.

### Feature: Erweiterte Tastatur-Shortcuts

Power-User-Workflow.

- `Ctrl+T` neue Session
- `Ctrl+Tab` / `Ctrl+Shift+Tab` Session-Wechsel
- `Ctrl+Enter` Template senden
- Vollständig konfigurierbar in Settings

**Trigger:** Wenn die Maus-Bedienung zum Bottleneck wird.

### Feature: Session-Cloning

Schnell-Duplizieren einer Session-Konfig.

- Rechtsklick auf Session → "Duplizieren"
- Erstellt neue Session mit gleichem Modell, gleichem cwd, gleichen Notizen-Template
- Spart Klicks beim häufigen Spawnen ähnlicher Sessions

**Trigger:** Wenn häufig ähnliche Sessions erstellt werden.

---

## Allgemeine Bugfixes & Performance

Laufend, keine eigene Season nötig. Werden direkt behoben und im [CHANGELOG.md](../CHANGELOG.md) erfasst.