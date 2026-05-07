# Roadmap Phase 3 – Power-Features und Erweiterungen

**Voraussetzung:** Phase 2 abgeschlossen (v1.0 stabil)

**Ziel:** TakumiDeck um langfristige Power-Features erweitern. Diese Phase hat keinen festen Versionsplan — Features werden je nach Bedarf gezogen, wenn der eigene Workflow oder das Tooling-Umfeld sich verändert.

**Milestone:** offen

---

Features haben keine feste Reihenfolge. Alle sind optional.

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

### Feature: Worktree-Support

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