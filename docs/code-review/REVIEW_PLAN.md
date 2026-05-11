# Code-Review-Plan

**Stand:** 2026-05-10
**Scope:** Pre-Release-QA für TakumiDeck v0.1 (MVP-Stabilisierung nach Sprint 9)
**Quelle:** [TEMPLATE.md](./TEMPLATE.md) · [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md)

Dieser Plan definiert die **Bereiche**, **Reihenfolge** und **Tooling**, mit denen wir den Code des MVPs systematisch durchgehen. Jeder Bereich bekommt einen eigenen Review-Pass nach dem Schema aus `TEMPLATE.md` und legt seine bewusst-offen-bleibenden Befunde in einer `OFFEN_<BEREICH>.md` ab.

---

## 1. Tooling

Statische Analyse und Linting laufen **vor** jedem Bereichs-Review als automatisierter Vor-Pass — nur was die Tools nicht bereits melden, wird im manuellen Review behandelt.

### 1.1 Pflicht-Tools (lokal, kostenlos, im Repo verankerbar)

| Tool | Zweck | Pass-Stelle |
|---|---|---|
| `tsc --noEmit` | TypeScript-Strict-Typcheck (bereits im `npm run typecheck` vorhanden) | Vor jedem Review |
| ESLint + `@typescript-eslint` | Style + Bug-Pattern + React-Hooks-Regeln | Vor jedem Review |
| `eslint-plugin-react-hooks` | Hook-Reihenfolge, Dep-Arrays, StrictMode-Side-Effect-Hinweise | Renderer-Reviews |
| `eslint-plugin-security` | Standard-Bug-Pattern (eval, child_process-Argumente, Path-Traversal) | Main-Prozess-Reviews |
| **Fallow** (`npx fallow`) | Codebase-Intelligence: Dead Code, Duplikate, Complexity-Hotspots, Architektur-Drift, ungenutzte Exports/Files/Dependencies | Globaler Pass am Anfang + vor Bereichs-Reviews |
| Semgrep (`p/typescript`, `p/electron`, `p/react`) | Custom-Rules + Electron-spezifische Pattern (Context-Isolation, Remote-Module, IPC-Sender-Validation) | Main + Preload + Shared |
| `npm audit --audit-level=high` | Bekannte Schwachstellen in Dependencies | Globaler Pass am Anfang |

### 1.2 Fallow im Detail (zentrale Rolle im Workflow)

[Fallow](https://docs.fallow.tools/) ist MIT-lizenziert, kostenlos für die statische Schicht und integriert sich nativ in Claude Code via **MCP** — d.h. der Review-Agent kann Fallows Befunde direkt als Tool-Calls abfragen, ohne Zwischen-Export.

**Sub-Kommandos und Mapping auf die Review-Bereiche:**

| Kommando | Was es liefert | Wo es im Plan andockt |
|---|---|---|
| `npx fallow dead-code` | Ungenutzte Files, Exports, Dependencies | Globaler Erst-Pass — relevant für alle Bereiche, primär Bereich 1 + 9 |
| `npx fallow dupes` | Duplizierte Logik-Blöcke | Globaler Erst-Pass — primär Bereich 3, 7, 8 |
| `npx fallow health` | Komplexitäts-Hotspots im Module-Graph | Globaler Erst-Pass — primär Bereich 3, 7 |
| `npx fallow audit` | Kombi-Pass auf veränderte Dateien (für Pre-Commit-Hook geeignet) | Optional bei laufender Sprint-Arbeit |
| `npx fallow fix --dry-run` | Vorschau auf Auto-Fixes (kein Apply ohne Review!) | Nach Befund-Report, **vor** „fix it"-Signal manuell prüfen |

⚠️ **Wichtig zur Aufruf-Syntax:** Fallow nimmt **keine Positional-Pfade**. `npx fallow dead-code -- src/shared` und `npx fallow dead-code src/shared` sind beide falsch. Pfad-Scoping geht ausschließlich über `--file <einzelne-datei>` (mehrfach), `-r <root>`, oder `--changed-since <git-ref>`. Empfehlung für TakumiDeck (Single-Package, kleines Projekt): **global laufen lassen** und pro Bereich die relevanten Zeilen mental aus dem Report filtern. Inkrementelles Caching macht Folge-Läufe schnell.

**Integrations-Pfade:**

- **CLI lokal** — `npx fallow` ohne Konfiguration als Erst-Pass.
- **VS Code Extension** — Real-Time-Diagnostics via Code Lens während der laufenden Sprint-Arbeit.
- **MCP-Server** — als Tool-Provider für Claude Code, damit der Review-Agent „lebende" Daten abfragt statt Snapshot-Reports.
- **Optionale Runtime-Schicht** (kostenpflichtig) — zeigt, welcher Code tatsächlich in Produktion lief. Für ein privates Daily-Driver-Tool **nicht relevant** — Static-Layer reicht.

⚠️ **Wichtig:** Fallow ersetzt nicht den manuellen Review. Es liefert Hypothesen („dieses Export wird nirgends verwendet"), die im Bereichs-Review gegen Architektur-Absicht (Phase-2-Stub, Test-Helper, dynamischer Import) verifiziert werden müssen, bevor etwas gelöscht wird.

### 1.3 Empfohlene Zusatz-Tools (bei Bedarf, nicht Voraussetzung)

| Tool | Zweck | Wann |
|---|---|---|
| `electronegativity` (Doyensec CLI) | Electron-spezifische Misconfig-Checks (sandbox, contextIsolation, allowRunningInsecureContent) | Pflicht-Pass im Bereich 5 (Preload) |
| SonarQube Community / SonarCloud | Cross-File-Komplexitäts- und Duplikats-Metriken | Falls Fallow `health` große Lücken offenlässt |
| Snyk Code (Free-Tier) | SAST-Scan inkl. CWE-Klassifizierung | Vor v0.1-Release als finaler Security-Pass |
| DeepScan (GitHub-App) | React/TypeScript-Bug-Pattern (Promise-Leaks, unhandled rejections) | Optional bei Renderer-Reviews |
| `madge` | Zirkuläre Imports und Dep-Graphen | Nur falls Fallow `health` keine Drift-Map liefert |

### 1.4 Quellen der Tool-Recherche

- [Fallow — Codebase Intelligence für TypeScript/JavaScript](https://docs.fallow.tools/)
- [Best TypeScript Static Code Analysis Tools 2026](https://www.code-quality.io/best-typescript-tools-for-developers-in-2026)
- [Static Code Analysis Tools — Definitive Guide 2026](https://dev.to/rahulxsingh/static-code-analysis-tools-the-definitive-guide-2026-19cg)
- [Electron Security — Official Docs](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Security Checklist (Doyensec / Electronegativity)](https://www.doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf)
- [Existing code review tools for TypeScript (Graphite)](https://graphite.com/guides/existing-code-review-tools-for-typescript)

---

## 2. Bereiche

Reihenfolge folgt der **Daten-Fluss-Tiefe**: zuerst die Stellen, von denen der Rest abhängt (Shared-Types → DB → Main-Services → IPC → Preload → Stores → Panels → Modals → Build). So tauchen Inkonsistenzen früh auf und nachfolgende Reviews müssen nicht mehrfach an dieselben Symptome.

### Bereich 1 — Shared (Types, IPC-Channels, Schemas)

- **Dateien:** `src/shared/types.ts` · `src/shared/ipc-channels.ts` · `src/shared/schemas.ts` · `src/shared/result.ts` · `src/shared/constants.ts`
- **Findings-Backlog:** [OFFEN_SHARED.md](./OFFEN_SHARED.md)
- **Bereichs-spezifische Prüfpunkte:**
  - Sind alle in `Channels` definierten Kanäle in der Preload-Bridge abgedeckt — und umgekehrt keine toten Channels?
  - Stimmen `zod`-Schemas in `schemas.ts` mit den TS-Typen in `types.ts` überein (kein Drift)?
  - `Result<T>`-Pattern konsistent verwendet — keine geworfenen Errors aus IPC-Handlern?
  - Sind `as const`-Definitionen wirklich `as const` (sonst widened TS den Typ)?

### Bereich 2 — Datenschicht (better-sqlite3)

- **Dateien:** `src/main/db/connection.ts` · `src/main/db/migrations.ts` · `src/main/db/repos/*.ts` (projects, sessions, messages, usage, jsonl-offsets)
- **Findings-Backlog:** [OFFEN_DB.md](./OFFEN_DB.md)
- **Bereichs-spezifische Prüfpunkte:**
  - Alle Statements als Prepared-Statements (kein dynamisches SQL-String-Concat mit User-Input)?
  - Transaktionen für Multi-Statement-Operationen?
  - WAL-Mode aktiv, `PRAGMA foreign_keys = ON`?
  - Migrationen idempotent und versioniert?
  - Indices auf `usage_buckets(bucket_start)` und `messages(session_id, ts)` angelegt (laut Architektur 4)?
  - Cascading-Deletes für `ON DELETE CASCADE` korrekt (sessions → messages)?

### Bereich 3 — Main-Services (PTY, JSONL, Workspace, Sessions, Git, Usage, Templates, FS)

- **Dateien:** `src/main/pty/*.ts` · `src/main/jsonl/*.ts` · `src/main/workspace/*.ts` · `src/main/sessions/*.ts` · `src/main/git/driver.ts` · `src/main/usage/*.ts` · `src/main/templates/reader.ts` · `src/main/fs/treeScanner.ts` · `src/main/settings/*.ts` · `src/main/paths.ts` · `src/main/logger.ts` · `src/main/main.ts`
- **Findings-Backlog:** [OFFEN_MAIN_SERVICES.md](./OFFEN_MAIN_SERVICES.md)
- **Bereichs-spezifische Prüfpunkte:**
  - PTY-Throttling 16ms wirklich implementiert (Architektur 3)?
  - `chokidar`-Watcher mit Debounce 500ms? Cleanup bei Session-Close?
  - State-Detection-Loop nicht-blockierend, mit Backoff bei Errors?
  - `simple-git`-Aufrufe immer auf bekanntem `cwd` (kein User-kontrollierter Path)?
  - Path-Traversal-Schutz in `fs/treeScanner.ts` und `templates/reader.ts`?
  - JSONL-Parser robust gegen abgeschnittene/korrupte Zeilen?
  - Reconciliation `interrupted → resumed` korrekt (laut Lifecycle Architektur 7)?

### Bereich 4 — IPC-Handler (Validation + Result-Pattern)

- **Dateien:** `src/main/ipc/app.ts` · `src/main/ipc/fs.ts` · `src/main/ipc/git.ts` · `src/main/ipc/project.ts` · `src/main/ipc/pty.ts` · `src/main/ipc/session.ts` · `src/main/ipc/settings.ts` · `src/main/ipc/usage.ts`
- **Findings-Backlog:** [OFFEN_IPC.md](./OFFEN_IPC.md)
- **Bereichs-spezifische Prüfpunkte:**
  - Jeder Handler validiert sein Input via `zod` (Architektur 3)?
  - Kein Throw aus Handler — immer `Result<T>` zurück?
  - Sender-Validation für privilegierte Channels (`fs:write`, `pty:create`, `git:commit`-äquivalente)?
  - Keine raw `BrowserWindow`/`ipcMain.handle`-Calls außerhalb des `ipc/`-Layers?
  - Errors strukturiert geloggt (`electron-log`), keine sensitiven Daten im Log?

### Bereich 5 — Preload-Bridge

- **Dateien:** `src/preload/preload.ts`
- **Findings-Backlog:** [OFFEN_PRELOAD.md](./OFFEN_PRELOAD.md)
- **Bereichs-spezifische Prüfpunkte:**
  - **Pflicht-Tool:** `electronegativity` ausführen.
  - `contextBridge.exposeInMainWorld` statt `window.X = …`?
  - Keine `ipcRenderer.send/invoke` direkt exponiert (nur gewrappte Methoden)?
  - Domain-Gruppierung wie in Architektur 3 vorgegeben (`api.projects`, `api.sessions`, `api.pty`, …)?
  - Kein Node-API durchgereicht (kein `process`, kein `require`)?

### Bereich 6 — Renderer-Stores (Zustand)

- **Dateien:** `src/renderer/stores/projects.ts` · `src/renderer/stores/sessions.ts` · `src/renderer/stores/ui.ts` · `src/renderer/stores/usage.ts` · `src/renderer/stores/fileTabs.ts`
- **Findings-Backlog:** [OFFEN_STORES.md](./OFFEN_STORES.md)
- **Bereichs-spezifische Prüfpunkte:**
  - **Memory-Regel:** Selektoren referenz-stabil — keine Inline-`?? []`/`?? new Set()` (siehe `MEMORY.md` → `zustand-selector-stable-ref.md`).
  - Keine Store-Mutationen ohne `set(...)`-Aufruf?
  - Async-Aktionen behandeln Loading/Error-State?
  - Keine zirkulären Store-Dependencies (Store A liest aus Store B liest aus A)?

### Bereich 7 — Renderer-Panels (UI-Shell)

- **Dateien:** `src/renderer/App.tsx` · `src/renderer/main.tsx` · `src/renderer/panels/*.tsx` (TitleBar, LeftSidebar, TerminalTab, TabContainer, EditorPane, RightStack, RightPaneFilesPanel, HistoryPane, StatsPane, PlanPane)
- **Findings-Backlog:** [OFFEN_PANELS.md](./OFFEN_PANELS.md)
- **Bereichs-spezifische Prüfpunkte:**
  - **Memory-Regel:** `useEffect`s, die IPC-Side-Effects abfeuern (`pty:create`, `fs:write`, `git:commit`, `session:open`), sind durch `useRef`-Guard gegen StrictMode-Doppelausführung geschützt (`MEMORY.md` → `strictmode-side-effect-guard.md`).
  - Layout-Konstanten aus `styles/layout.ts` referenziert, keine Magic-Numbers im JSX?
  - Cleanup-Funktionen in jedem `useEffect` mit Subscriptions/Timeouts?
  - xterm.js + node-pty Resize-Handling robust gegen Display-Wechsel (Sprint 9 hat hier Findings)?
  - Keine UI-Drift gegen `docs/code-review/SPRINT9_UI_FINDINGS.md` (geprüft, aber Re-Check nach Sprint-9-Fixes)?

### Bereich 8 — Renderer-Modals und -Components

- **Dateien:** `src/renderer/modals/*.tsx` (NewSession, Templates, PreCommit, Settings, UsageDetail, HistoryAction) · `src/renderer/components/*.{ts,tsx}`
- **Findings-Backlog:** [OFFEN_MODALS.md](./OFFEN_MODALS.md)
- **Bereichs-spezifische Prüfpunkte:**
  - Esc + Backdrop-Click + ×-Button schließen das Modal (Architektur 6.0.1)?
  - Focus-Trap aktiv, Focus-Restore beim Schließen?
  - Settings-Form-Validierung deckt Typkonflikte und leere Pflichtfelder ab?
  - Sensitive-Files-Detection in `PreCommitModal` deckt `.env*`, `*secret*`, `*token*`, `*.pem`, `id_rsa` ab?
  - YAML-Validator im `MarkdownEditor` meldet Frontmatter-Fehler verständlich?

### Bereich 9 — Build- und Konfig-Layer

- **Dateien:** `package.json` · `forge.config.*` · `vite.config.*` · `tsconfig.json` · `tsconfig.node.json` · `.electron-fuses` (falls vorhanden)
- **Findings-Backlog:** [OFFEN_BUILD.md](./OFFEN_BUILD.md)
- **Bereichs-spezifische Prüfpunkte:**
  - **Pflicht-Tool:** `npm audit --audit-level=high`.
  - Electron-Fuses gesetzt (`runAsNode: false`, `enableCookieEncryption: true`, `enableNodeOptionsEnvironmentVariable: false`, `onlyLoadAppFromAsar: true`)?
  - `tsconfig.json` → `strict: true`, `noUncheckedIndexedAccess: true`?
  - `electron-winstaller` weiterhin auf 5.3.0 gepinnt (laut Commit `6821559`)?
  - Husky-Pre-Commit-Hook führt `typecheck` + `test` aus?

---

## 3. Workflow pro Bereich

Pro Bereich wird genau **ein** Review-Pass nach diesem Ablauf ausgeführt:

1. **Tooling-Vor-Pass** — globale Tools einmal vor dem ersten Bereichs-Review laufen lassen, Output speichern und über alle Bereiche wiederverwenden:
   - `npm run typecheck`
   - `npm run lint` (ESLint)
   - `npx fallow dead-code --format markdown` → in eine lokale Notiz pipen
   - `npx fallow dupes --format markdown` → analog
   - `npx fallow health --format markdown` → analog
   - `npm audit --audit-level=high`
   - Bereichs-spezifisch: `electronegativity` für Bereich 5, Semgrep `p/electron`/`p/react`/`p/typescript` ad hoc.

   Auto-Findings sind keine Review-Findings, sondern Hypothesen, die im Pass verifiziert werden.
2. **`OFFEN_<BEREICH>.md` lesen** — bekannte Befunde nicht erneut melden.
3. **Review-Prompt aus `TEMPLATE.md` Abschnitt „Template-Prompt"** → mit den Bereichs-Dateien und -Prüfpunkten füllen, als neue Session starten.
4. **Befund-Report prüfen** — neu vs. bereits dokumentiert, Kategorien Bug/Warnung/Verbesserung.
5. **Fixes erst auf Signal „fix it"** — kein Refactoring ohne Auftrag (CLAUDE.md Regel 2).
6. **Verbleibende offene Befunde** in `OFFEN_<BEREICH>.md` eintragen (Format aus `OFFEN_TEMPLATE.md`).

⚠️ Pro Pass max. 500–2000 Zeilen Code-Lese-Volumen. Bereich 3 (Main-Services) ist groß — ggf. in `MAIN_SERVICES_PTY`, `MAIN_SERVICES_JSONL`, `MAIN_SERVICES_GIT`, `MAIN_SERVICES_REST` splitten, sobald die Datei-Liste konkret im Prompt steht.

---

## 4. Status-Matrix

| # | Bereich | Tooling-Pass | Review-Pass | OFFEN-Datei | Notiz |
|---|---|---|---|---|---|
| 1 | Shared | ⛔ | ⛔ | ⛔ | — |
| 2 | DB | ⛔ | ⛔ | ⛔ | — |
| 3 | Main-Services | ⛔ | ⛔ | ⛔ | ggf. splitten |
| 4 | IPC-Handler | ⛔ | ⛔ | ⛔ | — |
| 5 | Preload | ⛔ | ⛔ | ⛔ | `electronegativity` Pflicht |
| 6 | Stores | ⛔ | ⛔ | ⛔ | Selector-Memory-Regel beachten |
| 7 | Panels | ⛔ | ⛔ | ⛔ | StrictMode-Guard-Memory-Regel |
| 8 | Modals + Components | ✅ | ✅ | ✅ | abgeschlossen 2026-05-11 |
| 9 | Build + Config | ⛔ | ⛔ | ⛔ | `npm audit` Pflicht |

Status-Symbole: ⛔ offen · 🟡 läuft · ✅ abgeschlossen

---

## 5. Was hier NICHT abgedeckt wird

- **UI-Vergleich gegen Design-Vorlage** — bereits in [SPRINT9_UI_FINDINGS.md](./SPRINT9_UI_FINDINGS.md) und [SPRINT9_LIVE_VERGLEICH.md](./SPRINT9_LIVE_VERGLEICH.md) erfasst.
- **Performance-Profiling** — Messungs-getrieben, kein Code-Lese-Pass (TEMPLATE.md Abschnitt „Was hier NICHT rein gehört").
- **Feature-Reviews** („Ist das Feature sinnvoll?") — gehört in Roadmap, nicht in den Code-Review.
- **Großformatige Security-Audits** — der hier eingebaute Security-Mini-Pass via `electronegativity` + `npm audit` reicht für ein privates Tool. Externe Pen-Tests sind erst bei breiter Verteilung relevant.
