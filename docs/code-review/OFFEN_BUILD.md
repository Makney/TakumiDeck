# Code-Review — Bekannte offene Punkte (Build- und Konfig-Layer)

Befunde aus dem Bereichs-Review Build/Konfig (2026-05-12, Commit `5dc33d0` + Hotfix `ecdca93`), die bewusst nicht gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

Scope-Erinnerung: `package.json` · `forge.config.ts` · `vite.main.config.ts` · `vite.renderer.config.ts` · `vite.preload.config.ts` · `tsconfig.json` · `tsconfig.node.json` · `.fallowrc.json` · `eslint.config.mjs` · `.husky/pre-commit`.

Was im Review-Pass durchgegriffen wurde — und damit hier nicht mehr offen ist:

- Electron 33.2.0 → 41.5.1 (Hotfix-Re-Pin von versehentlichem `^42.0.1` auf `^41.5.1` im Folgecommit `ecdca93`).
- 18 High-CVEs aus dem npm-audit-Tail geschlossen (ASAR-Bypass, IPC-Spoofing, Use-after-free in Permission-Callbacks, HTTP-Response-Header-Injection u.a. — alle in `electron <= 39.8.4`).
- Vite 5.4.11 → 6.4.2 + Vitest 2.1.5 → 3.2.4 (esbuild-Dev-Server-CVE).
- Fuse `LoadBrowserProcessSpecificV8Snapshot: false` ergänzt (Single-Snapshot-Modus).
- `appBundleId: 'dev.takumideck.app'` gesetzt, `MakerZIP`-Plattform auf `['win32']` reduziert.
- `vite.renderer.config.ts` mit `base: './'`, `vite.main.config.ts` externalisiert `chokidar`, `simple-git`, `gray-matter`, `js-yaml`.
- Type-aware ESLint via `parserOptions.projectService: true` mit `no-floating-promises` (Error), `no-misused-promises` (Error), `await-thenable` (Error). Zwei echte Floating-Promises gefixt (`src/main/main.ts:113`, `src/renderer/components/DiffViewer.tsx:184`).
- `codemirror`-Umbrella-Dependency raus, `@electron-forge/shared-types` als explizite devDep ergänzt.

---

## Build-Toolchain-CVE-Tail in DevDeps (28 Vulnerabilities, 6 low / 22 high)

- `package.json` (devDependencies: `@electron-forge/cli`, `@electron-forge/maker-squirrel`, `@electron-forge/maker-zip`, `@electron-forge/plugin-auto-unpack-natives`, `@electron-forge/plugin-fuses`, `@electron-forge/plugin-vite`, `@electron/rebuild`) · Kategorie: **Design-by-Choice**
- **Beschreibung:** `npm audit --audit-level=high` meldet nach den Electron- und Vite-Bumps weiterhin 28 Vulnerabilities, **keine** in Production-Code-Pfaden. Drei Quellen: (1) `tar` ≤ 7.5.10 (6 CVEs, Pfad-Traversal/Race-Conditions) transitiv über `@electron-forge/core-utils`, `@electron-forge/core`, `@electron/node-gyp`, `cacache`; (2) `tmp` ≤ 0.2.3 (Symlink-Traversal via `@inquirer/prompts` → `external-editor` → `@inquirer/editor`); (3) `@tootallnate/once` + `make-fetch-happen`-Kette aus dem `@electron/node-gyp`-Untergrund. `npm audit fix` schlägt vor, auf `@electron-forge/cli@8.0.0-alpha.4` zu gehen — ein Pre-Release, der die Forge-Plugin-API anfasst.
- **Begründung:** Alle drei Quellen sind Upstream-Maintainer-Probleme in Build-Toolchain-Komponenten, die ausschließlich beim `electron-forge make/package`-Aufruf laufen (Build-Pipeline-Surface, nicht Runtime). Der `tar`-Pfad-Traversal greift nur beim Auspacken eines maliziösen Archivs — relevant wäre er, wenn Forge-Tooling ein präpariertes Archiv von einem nicht-vertrauten Mirror zieht. Solange npm-Registry und Electron-Distribution-URLs vertraut sind, ist die Eintrittswahrscheinlichkeit niedrig. Ein Bump auf `@electron-forge/cli@8.0.0-alpha.4` würde Pre-Release-Risiko gegen einen DevDep-CVE-Tail tauschen — kein guter Trade in einem Single-User-Tool. Bereits in [TECH_SCHULDEN.md](../TECH_SCHULDEN.md) als „Build-Toolchain-CVE-Tail ohne Upstream-Fix" dokumentiert.
- **Trigger:** sobald `electron-forge` stable (>= 7.6) seine `tar`-Dep aktualisiert, oder das Tool über das lokale Single-User-Setup hinaus deployed wird — dann den DevDep-Stack bumpen und re-auditieren.

---

## Electron-Bump auf 42 blockiert durch `better-sqlite3`-Quelltext-Inkompatibilität

- `package.json` (`electron: ^41.5.1`, `better-sqlite3: ^12.9.0`) · Kategorie: **Design-by-Choice**
- **Beschreibung:** Electron steht bei 41.5.1 statt der zum Review-Zeitpunkt aktuellen 42.0.1. Zwei gekoppelte Blocker: `better-sqlite3` 12.9.0 liefert keinen Prebuilt für Electron-ABI v146, UND die Quelle ist quelltext-inkompatibel mit V8 13.x (`v8::External::New/Value` Signatur-Bruch, `cppgc/heap.h` nutzt `__builtin_frame_address` als GCC/Clang-Intrinsic, MSVC kennt es nicht). Auch eine vollständige VS-2022-Build-Tools-Installation löst das nicht — der Compiler bricht mit C2660/C3861-Fehlern ab. Der erste Code-Review-Versuch hatte versehentlich `^42.0.1` in `package.json` gepinnt, während `package-lock.json` auf 41.5.1 blieb — `start-dev.bat` brach, weil `electron-forge start` die E42-Header zog und better-sqlite3 from-source bauen wollte. Hotfix `ecdca93` hat die Range wieder konsistent auf `^41.5.1` gezogen.
- **Begründung:** Variante A (Source-Build) ist nicht „nur eine Toolchain-Frage", sondern an einen API-Bruch in der Abhängigkeit gebunden. Variante C (Electron 33 belassen) trug die 18 High-CVEs. Variante B (41 mit Prebuilts) ist der Kompromiss — alle 18 CVEs sind in 41 gefixt. Bereits in [ENTSCHEIDUNGEN.md](../ENTSCHEIDUNGEN.md) („Electron auf 41 statt 42") und [TECH_SCHULDEN.md](../TECH_SCHULDEN.md) („Electron-Bump auf 42 blockiert durch `better-sqlite3`-Inkompatibilität") dokumentiert.
- **Trigger:** bei jedem `better-sqlite3`-Release prüfen, ob Electron-42-Prebuilts dabei sind (`npx prebuild-install -r electron -t 42.0.0` im `node_modules/better-sqlite3`-Modul). Wenn ja: `npm install electron@^42 && npm install better-sqlite3@<neue-Version> && npx @electron/rebuild -w better-sqlite3 -o better-sqlite3` als Smoke-Pass, **ohne** `-f`, damit der Prebuild-Download nicht übersprungen wird.

---

## `exactOptionalPropertyTypes: true` aufgeschoben

- `tsconfig.json` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Aus dem Review-Auftrag-Soll der Build-Konfig. Die Compiler-Option `exactOptionalPropertyTypes` steht auf `false`. Bei `true` werden `prop?: T` und `prop: T | undefined` strikt getrennt — präziser für die Optional-Property-Semantik im Renderer-/IPC-Layer.
- **Begründung:** Flippen auf `true` kaskadiert über alle Optional-Properties im Bestand — vermutlich dutzende Type-Fehler quer durch Renderer, Main und Schemas. Ein sauberer Migrations-Pass müsste alle betroffenen Stellen einzeln durchgehen, oft mit echten Semantik-Entscheidungen pro Stelle (ist das hier `?:` oder `| undefined`?). Geschätzt ~halber Tag bei dem aktuellen Codebase-Umfang. Bereits in [TECH_SCHULDEN.md](../TECH_SCHULDEN.md) als „`exactOptionalPropertyTypes: false`" dokumentiert.
- **Trigger:** eigene Story in Phase 1 oder 2, wenn der Type-Layer ohnehin angefasst wird (z.B. größerer Schema-Refactor).

---

## `electron-winstaller` als devDependency ohne Forge-Konsument

- `package.json:73` (`electron-winstaller: 5.3.0`, plus `overrides`-Block) · Kategorie: **Design-by-Choice**
- **Beschreibung:** Fallow-`dead-code` flaggt `electron-winstaller` als unused devDependency. Verifiziert: weder `forge.config.ts` (das auf `@electron-forge/maker-squirrel` setzt) noch andere Build-Skripte importieren das Paket direkt. Es bleibt nur über den `overrides`-Block in `package.json:84-86` (`"electron-winstaller": "5.3.0"`) explizit auf einer alten Major-Version festgenagelt — dort wirkt der Pin transitiv für jeden indirekten Konsument (typischerweise als verschachtelte Abhängigkeit von `@electron-forge/maker-squirrel`).
- **Begründung:** Der explizite Top-Level-Pin auf 5.3.0 wurde laut Commit `6821559` (Architektur-Doc: „`electron-winstaller` weiterhin auf 5.3.0 gepinnt") als Hotfix gegen einen Maker-Squirrel-Bruch in höheren Versionen gesetzt. Ohne den Top-Level-Eintrag verliert npm den Pin-Anker (Override allein reicht nicht in allen Resolver-Pfaden, bestimmte Konstellationen ignorieren `overrides` ohne korrespondierenden `dependencies`/`devDependencies`-Eintrag). Die Doppel-Notation (Top-Level + Override) ist redundant-aber-sicher; das Paket einfach zu löschen würde den Pin riskieren. Nicht klar genug als „echter Phase-2-Windows-Installer-Stub" einzuordnen, weil der MakerSquirrel-Pfad in `forge.config.ts` bereits aktiv ist — der Pin schützt diese aktive Verwendung.
- **Trigger:** wenn `@electron-forge/maker-squirrel` auf >= 8 gebumpt wird und der zugrunde liegende `electron-winstaller`-Bruch dort gefixt ist, lassen sich Top-Level-Eintrag und Override gemeinsam entfernen. Bis dahin stehen lassen — das nächste Mal mit Verweis auf diesen Eintrag dokumentiert, damit der Befund nicht erneut als „dead code" gemeldet wird.

---

## Husky-Pre-Commit ruft `typecheck` + `lint` aber kein `test`

- `.husky/pre-commit` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Architektur-Review-Soll der Build-Konfig nennt „Husky-Pre-Commit-Hook führt `typecheck` + `test` aus". Aktueller Stand: der Hook ruft `npm run typecheck` und `npm run lint -- --max-warnings=0`, aber nicht `npm run test`. CLAUDE.md Regel 6 fordert, dass Linting und Tests vor dem Commit grün sind — der manuelle Lauf ist Teil des Commit-Triggers, nicht des Hooks.
- **Begründung:** Vitest läuft beim Full-Suite-Pass aktuell ~12-18 s — das ist der Punkt, ab dem ein Pre-Commit-Hook Reibung beim häufigen Commit-Workflow erzeugt (mehrfach pro Stunde während aktiver Sprint-Arbeit). Typecheck (~3 s) und Lint (~2 s) sind akzeptabel, die Test-Suite wäre die teuerste Komponente. Tests werden stattdessen explizit vor dem Commit-Signal manuell ausgeführt — der Workflow ist „typecheck + lint im Hook, test vor dem Commit-Trigger durch den Assistenten" (CLAUDE.md Regel 6 ist kein Hook-Zwang, sondern eine Bedingung an den Commit-Zeitpunkt).
- **Trigger:** wenn die Test-Suite jemals deutlich schneller wird (z.B. nach Sharding auf Vitest-Worker-Threads), oder wenn die Anzahl an „test war rot beim Commit"-Vorfällen zunimmt — dann `npm run test` mit aufnehmen.

---

## Fallow-Findings verifiziert: bereits aufgelöst oder Design-by-Choice

Die in der Build-Bereichs-Sitzung mitgelaufenen Fallow-Hypothesen sind im Code bereits adressiert — sie tauchen hier nur dokumentarisch auf, damit der nächste Review-Durchgang das nicht erneut nachzieht:

- `codemirror` (Umbrella-Package) aus den `dependencies` entfernt — alle `@codemirror/*`-Sub-Pakete sind weiter direkt deklariert (Commit `5dc33d0`).
- `@electron-forge/shared-types` als explizite devDep ergänzt (war nur transitiv) — Type-Import in `forge.config.ts:1` jetzt sauber aufgelöst (Commit `5dc33d0`).
- `electron-winstaller` als unused devDep gemeldet — siehe Eintrag oben (gewollter Pin-Anker).

---

## Was sauber ist (nicht im Report, aber bemerkenswert)

- **Electron-Fuses durchgängig.** `RunAsNode: false`, `EnableCookieEncryption: true`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`, `LoadBrowserProcessSpecificV8Snapshot: false`. Volle Architektur-Soll-Liste plus Single-Snapshot-Modus.
- **`tsconfig.json` strikt.** `strict: true`, `noUncheckedIndexedAccess: true`. Nur `exactOptionalPropertyTypes` bleibt aufgeschoben (siehe oben).
- **Type-aware ESLint.** `parserOptions.projectService: true` mit `allowDefaultProject` für die fünf Top-Level-Build-Configs. Drei scharfe Regeln (`no-floating-promises`, `no-misused-promises`, `await-thenable`) auf Error — Pre-Commit-Lint mit `--max-warnings=0` würde neue Floating-Promises im Renderer/Main erwischen.
- **Vite-Main-Externalisierung.** `chokidar`, `simple-git`, `gray-matter`, `js-yaml`, `better-sqlite3`, `@lydell/node-pty`, `electron-log` werden zur Laufzeit aus `node_modules` geladen statt fragil gebündelt.
- **Vite-Renderer-Base relativ.** `base: './'` macht das Production-Bundle kompatibel mit dem Electron-`file://`-Protokoll auch bei Forge-Plugin-Default-Drift.
- **MakerZIP nur `win32`.** Kein darwin-/linux-ZIP-Artefakt mehr aus dem Make-Output, das ohnehin nicht testbar wäre (CLAUDE.md-Target ist Win11).
- **`appBundleId` gesetzt.** `dev.takumideck.app` — Architektur-1-Naming-Lücke geschlossen.
- **`.fallowrc.json` im Repo.** Fallow-Config persistiert, MCP-Integration kann die Codebase-Intelligence direkt abfragen ohne Zwischen-Export.

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (CI-Workflow `.github/workflows/release.yml` + `scripts/generate-latest-yml.mjs` + `electron-updater`/`@xterm/addon-webgl`-Erstaufnahme), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden. Der Pre-Build-Verify-Gate-Fail bei `package.json.version != tag` wurde durch den regulären v0.3.0-Phase-4-Bump aufgelöst.

### Asset-Pfad-Konstanten zwischen Workflow und Generator-Skript dupliziert

- `.github/workflows/release.yml:165-167` ↔ `scripts/generate-latest-yml.mjs:41,48` · Kategorie: **Verbesserung**
- **Beschreibung:** Beide Stellen kennen unabhängig den Pfad `out/make/squirrel.windows/x64/TakumiDeck-<version> Setup.exe`. Das Script hat einen defensiven Fallback (Z51-72) auf eine einzige `* Setup.exe`-Datei im Ordner; der Workflow-Upload-Step (Z168-172) failt hingegen hart, wenn der erwartete Name nicht stimmt. Keine Inkonsistenz im aktuellen Forge-Output (verifiziert durch Season-27-Live-Test), aber doppelt gepflegte Konstanten.
- **Begründung:** Aktuell akzeptabel, weil Forge den Naming-Default seit Season 27 nicht geändert hat. Vereinheitlichung wäre möglich (z.B. Script gibt Pfad als JSON auf stdout aus, Workflow konsumiert), aber separater Refactor-Schritt ohne sichtbaren Nutzen heute.
- **Trigger:** wenn Forge in Zukunft den Naming-Default ändert (z.B. nach `@electron-forge/maker-squirrel@8`-Bump) — dann Workflow und Script auf eine Source-of-Truth zusammenführen.

### Neue Runtime-Dependencies in v0.3.0 ohne Major-Bump-Risiko, aber Erst-Aufnahme

- `package.json:40,46` · Kategorie: **Verbesserung-Doku**
- **Beschreibung:** Zwei neue Runtime-Deps seit v0.2.1: `@xterm/addon-webgl@^0.19.0` (Terminal-Polish Season 28, WebGL-Renderer mit Canvas-Fallback) und `electron-updater@^6.8.3` (Auto-Update Season 25/26). Beide sind Erst-Aufnahmen, kein Major-Bump-Risiko in dieser Version. In den Release-Notes `docs/release/v0.3.0.md` als neue Runtime-Deps benannt; hier als Anker, falls bei einer späteren Audit-Welle die Frage „wann kamen diese Deps?" auftaucht.
- **Begründung:** Reine Doku-Notiz für künftige Review-Pässe — keine Aktion erforderlich.
- **Trigger:** bei einem Major-Bump beider Deps (z.B. `electron-updater@7.x`) — dann diese Notiz als Anker für die Bump-Bewertung nutzen.

---

## Release-Review v0.4.0 (2026-05-29)

Befunde aus dem Release-Lauf v0.3.2 → v0.4.0. Während des Tag-Push-Releases sind zwei **Umgebungs-Regressionen auf dem GitHub-Runner** aufgetreten (CI-Pipeline `.github/workflows/release.yml`), die mit dem letzten erfolgreichen Release (v0.3.2, 2026-05-20) noch nicht bestanden. Auslöser-Verdacht durchgängig: neuer Runner-Stand (npm 11.13.0, `windows-latest` → `windows-2025-vs2026`-Transition laut Runner-Annotation), nicht TakumiDeck-Code/-Config. v0.4.0 wurde über den manuellen Fallback (VERSIONIERUNG.md Schritt 10: lokaler `npm run make` + `generate-latest-yml.mjs` + `gh release create`/`upload`) veröffentlicht — lokal lösen beide Maker korrekt auf.

### CI-Release-Build: electron-forge resolved 0 Maker auf dem Runner (Forge 7.5 + npm 11.13.0)

- `.github/workflows/release.yml` (Step „Build Windows installer + portable zip" → `npm run make`) ↔ `forge.config.ts:107-115` (Maker-Definition) · Kategorie: **Bug / Regression (CI-Build, release-blockierend für den Auto-Release-Pfad)**
- **Beschreibung:** Im v0.4.0-CI-Run (`26624542066`) lief `npm run make` mit Exit 0, gab aber `Making for the following targets: , ` aus — electron-forge löste **null Maker** auf, obwohl `forge.config.ts` `MakerSquirrel` + `MakerZIP({}, ['win32'])` definiert. Folge: kein Setup.exe/ZIP im erwarteten `out/make/squirrel.windows/x64`, daher scheitern der Folge-Step `generate-latest-yml.mjs` („Squirrel-Output-Ordner fehlt") und der Asset-Upload. **Lokal** (identischer Commit `b954635`) lief `npm run make` korrekt und produzierte beide Distributables — also kein Code-/Config-Defekt. Verwandtes Symptom desselben Runner-Drifts: Electrons npm-ci-Postinstall schrieb `node_modules/electron/path.txt` nicht mehr, wodurch `require('electron')` (transitiv über `electron-log`) drei Test-Suites beim Laden zerlegte; das ist **bereits gefixt** (vitest `test.env.ELECTRON_OVERRIDE_DIST_PATH`, Commit `b954635`) und gehört nicht mehr zu den offenen Punkten.
- **Begründung / Lösungsvarianten** (Working-Rule 2, Klartext — Entscheidung steht noch aus):
  - **Variante A — Runner-Image fixieren.** Im Workflow auf das zuletzt funktionierende Windows-Image festlegen statt „neuestes". Kleinster Eingriff, schnell gegen die CI verifizierbar, holt sofort einen grünen Release-Build zurück. Nachteil: nur eine Atempause — das fixierte Image wird irgendwann abgekündigt, das Grundproblem bleibt.
  - **Variante B — Build-Toolchain anheben.** Die electron-forge-Pakete von der aktuellen 7.5-Linie auf den neuesten stabilen Stand heben, der die Maker-Auflösung unter dem neuen npm unterstützt. Behebt die Ursache statt sie zu umgehen. Nachteil: ein Forge-Bump kann Folgebrüche auslösen (insb. die Kopplung MakerSquirrel ↔ `electron-winstaller`-Pin, siehe Eintrag oben), und verifizierbar ist das nur gegen die CI — also potenziell mehrere Iterationsrunden.
  - **Variante C — Paketmanager-Version im Workflow festnageln.** Vor der Installation gezielt die npm-Version festlegen, falls genau der neue npm-Stand die Maker-Auflösung bricht. Punktueller Eingriff an der vermuteten Ursache. Nachteil: die Ursache (npm vs. Image vs. Forge) ist nicht isoliert bestätigt, der Verdacht könnte danebenliegen, und der Pin muss gepflegt werden.
  - **Empfehlung:** zuerst **A** als Sofort-Stabilisierung (der nächste Release läuft wieder über die CI), dann **B** als nachhaltige Lösung, sobald Zeit für eine CI-Iterationsrunde da ist. **C** nur, falls A+B die Ursache nicht treffen und die Diagnose npm-spezifisch eingegrenzt wird.
- **Trigger:** **vor** dem nächsten Release-Tag-Push (v0.4.1/v0.5.0) — sonst scheitert die CI erneut und der manuelle Fallback ist jedes Mal nötig. Mindestens Variante A einbauen und mit einem Wegwerf-Tag oder `workflow_dispatch` gegen die CI verifizieren, bevor der echte Release-Tag gesetzt wird.

### Auto-Update-Asset-Name: Leerzeichen vs. Punkt zwischen `latest.yml` und GitHub-Asset

- `scripts/generate-latest-yml.mjs` (Feld `path` = `TakumiDeck-<version> Setup.exe`) ↔ GitHub-Release-Asset (`TakumiDeck-<version>.Setup.exe`) · Kategorie: **Verbesserung-Doku (vorbestehend, nicht neu in v0.4.0)**
- **Beschreibung:** GitHub ersetzt beim Asset-Upload das Leerzeichen im Setup-Dateinamen durch einen Punkt (`TakumiDeck-0.4.0 Setup.exe` → `TakumiDeck-0.4.0.Setup.exe`), während `latest.yml` den Namen mit Leerzeichen führt. Das ist identisch zum CI-Pfad (gleicher Maker-Output) und unabhängig vom manuellen Fallback. Ob `electron-updater` den Namen beim Download korrekt auflöst, ist nicht verifiziert — deckt sich mit der bereits in `docs/release/v0.3.2.md` notierten „Auto-Update nur manuell via Setup.exe"-Einschränkung.
- **Begründung:** Reine Beobachtung/Doku-Anker, kein Eingriff in diesem Release. Eine saubere Lösung wäre, den Maker-Setup-Namen ohne Leerzeichen zu erzeugen (z.B. mit Bindestrich), damit `latest.yml`-`path` und GitHub-Asset-Name deckungsgleich sind.
- **Trigger:** wenn Auto-Update von einer früheren Version auf eine neue real getestet wird und stumm „keine neue Version" meldet — dann den Setup-Dateinamen leerzeichenfrei machen und `generate-latest-yml.mjs` entsprechend anpassen.
