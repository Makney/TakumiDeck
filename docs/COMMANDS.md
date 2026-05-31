# Befehlsreferenz (TakumiDeck)

Verifizierte Shell-Befehle für dieses Projekt. Claude liest diese Datei in jeder Session.

**Zweck:** Reibungsverluste durch falsche Shell-Syntax (PowerShell vs. bash) und unbekannte Projekt-Befehle vermeiden. Wenn ein Befehl hier nicht steht oder fehlschlägt, erst fragen — nicht raten.

## Shell-Umgebung

| Plattform    | Shell                  | Anmerkung                                                 |
| ------------ | ---------------------- | --------------------------------------------------------- |
| `Windows 11` | `PowerShell 7+ (pwsh)` | Standard-Shell für TakumiDeck                             |
| Fallback     | `bash` (Git-Bash/WSL)  | Für POSIX-Skripte, wenn PowerShell-Idiom umständlich ist  |

---

## PowerShell-Stolperfallen

Häufige Fehler, wenn bash-Idiome unreflektiert auf PowerShell übertragen werden. Linke Spalte → falsch, rechte → korrekt.

### Variablen

| ⛔ bash-Stil           | ✅ PowerShell                  |
| ---------------------- | ------------------------------ |
| `$VAR`                 | `$env:VAR` (Env-Var lesen)     |
| `export VAR=value`     | `$env:VAR = "value"`           |
| `VAR=value command`    | Vorher `$env:VAR = "value"; …` |

### Umleitung & Null-Senken

| ⛔ bash-Stil           | ✅ PowerShell                                |
| ---------------------- | -------------------------------------------- |
| `command > /dev/null`  | `command > $null` oder `command \| Out-Null` |
| `command 2>&1`         | `command 2>&1` (identisch)                   |
| `command &`            | Background: `Start-Job { command }`          |

### Vergleichsoperatoren

| ⛔ bash/C-Stil  | ✅ PowerShell                 |
| -------------- | ----------------------------- |
| `==`, `!=`     | `-eq`, `-ne`                  |
| `<`, `>`       | `-lt`, `-gt`                  |
| `<=`, `>=`     | `-le`, `-ge`                  |
| `=~` (Regex)   | `-match`                      |
| `-z`, `-n`     | `[string]::IsNullOrEmpty($x)` |

### Pfad & Datei

| ⛔ POSIX                  | ✅ PowerShell                     |
| ------------------------ | --------------------------------- |
| `~/file`                 | `$HOME\file` oder `~\file`        |
| Pfad-Separator `/`       | `/` funktioniert, idiomatisch `\` |
| `which cmd`              | `Get-Command cmd`                 |

### Zeilenfortsetzung

- ⛔ Backslash `\` am Zeilenende (bash) — wird in PowerShell als Literal interpretiert.
- ✅ Backtick `` ` `` am Zeilenende.

### Heredoc / Mehrzeilen-Strings an native Tools

- ⛔ `<<EOF … EOF` (bash) funktioniert nicht.
- ✅ Single-quoted Here-String, schließendes `'@` **muss in Spalte 0** stehen, sonst Parse-Fehler.

```powershell
git commit -m @'
Erste Zeile.
Zweite Zeile mit $literal-Dollarzeichen.
'@
```

⚠️ **Der `@'…'@`-Here-String ist PowerShell-only.** Wird er versehentlich über das
**Bash-Tool** abgesetzt, kennt bash die Syntax nicht: das führende `@` und das
schließende `'@` landen als Literale in der Commit-Message (Subject begann mit `@`,
Body endete mit `'@`). Vor dem Absetzen prüfen, in welchem Tool man steckt.

✅ **Shell-übergreifend sichere Variante** (PowerShell *und* Bash) — pro Absatz ein
eigenes `-m`-Flag, Git fügt die Leerzeilen dazwischen ein. Default für mehrzeilige
Commits:

```text
git commit -m "Subject-Zeile" -m "Absatz Body." -m "Co-Authored-By: …"
```

### Destruktive Cmdlets fragen interaktiv

- `Remove-Item`, `Stop-Process`, `Clear-Content` fragen ggf. nach Bestätigung.
- Bei Skript-Nutzung: `-Confirm:$false` ergänzen. `-Force` für Read-only/Hidden-Items.

### Argumente mit `-` oder `@` an native Exes

- Stop-Parsing-Token verwenden, damit PowerShell die Folgeargumente nicht eigeninterpretiert:

```powershell
git log --% --format=%H
```

### Pipeline ist Objekt-basiert

- ⛔ `command | grep foo` — `grep` ist auf Windows oft nicht installiert.
- ✅ `command | Select-String foo` oder `command | Where-Object { $_ -match "foo" }`.

---

## Projektspezifische Befehle

### Installation & Setup

```powershell
npm install
```

Nach `npm install` muss `better-sqlite3` einmalig für die Electron-ABI rebuilt werden:

```powershell
npx @electron/rebuild -w better-sqlite3 -o better-sqlite3
```

⚠️ **Kein `-f`-Flag** — erzwingt Quellcode-Compile, schlägt mit Electron 41 + V8 13 fehl.

### Entwicklung starten

```powershell
npm start
```

Öffnet die Electron-Desktop-App im Dev-Mode (HMR aktiv). AppData-Pfad: `%APPDATA%\TakumiDeck-dev\` — kein Konflikt mit einer Production-Installation. Kein Browser, kein localhost.

### Build (Produktion)

```powershell
npm run make
```

Erzeugt zwei Artefakte unter `out/make/`:

- `squirrel.windows/x64/TakumiDeck-<version> Setup.exe` — Squirrel-Installer
- `zip/win32/x64/TakumiDeck-win32-x64-<version>.zip` — Portable-ZIP

Vollständiger Release-Ablauf → [release/VERSIONIERUNG.md](./release/VERSIONIERUNG.md)

### Tests

| Zweck              | Befehl                                                    |
| ------------------ | --------------------------------------------------------- |
| Alle Tests         | `npm test`                                                |
| Gezielter Testlauf | `npx vitest run tests/main/mein-feature.test.ts`          |
| Watch-Modus        | `npm run test:watch`                                      |

Test-Pfade folgen dem Schema `tests/<bereich>/<feature>.test.ts` — z.B. `tests/main/`, `tests/shared/`, `tests/renderer/`.

### Lint & Format

| Zweck         | Befehl                  |
| ------------- | ----------------------- |
| Lint-Check    | `npm run lint`          |
| Auto-Format   | — (kein separates Format-Tool; ESLint mit `--fix` nicht Standard) |
| Type-Check    | `npm run typecheck`     |

`npm run typecheck` prüft Renderer- und Main/Preload-Projekt getrennt (`tsconfig.json` + `tsconfig.node.json`).

### Aufräumen

| Zweck               | Befehl                                                          |
| ------------------- | --------------------------------------------------------------- |
| Build-Artefakte     | `Remove-Item -Recurse -Force out, .vite`                        |
| Dependencies neu    | `Remove-Item -Recurse -Force node_modules; npm install`         |

---

## Verifiziert funktionierende Befehle

| Befehl | Was es tut | Zuletzt verifiziert |
| ------ | ---------- | ------------------- |
| `npx @electron/rebuild -w better-sqlite3 -o better-sqlite3` | Rebuildet `better-sqlite3` gegen Electron-ABI — löst NODE_MODULE_VERSION-Mismatch | 2026-05-25 |
| `npx fallow` | Dead-Code-Analyse + Health-Check (MIT) — Pflicht-Vor-Pass vor Code-Reviews | 2026-05-25 |
| `npm run make` | Production-Build: Squirrel-Setup + Portable-ZIP unter `out/make/` | 2026-05-25 |
| `claude --version` | Prüft, ob `claude` im System-PATH liegt — Voraussetzung für Session-Spawn | 2026-05-25 |

---

## Bekannt nicht funktionierende Befehle

| Befehl | Symptom | Grund / Alternative |
| ------ | ------- | ------------------- |
| `npx @electron/rebuild -w better-sqlite3 -o better-sqlite3 -f` | Compile-Fehler: inkompatible V8-Quellen | `-f` erzwingt Quellcode-Compile statt Prebuild-Download — mit Electron 41 + V8 13 nicht kompatibel. **Ohne `-f`** verwenden. |
| `npm install windows-build-tools` | Package not found / deprecated error | Paket seit 2019 deprecated. Stattdessen: **Visual Studio 2022 Build Tools** mit Workload „Desktop-Entwicklung mit C++" manuell installieren. |
