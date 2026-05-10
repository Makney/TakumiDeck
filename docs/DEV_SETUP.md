# Entwicklungsumgebung

Schritt-für-Schritt-Anleitung für eine frische Entwicklungsumgebung. Ziel: von Null auf laufendes Projekt in möglichst wenigen Schritten.

## Voraussetzungen

| Tool         | Mindestversion | Hinweis                                                 |
| ------------ | -------------- | ------------------------------------------------------- |
| `Node.js`    | 20.x LTS       | Empfohlen via [nvm-windows](https://github.com/coreybutler/nvm-windows) |
| `npm`        | 10.x           | Kommt mit Node.js                                       |
| `Git`        | 2.40+          | Für `simple-git`-Operationen                            |
| `Claude Code`| 2.0+           | Wird als Subprocess gespawnt — muss im PATH liegen      |

Plattform: Windows 11 primär. macOS/Linux später (siehe `roadmap/PHASE3.md`).

## Einrichtung

### 1. Repository klonen

```bash
git clone https://github.com/Makney/TakumiDeck.git
cd TakumiDeck
```

### 2. Abhängigkeiten installieren

```bash
npm install
```

Bei Problemen mit `node-pty` (Native-Module): siehe Abschnitt „Häufige Probleme" weiter unten.

### 3. Claude Code verifizieren

TakumiDeck spawnt `claude` als Subprocess. Stelle sicher, dass es global verfügbar ist:

```bash
claude --version
```

Wenn das einen Fehler gibt: Claude Code installieren via [Anthropic-Doku](https://docs.claude.com/en/docs/claude-code).

### 4. Dev-Mode starten

```bash
npm start
```

Im Dev-Mode wird ein separater AppData-Ordner verwendet (`%APPDATA%\TakumiDeck-dev\`), damit Daten nicht mit der Production-Installation kollidieren.

### 5. Production-Build erstellen (optional)

```bash
npm run make
```

Erzeugt zwei Artefakte unter `out/make/` (V6-B aus Sprint 8 — Setup + Portable):

| Artefakt | Pfad | Wann nehmen |
|---|---|---|
| **Squirrel-Setup** | `out/make/squirrel.windows/x64/TakumiDeck-<version> Setup.exe` | Klassische Windows-Installation mit Start-Menü-Eintrag und automatischem Update-Stub (im MVP nicht aktiviert) |
| **Portable-ZIP** | `out/make/zip/win32/x64/TakumiDeck-win32-x64-<version>.zip` | Auf USB-Stick, Probelauf auf zweiter Maschine, Distribution an Freunde ohne Installations-Stress |

Beide nutzen den Standard-AppData-Ordner (`%APPDATA%\TakumiDeck\`). Erste Installation triggert SmartScreen einmalig — kein Code-Signing im MVP (Architektur 12, Phase 5+).

### 6. Manuelle GitHub-Release-Anleitung

Sprint 8 nutzt manuelle Releases (kein Auto-Update, keine GitHub Actions):

1. Version in `package.json` bumpen (`"version": "0.1.0"` → `"0.1.1"`).
2. `npm run make` lokal laufen lassen.
3. Beide Artefakte aus `out/make/` einsammeln:
   - `squirrel.windows/x64/TakumiDeck-*.exe`
   - `zip/win32/x64/TakumiDeck-*.zip`
4. Auf GitHub: **Releases → Draft a new release → Choose a tag** (z.B. `v0.1.1` neu anlegen).
5. Release-Notes aus `docs/CHANGELOG.md` den letzten Sprint-Block kopieren.
6. Beide Artefakte als Asset hochladen.
7. **Publish release** — GitHub bewahrt die Files dauerhaft.

Code-Signing und Auto-Update kommen erst in Phase 5+ (Architektur 12), wenn die App aktiv geteilt wird.

---

## Schnellstart-Skripte

Im Repo gibt es zwei `.bat`-Dateien für Windows-Schnellstart (analog zum Workflow bei TanaLib/ZenValuation):

- `start-dev.bat` — startet `npm start` (Dev-Mode mit HMR)
- `build.bat` — startet `npm run make` (Production-Build)

Beide werden ohne offenes Terminal-Fenster ausgeführt — Doppelklick reicht.

---

## Häufige Probleme

### `node-pty` kompiliert nicht

**Symptom:** Bei `npm install` Fehler wie `MSBuild not found` oder `Python not found`.

**Ursache:** `node-pty` ist ein Native-Modul. Die `@homebridge/node-pty-prebuilt-multiarch`-Variante sollte Prebuilds für gängige Electron-Versionen mitliefern, aber bei seltenen Versionen kann es trotzdem kompilieren wollen.

**Lösung:** Auf eine unterstützte Electron-Version pinnen (siehe `package.json`). Falls weiter problematisch: [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools) installieren.

### Claude Code wird nicht gefunden

**Symptom:** Beim Session-Start in TakumiDeck: „claude command not found" oder leeres Terminal.

**Ursache:** `claude` ist nicht im System-PATH.

**Lösung:** Claude Code neu installieren oder PATH anpassen. Test: `claude --version` muss in einem frischen Terminal funktionieren.

### SQLite-Locking-Fehler

**Symptom:** Bei parallelem Dev-Mode + Production-Build gleichzeitig: SQLite-Database-Locked-Errors.

**Ursache:** Beide nutzen denselben AppData-Ordner.

**Lösung:** Bei aktiver Production-Installation nur Dev-Mode oder Production verwenden — nicht beides gleichzeitig. Dev-Mode hat seit Default einen separaten AppData (`-dev` Suffix), das sollte das Problem lösen.

### Token-Tracking zeigt nichts

**Symptom:** Dashboard bleibt leer, obwohl eine Claude-Code-Session läuft.

**Ursache:** chokidar findet die JSONL-Dateien nicht.

**Lösung:** Prüfen, ob `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` tatsächlich existiert. Auf Windows ist `~` = `%USERPROFILE%` (`C:\Users\<DeinName>\`).

---

## Repo-Struktur
```
TakumiDeck/
├── src/                # Quellcode (wird in Sprint 1 angelegt)
│   ├── main/           # Electron Main-Prozess
│   ├── preload/        # IPC-Bridge
│   ├── renderer/       # React-UI
│   └── shared/         # Geteilte Types
├── docs/               # Dokumentation (Du bist hier)
├── .claude/            # Claude-Code-Konfiguration
├── package.json        # Dependencies, Scripts
└── CLAUDE.md           # Projekt-Steckbrief mit YAML-Frontmatter
```
Detaillierte Architektur: [TAKUMIDECK_ARCHITEKTUR.md](./TAKUMIDECK_ARCHITEKTUR.md), Kapitel 3 (Prozess-Architektur) und Kapitel 4 (Persistenz).