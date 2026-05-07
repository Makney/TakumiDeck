# TakumiDeck

Persönliches Multi-Session-Management-Tool für [Claude Code](https://docs.claude.com/en/docs/claude-code/overview). Wraps Claude Code als Engine und ergänzt sie um produktive Karosserie: Multi-Session-Tabs, Token-Dashboard, Templates, Season-Tracker, Diff-Viewer, Markdown-Editor und Notizen.

Der Name reflektiert die Funktion: Als **Takumi** (匠 = Meisterhandwerker) sitzt der Nutzer auf dem **Deck** (Kommandobrücke) und dirigiert parallel laufende Claude-Sessions wie ein Steuermann seine Crew.

## Status

Phase 1 (v0.1) — in Entwicklung. Siehe [docs/roadmap/PHASE1.md](./docs/roadmap/PHASE1.md) für offene Features.

## Stack

- **Runtime**: Electron + TypeScript
- **UI**: React + Zustand
- **Storage**: better-sqlite3
- **Terminal**: xterm.js (Canvas-Renderer) + node-pty
- **Editor**: CodeMirror 6
- **Git**: simple-git
- **Charts**: Recharts
- **Build**: Electron Forge

## Plattform

Windows 11 primär. macOS/Linux später.

## Schnellstart (Dev-Modus)

```bash
git clone https://github.com/Makney/TakumiDeck.git
cd TakumiDeck
npm install
npm start
```

Detaillierte Anleitung: [docs/DEV_SETUP.md](./docs/DEV_SETUP.md).

## Architektur-Referenz

Vollständige Architektur-Dokumentation: [docs/TAKUMIDECK_ARCHITEKTUR.md](./docs/TAKUMIDECK_ARCHITEKTUR.md). Enthält alle Designentscheidungen mit Begründung.

## Lizenz

Privates Projekt, keine Lizenz. Nicht für die öffentliche Nutzung gedacht.