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
