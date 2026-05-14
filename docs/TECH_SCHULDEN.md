# Technische Schulden

Dieses Dokument hält **bewusst aufgeschobene oder vereinfachte Lösungen** fest — Code, der funktioniert, aber wissentlich nicht optimal ist. Ziel: nichts geht verloren, nichts wird fälschlich als „vergessen" eingestuft.

## Unterschied zu anderen Dokumenten

- **ENTSCHEIDUNGEN.md** hält *Architekturentscheidungen* (Design-Tradeoffs, Variantenvergleiche).
- **FEATURES.md** hält geplante *neue Features* (⛔/🟡/✅).
- **Dieses Dokument** hält *vorhandenen Code*, der bewusst vereinfacht wurde und irgendwann überarbeitet werden sollte.

## Wann kommt ein Eintrag hier rein?

- Temporäre Lösung, die länger als eine Season bleiben wird.
- Bewusster Hack mit bekanntem Risiko.
- Fehlende Absicherung, die erst später nachgerüstet wird.
- Performance-Problem, das im aktuellen Scope toleriert wird.

**Nicht** hier rein: Feature-Wünsche (→ FEATURES.md), Design-Entscheidungen (→ ENTSCHEIDUNGEN.md), offene Bugs (→ CODE_REVIEW_OFFEN).

## Format pro Eintrag

- `##`-Überschrift mit kurzem, beschreibendem Titel.
- **Bereich:** Modul / Datei / Schicht.
- **Was:** kurze Beschreibung des aktuellen, problematischen Zustands.
- **Warum so:** Begründung für das Aufschieben (Zeitdruck, Scope, Komplexität).
- **Risiko:** was kann schiefgehen, wenn das ignoriert wird?
- **Auflösung:** skizzierter Weg, wie das irgendwann behoben wird.

Erledigte Einträge werden **nicht gelöscht**, sondern mit ✅ und Datum versehen.

---

## Renderer-FileTabs des entfernten Projekts werden nicht aufgeräumt (Phase-2 Season 8)

**Bereich:** `src/renderer/stores/fileTabs.ts`, `src/renderer/panels/LeftSidebar.tsx` (`handleConfirmRemove`)

**Was:** Beim Entfernen eines Projekts via `project:remove` werden die offenen Session-Tabs des Projekts vor dem Server-Call sauber geschlossen (`handleCloseTab` killt den PTY, Lifecycle wandert auf `completed`). Die per-Projekt-Datei-Tabs aus `useFileTabsStore` (Markdown-Editor + Diff-Tab) bleiben aber im Store-State hängen. Da das Projekt nicht mehr aktivierbar ist, sieht der User die Stub-Tabs auch nicht — sie werden beim App-Restart implizit verworfen (FileTab-Store ist nicht persistent). Keine UI-Sichtbarkeit, kein Crash.

**Warum so:** Der Cleanup-Pfad hätte einen neuen Store-Aktion (`closeAllForProject(projectId)`) gebraucht, plus eine Entscheidung, ob „Dirty"-Tabs (ungesicherte Editor-Änderungen) verworfen oder vorher gesichert werden. Im realistischen Use-Case (User entfernt das Projekt explizit) ist „verwerfen" die richtige Antwort, aber der Edge-Case „User hat dirty Editor-Tab, klickt versehentlich Trash" hätte eine zusätzliche Warnung im RemoveProjectModal verlangt. Season-Scope war bewusst eng — Tabs-Cleanup ist Edge-Case, nicht Spec-Anforderung.

**Risiko:** Kein User-sichtbarer Effekt, weil die Tabs am unaktivierbaren Projekt hängen. Beim App-Restart sind sie ohnehin weg. Einziger theoretischer Pfad: wenn der User in derselben Session ein gleichnamiges neues Projekt mit identischer `relPath`-Konvention anlegt, könnten die alten Tabs versehentlich wieder auftauchen — sehr unwahrscheinlich, da neue Projekte eine neue UUID bekommen.

**Auflösung:** In `useFileTabsStore` eine `closeAllForProject(projectId: string)`-Aktion ergänzen; im `handleConfirmRemove` der LeftSidebar nach erfolgreichem `removeProject` aufrufen. Falls dirty Tabs vorhanden sind, im RemoveProjectModal eine zusätzliche Warn-Zeile rendern (analog zur `openTabCount`-Warnung). ~20 LOC + ein Renderer-Test, lohnt sich erst, wenn der Edge-Case im Daily-Use auffällt.

---

## Squirrel-Installer ohne setupIcon und Branding

**Bereich:** `forge.config.ts` (`MakerSquirrel`-Konfiguration), Repo-Wurzel (`.ico` fehlt)

**Was:** Der Squirrel-Installer (`TakumiDeck-0.1.0 Setup.exe`) zeigt das Electron-Default-Icon, weil weder `setupIcon` noch `iconUrl` in der MakerSquirrel-Konfig gesetzt sind und das Repo keine `.ico`-Datei trägt. Authors/Description werden aus `package.json` gefallback'ed, sind also funktional korrekt — aber kein eigenes Branding. Setup-Dateiname läuft auf den Default-Generator (`TakumiDeck-0.1.0 Setup.exe`).

**Warum so:** Der Phase-2-Zwischenstand-Pack-Fokus war ASAR-Größe und Bugfixes vor dem Produktiv-Schwenk, nicht Cosmetics. Ein `.ico` müsste designt werden (oder ein einfaches Mono-Icon aus dem 匠-Brand-Glyph generiert), die Toolchain (`png2ico` / Online-Konverter) ist bekannt aber nicht hier. Im privaten Use-Case ist Default-Icon akzeptabel, weil der Installer einmalig läuft und danach nur die Exe selbst sichtbar bleibt.

**Risiko:** Bei Verteilung an Freunde wirkt der Installer „nicht professionell" und triggert eventuell stärkere SmartScreen-Skepsis. Keine Funktions-Auswirkung.

**Auflösung:** `.ico` (mindestens 256×256, idealerweise 16/32/48/64/128/256 in einer Datei) im Repo unter `build/icon.ico` ablegen, `setupIcon: 'build/icon.ico'` in `MakerSquirrel` setzen. Optional gleich `setupExe: 'TakumiDeckSetup.exe'` für saubereren Dateinamen und `loadingGif` für visuellen Mehrwert während der Squirrel-Install-Phase. Erst sinnvoll, wenn der erste echte Release-Tag gemacht wird.

---

## Screenshot-Verzeichnis ohne Retention

**Bereich:** `src/main/fs/screenshotSave.ts`, `<userData>/screenshots/`

**Was:** Drag-and-Drop-Bilder und Clipboard-Pastes (Phase-2 Season 2) werden in `<userData>/screenshots/screenshot-<UTC-Zeitstempel>.<ext>` geschrieben. Es gibt keine Aufräum-Logik — jeder Drop legt eine Datei an, gelöscht wird nichts. Bei produktivem Daily-Use (mehrere Screenshots pro Tag, 4K-PNGs zwischen 6 und 10 MiB) wächst der Ordner unbegrenzt; nach drei Monaten Daily-Use sind mehrere GiB realistisch.

**Warum so:** Phase-2 Season 2 hat die Funktion eingeführt, das Cleanup-Verhalten war im Scope explizit ausgelagert („wir wollen erst sehen, wie viele Screenshots im echten Use entstehen"). Eine sofortige Retention-Strategie ohne Live-Daten würde willkürliche Schwellen festlegen (30 Tage? 100 Files? 500 MiB?), die später ohnehin angepasst werden müssten.

**Risiko:** Disk-Verbrauch wächst unauffällig. User merkt es erst bei niedrigem Disk-Space oder bei manueller Inspektion. Keine Funktions-Beeinträchtigung, kein Daten-Verlust — nur Müll, der sich ansammelt.

**Auflösung:** Beim App-Start einmal über `<userData>/screenshots/` walken: alle Files älter als N Tage löschen, plus Cap auf Gesamt-MiB (älteste Files zuerst). N und MiB als hartcodierter Default (z.B. 30 Tage / 500 MiB), später optional in Settings. Implementierung ~30 LOC in `paths.ts`/`main.ts`, sollte beim ersten Hinweis aus dem Daily-Use angegangen werden.

---

## `SessionPatch.ended_at` driftet zwischen TS-Type und zod-Schema

**Bereich:** `src/shared/types.ts` (`SessionUpdateInput.patch`) ↔ `src/shared/schemas.ts` (`SessionUpdatePatchSchema`)

**Was:** Der TS-Type erlaubt `ended_at?: number | null` im Patch-Objekt, das zod-Schema strippt das Feld aber bewusst raus (kein `ended_at`-Property in `SessionUpdatePatchSchema`). Der Renderer kann ein Patch-Objekt mit `ended_at` typisch korrekt zusammenstellen, an der IPC-Grenze wird das Feld dann stillschweigend verworfen.

**Warum so:** Beim Refactor des Session-Lifecycles wurde `ended_at` aus dem schreibbaren Patch entfernt, weil es ausschließlich von der Lifecycle-Maschine im Main gesetzt werden soll. Der TS-Type wurde nicht synchron mit nachgezogen.

**Risiko:** Niemand schreibt aktuell `ended_at` über `SessionUpdate`-IPCs (Renderer hat keinen Use-Case), aber wenn jemand das später probiert, fällt der Wert ohne Warnung weg — Symptom wäre „ended_at bleibt unverändert obwohl ich es im Patch gesetzt habe".

**Auflösung:** `ended_at` aus dem `patch`-Sub-Type in `SessionUpdateInput` entfernen oder mit `Omit<…, 'ended_at'>` annotieren, mit einem Kommentar warum (= Lifecycle-Owned). Kleine Änderung, ~3 LOC, kein Test-Pfad-Update nötig.

---

## `useUsageStore.refreshContext` schießt vor dem deferierten Spawn-IPC los

**Bereich:** `src/renderer/panels/TabContainer.tsx` (`ContextSlot`-`useEffect`), `src/renderer/stores/usage.ts`

**Was:** Beim Mount eines frisch erzeugten Tabs feuert der `ContextSlot` in der Action-Bar sofort einen `usage:context`-IPC gegen die DB, um den initialen Token-Verbrauch der neuen Session zu laden. `pty:create` läuft aber in einem deferierten `requestAnimationFrame` (Sprint-9-Race-Fix für korrekte `cols`/`rows`), das erst im nächsten Animation-Frame feuert — die DB-Session existiert in diesem Moment noch nicht. Der IPC-Handler antwortet mit „Session nicht gefunden", der Renderer-Store loggt eine `console.warn`, die UI fällt auf den Empty-State-`ctx`-Slot zurück. Beim nächsten `usage:update`-Event nach echtem Token-Verbrauch holt sich der Slot die korrekten Werte. Sichtbarer Nebeneffekt: zwei `console.warn`-Zeilen pro Tab-Anlegen im Dev-Build (eine pro StrictMode-Mount-Iteration), eine im Production-Build.

**Warum so:** Die Warning ist harmlos — kein UI-Defekt, kein State-Schaden, kein Daten-Verlust. Die naheliegende Lösung wäre ein Delay/Retry im `refreshContext`-Pfad, ein „warte bis Session existiert"-Signal über den Tab-Store oder ein Suppress-on-first-mount-Flag. Jede dieser Optionen koppelt aber den Token-Store an das Spawn-Lifecycle des Tabs, was bisher sauber entkoppelt war. Im Trade-off „zwei harmlose Console-Lines vs. neue Kopplung" hat die saubere Trennung gewonnen — in Season 5 explizit als „irgendwann mal angehen" eingestuft.

**Risiko:** Console-Lines pro Tab-Open lenken bei Diagnose anderer Probleme als Rauschen ab. Strukturell ist die Race latent für alle weiteren IPCs, die unmittelbar auf eine Session-ID losgehen, bevor das deferierte `pty:create` durch ist — aktuell ist es nur `refreshContext`, aber jeder neue Session-Initial-Fetch in einem `useEffect` würde denselben Pfad treffen.

**Auflösung:** Drei sinnvolle Pfade, alle ~halber Tag:

- **Defer im `ContextSlot`:** Auf eine `td-session-created`-CustomEvent warten, die der `TerminalTab` nach erfolgreichem `pty:create` feuert; vorher kein IPC-Call. Saubere Entkopplung, keine Store-Änderung.
- **Suppress im Renderer-Store:** `refreshContext` schluckt `SESSION_NOT_FOUND` als Soft-Fehler still, keine `console.warn`. Minimaler Eingriff, aber versteckt das Symptom ohne die Race aufzulösen — wenn später ein anderer Code-Pfad denselben Error legitimerweise auslöst, sieht man ihn nicht mehr.
- **Suppress im Main:** Bei nicht existenter Session ein `ok({tokens: 0, limit: 0, percent: 0})`-Pseudo-Result statt eines Errors zurückgeben — der UI-Empty-State wäre derselbe. Vermischt allerdings „Session existiert nicht" mit „Session hat 0 Tokens" semantisch.

Empfehlung wenn der Schmerz real wird: Defer-im-Slot-Variante, weil sie genau die Race auflöst und keinen Pfad versteckt.

---

## Top-N für Schulden/Entscheidungen-Auto-Variablen hartcodiert

**Bereich:** `src/main/ipc/templates.ts` (`SCHULDEN_TOP_N`, `ENTSCHEIDUNGEN_TOP_N`)

**Was:** Die Anzahl der ins Template eingefügten Einträge ist auf 3 fest verdrahtet. Der User kann das aktuell nicht aus der UI oder `settings.json` ändern. Wer mehr oder weniger Kontext im Prompt haben möchte, müsste den Wert im Code editieren und neu builden.

**Warum so:** In Phase 2 Season 4 war noch unklar, ob 3 für den Daily-Use die richtige Zahl ist — es gab keine Live-Erfahrung. Eine Settings-Anbindung hätte den Schema-Migrationspfad in `AppSettings` plus UI-Slot im Settings-Dialog plus zod-Default-Handling für bestehende User bedeutet. Erst Schmerz, dann Konfigurierbarkeit.

**Risiko:** Kein Funktionsbruch, nur UX-Steifigkeit. Falls der Top-3-Wert sich empirisch als falsch herausstellt, wird die Variable entweder zu spärlich oder zu voluminös — beides ist kein App-Crash, sondern Prompt-Qualität.

**Auflösung:** Wenn der Schmerz real wird: zwei `number`-Felder in `AppSettings` (`template_schulden_top_n`, `template_entscheidungen_top_n`) mit Default 3, zod-Validation `min(0).max(20)`, ein neues Slot im Settings-Tab „Workspace" oder einem neuen „Templates"-Tab. Etwa ein halber Tag.

---

## `exactOptionalPropertyTypes: false` (Code-Review Build/Konfig)

**Bereich:** `tsconfig.json`

**Was:** Die Compiler-Option `exactOptionalPropertyTypes` steht auf `false`. Die Build-Konfig-Review hatte den Soll-Wert `true` benannt (strenge Trennung zwischen `prop?: T` und `prop: T | undefined`), die Umstellung aber bewusst aufgeschoben.

**Warum so:** Das Flippen auf `true` kaskadiert über alle optional-Properties im Bestand — vermutlich dutzende Type-Fehler quer durch Renderer, Main und Schemas. Ein sauberer Migrations-Pass müsste alle betroffenen Stellen einzeln durchgehen, oft mit echten Semantik-Entscheidungen pro Stelle (ist das hier `?:` oder `| undefined`?).

**Risiko:** Schwammige Optional-Property-Typen — `setProp(undefined)` und „Property nicht gesetzt" sind nicht klar getrennt. In der Praxis bisher kein konkreter Bug, aber strukturell weniger Typ-Sicherheit als möglich.

**Auflösung:** Eigene Story in Phase 1 oder 2: Flag flippen, durch die entstehenden Type-Fehler durchgehen, pro Stelle entscheiden ob `?:` oder `| undefined`. Vermutlich ~halber Tag bei dem aktuellen Codebase-Umfang.

---

## Electron-Bump auf 42 blockiert durch `better-sqlite3`-Inkompatibilität (Code-Review Build/Konfig)

**Bereich:** `package.json` (`electron`, `better-sqlite3`), Native-Rebuild-Pfad

**Was:** Electron steht auf 41.5.1 statt der zum Review-Zeitpunkt aktuellen 42.0.1. Zwei gekoppelte Blocker: `better-sqlite3` 12.9.0 liefert keinen Prebuilt für Electron-ABI v146 (GitHub-Release liefert 404 für `better-sqlite3-v12.9.0-electron-v146-win32-x64.tar.gz`), UND die Quelle ist quelltext-inkompatibel mit V8 13.x (Electron 42): `v8::External::New/Value` Signatur-Bruch, `cppgc/heap.h` nutzt `__builtin_frame_address` (GCC/Clang-Intrinsic, MSVC kennt es nicht). Auch eine vollständige VS-2022-Build-Tools-Installation löst das nicht — der Compiler bricht in `addon.cpp`, `database.cpp`, `statement.cpp` u.a. mit C2660/C3861-Fehlern ab.

**Warum so:** Siehe [ENTSCHEIDUNGEN.md „Electron auf 41 statt 42"](./ENTSCHEIDUNGEN.md). Variante A (Source-Build) ist nicht „nur eine Toolchain-Frage", sondern an einen API-Bruch in der Abhängigkeit gebunden — bis `better-sqlite3` ein Release mit V8-13-Support liefert, ist E42 hier nicht möglich. Variante C (Electron 33 belassen) trug 18 High-CVEs. Variante B (41 mit Prebuilts) ist der Kompromiss.

**Risiko:** Falls zwischen Electron 41 und 42 weitere CVEs in den Chromium-/Node-Komponenten auftauchen, wachsen sie an. Ohne CI-Pipeline für Native-Module bleibt der Bump-Pfad an die `better-sqlite3`-Release-Velocity gekoppelt. Zusätzlich: solange das gekoppelt ist, muss bei jedem Electron-Bump in `package.json` proaktiv geprüft werden, ob die Range mit Lockfile und `better-sqlite3`-Prebuilts konsistent ist — der erste Code-Review-Versuch ist genau an dieser Inkonsistenz gescheitert (`^42.0.1` in `package.json`, 41.5.1 im Lockfile, App startete nicht).

**Auflösung:** Bei jedem `better-sqlite3`-Release prüfen, ob Electron-42-Prebuilts dabei sind:

```bash
cd node_modules/better-sqlite3 && npx prebuild-install -r electron -t 42.0.0
```

Wenn ein Prebuilt geladen wird: `npm install electron@^42 && npm install better-sqlite3@<neue-Version> && npx @electron/rebuild -w better-sqlite3 -o better-sqlite3 && npm run package` als Smoke-Pass — **ohne** `-f`, damit `@electron/rebuild` den Prebuild-Download nicht überspringt. Alternativer Pfad: Migration auf eine SQLite-Library ohne C-Extensions (`@vlcn.io/crsqlite-wasm` o.ä.) — größerer Eingriff, würde aber das gesamte Build-Toolchain-Bottleneck wegnehmen.

---

## Build-Toolchain-CVE-Tail ohne Upstream-Fix (Code-Review Build/Konfig)

**Bereich:** `node_modules/` transitive Deps via `@electron-forge/*`, `@inquirer/prompts`, `better-sqlite3`-Tarball

**Was:** `npm audit` meldet nach den Electron- und Vite-Bumps weiterhin 28 Vulnerabilities (6 low, 22 high), **keine** in Production-Code-Pfaden. Drei Quellen:

1. **`tar` ≤ 7.5.10** (6 CVEs, Pfad-Traversal/Race-Conditions) — transitiv über `@electron-forge/core-utils`, `@electron-forge/core`, `@electron/node-gyp`, `cacache`. Upstream `electron-forge` pinnt eine alte `tar`-Version.
2. **`tmp` ≤ 0.2.3** (Symlink-Traversal) — transitiv über `@inquirer/prompts` → `external-editor`. Upstream-Fix ausstehend.
3. **`better-sqlite3`-Tarball-Ballast.** Der 12.9.0-Tarball schiebt nested `node_modules` mit `mocha`, `sqlite3`, `nw-gyp`, `cmake-js`, `prebuild`, `serialize-javascript` mit (sieht aus wie eingecheckte devDeps oder ein Publish-Versehen des Maintainers). Diese Pakete landen physisch im `node_modules`-Tree und werden vom Audit gescannt, obwohl sie nicht im Application-Bundle landen.

**Warum so:** Keine eigene Wahl — alle drei sind Upstream-Maintainer-Probleme. Workarounds (eigener `electron-forge`-Fork, eigener `better-sqlite3`-Fork) wären deutlich teurer als der akzeptierte CVE-Tail.

**Risiko:** Die `tar`-CVEs greifen nur beim Auspacken eines maliziösen Archivs — Build-Pipeline-Surface, nicht Runtime. Praktisch tritt das nur ein, wenn Forge-Tooling ein präpariertes Archiv von einem nicht-vertrauten Mirror zieht. Solange `npm`-Registry und Electron-Distribution-URLs vertraut sind, niedrige Eintrittswahrscheinlichkeit.

**Auflösung:** Periodisch `npm audit` re-laufen. Sobald `electron-forge` seine `tar`-Dep aktualisiert (Issue-Tracker beobachten) oder `better-sqlite3` einen sauberen Tarball ohne Build-Cruft publiziert, fallen die meisten Findings ohne eigene Arbeit weg. Falls der Tail länger als zwei Phasen bleibt: ggf. Migration auf eine alternative SQLite-Library prüfen (siehe Eintrag „Electron-Bump auf 42 blockiert").

---

## Reset-Berechnung im usage:window-Aggregat fehlt (Sprint 9 UI-Slot)

**Bereich:** `src/main/usage/window.ts` (oder analog `usage:bucket`-Aggregat)

**Was:** `LimitBar.reset_schedule?: { day_of_week, hour, minute }` ist als Schema-Feld da, der UI-Slot zeigt es im Tooltip („Reset: Montag 00:00 (Phase-2-Backend)"), aber die echte Token-Aggregation rechnet weiter mit dem rolling `window_hours`-Fenster. Setzt der User `reset_schedule` auf Montag 00:00 und ist es Donnerstag, sollte die Bar nur den Verbrauch seit Montag zeigen — sie zeigt aber weiter die letzten 168 h rolling.

**Warum so:** Sprint-9-Scope war UI-Vergleich; die Backend-Änderung am Aggregations-Pfad ist nicht trivial (window-Berechnung muss vom letzten Reset-Zeitpunkt rückwärts rechnen, P90-Schätzung muss vergleichbar bleiben). Plus: ohne reale User-Daten zur Reset-Cadence ist die Aggregations-Änderung Spekulation.

**Risiko:** Wenn User `reset_schedule` setzt, weil er es im UI sieht, und dann erwartet dass die Bar entsprechend neu berechnet — Verwirrung. Tooltip mit `(Phase-2-Backend)`-Suffix mitigiert das, aber nicht 100 %.

**Auflösung:** Phase-2-Sprint: `usage:window`-Aggregat-Logik so erweitern, dass bei gesetztem `reset_schedule` der Window-Start vom letzten Reset-Zeitpunkt berechnet wird statt rolling-N-Stunden. P90-Schätzung kann weiter rolling bleiben (Limit-Quelle bleibt stabil), nur der Verbrauchs-Counter ändert sich. ~1 Tag Backend + Tests.

---

## Container-Query als Schutznetz, eigentlicher Wrap-Mechanismus ist `min-width`-Trick (Sprint 9)

**Bereich:** `src/renderer/styles/app.css` (`.td-tab-container`, `.td-term-bar`)

**Was:** `@container term-col (max-width: 620px)` ist im CSS definiert, hat aber im Live-Test nicht zuverlässig durchgeschlagen. Das tatsächliche Action-Bar-Wrapping läuft über `flex: 1 1 240px; min-width: 240px` auf der `.td-ctx`-Sektion — wenn der Slot nicht in seine Min-Width passt, triggert `flex-wrap: wrap` automatisch. Container-Query bleibt im Code, weil's billig ist und bei sehr schmalen Containern als zweite Schicht greift.

**Warum so:** Schnelle Lösung statt tiefere Diagnose, warum `@container` in Electron-Chromium nicht stabil greift. Möglicherweise ein Layout-Timing-Problem (`container-type: inline-size` + `flex: 1`-Container interagieren nicht 100 % vorhersehbar) oder eine spezielle Electron-Konfig-Eigenheit.

**Risiko:** Bei zukünftigen Action-Bar-Erweiterungen (mehr Pillen) könnte das `min-width: 240px` zu eng sein, und das Wrap-Verhalten unintuitiv werden. Wer den Code liest, sieht zwei Wrap-Mechanismen (Container-Query + min-width-Trick) und muss beide verstehen.

**Auflösung:** Bei der nächsten Action-Bar-Refactor (z.B. wenn die ctx-Bar wirklich konfigurierbare Inhalte bekommt) entweder Container-Query in DevTools sauber durchdebuggen oder den Container-Query-Block ersatzlos entfernen und nur den `min-width`-Trick behalten. Aktuell beide drin = redundant aber sicher.

---

## Settings-Migration für Default-Drifts fehlt (Sprint 9)

**Bereich:** `src/main/settings/store.ts` (Settings-Load)

**Was:** Sprint 9 hat die `limit_bars`-Default-Liste geändert (Claude-Design-Bar entfernt, Sonnet-Label umbenannt). Bestehende `settings.json`-Files werden nicht migriert — User mit Bestand sehen weiter die alte 4-Bar-Liste mit „Nur Sonnet" statt „Wöchentlich · Nur Sonnet". Sprint 8 hatte schon das gleiche Pattern (Modell-Limit-Defaults 1 M → 200 k). Sprint 9 macht es zum dritten Mal sichtbar.

**Warum so:** Migration-Pass beim Settings-Load braucht Schema-Versionierung + Migration-Pipeline (analog zu SQLite-Migrations). Im MVP nicht gebaut, weil Bestands-User-Liste klein ist und manuelle Settings-Korrektur via JSON-Editor zumutbar bleibt.

**Risiko:** Wachsende Bestands-User-Liste mit divergierenden Settings — User mit Sprint-7-Settings sehen Sprint-9-UI nicht so wie geplant. Bei jedem Default-Drift wächst der Erklärungsbedarf in der CHANGELOG.

**Auflösung:** Phase-2-Slot: `SettingsSchema` bekommt einen `version`-Feld (default 1). Settings-Load liest die Version und führt versionierte Migrations durch (analog SQLite `0002_jsonl_offsets.sql`-Pattern, aber als TypeScript-Funktionen). Pro Migration: alte Defaults erkennen, auf neue Werte mappen, Version inkrementieren. Erste Migration könnte die `weekly_design`-Bar entfernen (wenn vorhanden) und das `weekly_sonnet`-Label updaten.

---

## ✅ Datei-Tabs gehen beim App-Restart verloren — aufgelöst 2026-05-10 (Sprint 8)

**Bereich:** `src/renderer/stores/fileTabs.ts` (`useFileTabsStore.hydrateFromStorage`)

**Was:** Der Sprint-7-Datei-Tab-Stack lebt rein in-memory. Beim App-Restart sind alle offenen Editor-Tabs (inkl. Diff-Tab) weg; der User muss sie über den Schnellzugriff oder den Datei-Browser wieder einzeln aufmachen.

**Warum so:** Sprint-7-Auflage „keine neue DB-Migration"; Per-Projekt-Tab-Stack analog Sprint-4-Terminal-Tabs ist konsistent (auch die sind in-memory).

**Risiko:** UX-Reibung beim Daily-Driver-Workflow „App schließen, am Folgetag dort weiter machen".

**Auflösung:** Sprint 8 (V5-A): localStorage-Persistenz mit Schema-Versionierung (`v: 1`). Nur Tab-Identitäten (id/kind/relPath/label + activeId pro Projekt) werden gespeichert; Inhalt wird beim Hydrate per `fs:read` im Hintergrund neu geladen. Buffer-Cache bewusst weggelassen (Konflikt-UI-Vermeidung bei extern editierten Files). 7 neue Tests in `file-tabs-store.test.ts`.

---

## ✅ Sensitive-File-Patterns hartcoded statt konfigurierbar — aufgelöst 2026-05-10 (Sprint 8)

**Bereich:** `src/renderer/components/sensitiveFiles.ts`, `AppSettings.sensitive_file_patterns`

**Was:** Vier RegEx-Patterns (`.env(.*)`, `secrets.*`, `*.key`, `*.pem`) waren hartcoded. User mit Custom-Konventionen mussten den Code editieren.

**Warum so:** Sprint-7-Q7 Variante A bewusst hartcoded gelassen, weil der Settings-Dialog erst Sprint 8 kommt.

**Risiko:** Wer ein Custom-Sensitive-Pattern hat, bekommt im PreCommitModal keine Warnung.

**Auflösung:** Sprint 8 (V8-A additiv): Neue Settings-Spalte `sensitive_file_patterns: string[]` (Default `[]`) mit Settings-Dialog-JSON-Editor. `findSensitiveFiles` nimmt das Array als zweiten Parameter, kompiliert die User-Patterns zur Laufzeit (kaputte still gedroppt). User-Patterns matchen auf den ganzen `relPath`, hartcoded Defaults bleiben Basename-only — beide Wege sind nicht abschaltbar (Sicherheits-Defaults additiv).

---

## ✅ Modell-Limits-Defaults zu hoch (1 M statt 200 k) — aufgelöst 2026-05-10 (Sprint 8)

**Bereich:** `src/main/settings/defaults.ts` (`model_limits`)

**Was:** Default-Werte für `claude-opus-4-7`, `claude-opus-4-6` und `claude-sonnet-4-6` standen auf `1_000_000` (Extended-Context-Beta-Wert). Per-Session-Kontext-Bar zeigte bei 80 k Tokens nur ~8 % statt der realen ~40 %.

**Warum so:** Architektur Kapitel 4 hatte `1_000_000` als Beispiel-Settings-JSON übernommen; Sprint 5 hat das 1:1 in `buildDefaultSettings()` reingezogen.

**Risiko:** Per-Session-Kontext-Bar war systematisch zu niedrig, User hätten unwissend auf ein hartes claude-Limit laufen können.

**Auflösung:** Sprint 8: alle drei Werte auf `200_000` korrigiert. Extended-Context-Beta lässt sich pro Modell im Settings-Dialog (Tab Modelle, Per-Modell-Limits) auf 1 000 000 hochsetzen, wenn der User beta-aktiv ist.

---

## awaitWriteFinish-Latenz im JSONL-Watcher

**Bereich:** `src/main/jsonl/watcher.ts` (`chokidar.watch(...)` mit `awaitWriteFinish: { stabilityThreshold: 100 }`)

**Was:** Der Watcher feuert `change`-Events erst, wenn die JSONL-Datei für 100 ms NICHT mehr verändert wurde. Bei einer aktiv laufenden claude-Antwort schreibt das File aber kontinuierlich — der Update-Push kommt deshalb erst nach Antwort-Ende mit ~100 ms Verzögerung, nicht in Echtzeit pro Token. Sichtbar im Smoke-Test: Plannutzungs-Bars und Per-Session-Kontext-Bar bleiben statisch, bis claude für einen Moment ruht.

**Warum so:** `awaitWriteFinish` schützt gegen partielle JSONL-Writes (claude-code könnte mitten in einer Zeile flushen). Ohne den Stability-Threshold würden wir kaputtes JSON parsen und unnötig viele Warnings loggen. 100 ms war ein Kompromiss zwischen Schutz und Latenz; weiter herunterzudrehen riskiert mehr Parse-Errors auf langsameren FS-Stacks (Cloud-Sync, antimalware-On-Access-Scan).

**Risiko:** UX-Eindruck „dashboard ist nicht live", obwohl funktional alles korrekt läuft. Bei kurzen Antworten (< 100 ms aktive Schreibzeit) trotzdem ein Update; bei längeren Antworten nur am Ende.

**Auflösung:** Phase-2-Optimierung könnte ein zweiter „Polling-Ring" sein: chokidar mit `awaitWriteFinish` für die `add`-Events (neue Files), plus ein paralleles fs-stat-Polling auf den Files der aktiven Sessions mit niedrigerer Frequenz (~250 ms), das partielle Reads erlaubt und gegen halbe Zeilen schützt (= komplette Zeilen aus dem Buffer ausblenden, der Rest bleibt für den nächsten Tick). Aktuell akzeptabel — die State-Detection-Loop alle 2 s sorgt dafür, dass der `running ↔ idle`-Statusdot trotzdem reagiert.

---

## Session-Mapping bei mehreren parallelen Tabs im selben cwd

**Bereich:** `src/main/jsonl/watcher.ts` (`resolveTakumiSession`)

**Was:** Der Watcher matched JSONL-Dateien über den encoded-cwd des Eltern-Ordners gegen die `cwd`-Spalte aller running/idle-Sessions. Bei mehreren Treffern (z.B. zwei Tabs im selben Projekt parallel offen) gewinnt die jüngste Session (höchstes `started_at`). Wenn der User in beiden Tabs gleichzeitig prompted, könnten Tokens des älteren Tabs fälschlich dem jüngeren zugewiesen werden — `messages.session_id` wäre dann nicht eindeutig.

**Warum so:** claude-code vergibt eigene Session-UUIDs, die NICHT mit unseren matchen — der Filename der JSONL-Datei ist also kein direkter Schlüssel zur TakumiDeck-Session. Sauber wäre ein 1:1-Mapping über die Session-UUID aus der ersten JSONL-Zeile, das beim Spawn persistiert wird (Variante C in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md) „Sessions-Mapping über encodeCwd statt UUID"). Sprint 5 hat aus Komplexitätsgründen die jüngste-gewinnt-Heuristik gewählt.

**Risiko:** Praktisch unwahrscheinlich, weil Architektur-K2 ohnehin auf 2-5 Tabs zielt und parallele Antworten im selben Projekt selten sind. Falls es passiert: globale 5h/weekly-Bars sind unbeeinflusst (Aggregat über alle Sessions), nur die Per-Session-Kontext-Bar des „verlierenden" Tabs zeigt 0.

**Auflösung:** Wenn das in der Praxis schmerzt: beim Spawn die erste JSONL-Zeile lesen (claude-code schreibt sie meist innerhalb von 1-2 s), die `sessionId` aus dem Inhalt extrahieren und in einer neuen Tabelle `claude_session_links (takumi_session_id, claude_session_id, file_path)` persistieren. Watcher matched dann über `file_path` direkt, kein Heuristik-Pfad mehr nötig. Slot offen — könnte als Phase-2-Verfeinerung mitgenommen werden.

---

## Pre-Hotfix-Sessions ohne JSONL-Antwort sind dauerhaft resume-tot

**Bereich:** `src/main/db/repos/sessions.ts` (`claude_session_id`-Spalte), `src/main/jsonl/watcher.ts` (Backfill-Pfad), Sprint-8-UX-Hint in `src/renderer/panels/HistoryPane.tsx`

**Was:** Sessions, die VOR dem Sprint-6-Resume-Hotfix (= Migration `0003_claude_session_id.sql`) gespawnt wurden UND nie eine JSONL-Antwort produziert haben (Spawn-Error sofort, oder User hat den Tab vor der ersten claude-Antwort geschlossen), bleiben dauerhaft resume-tot. Sie haben weder eine vom Spawn vorgegebene UUID (gab's vor dem Hotfix nicht) noch ein JSONL-File, aus dem der Watcher die UUID rückwirkend extrahieren könnte. Resume liefert einen klaren `SESSION_NO_CLAUDE_UUID`-Fehler statt eines verwirrenden „No conversation found".

**Warum so:** Variante C des Resume-Hotfix kombiniert `--session-id`-Spawn (für neue Sessions) und Watcher-Backfill aus Filename (für Legacy mit JSONL). Der dritte Fall — Legacy ohne JSONL — ist nicht reparabel, weil die zur Zeit verwendete claude-UUID nirgends mehr greifbar ist; sie existiert nur im Speicher des damaligen claude-Prozesses, der längst gestorben ist.

**Risiko:** User sieht im Verlauf-Panel eine Session, deren Resume mit einem klaren Fehler abbricht. Praktisch wenig Schaden — diese Sessions hatten ohnehin keine echte Konversation, der User würde sie sowieso archivieren oder neu spawnen.

**Auflösung:** Keine technische Lösung möglich (externe UUID nicht rekonstruierbar). Sprint-8-Cosmetic ✅: Verlauf-Detail-Pane rendert bei Resume-Fehler mit `code === 'SESSION_NO_CLAUDE_UUID'` jetzt eine gezielte Hint-Box („Diese Session ist nicht mehr resume-fähig") mit einem Direkt-Archivieren-Knopf statt nackter Fehlermeldung. Underlying-Schuld bleibt — UX ist aber jetzt sauber abgefedert.

---

## Multi-Session-im-selben-cwd-Backfill nimmt nur die jüngste

**Bereich:** `src/main/jsonl/watcher.ts` (`backfillClaudeSessionId`)

**Was:** Wenn der User vor dem Sprint-6-Resume-Hotfix mehrfach im selben Projekt Sessions ohne JSONL-Antwort gespawnt hat, gibt es mehrere TakumiDeck-Sessions mit `claude_session_id IS NULL` und identischem encodeCwd. Der Watcher-Backfill matcht eine claude-UUID aus dem JSONL-Filename gegen alle Kandidaten und mappt sie auf die jüngste Session (höchstes `started_at`). Die anderen bleiben null und damit resume-tot.

**Warum so:** Das ist die gleiche Heuristik wie Sprint-5-`resolveTakumiSession` — bei Mehrdeutigkeit gewinnt zeitliche Nähe. Eine sauberere Zuordnung wäre per JSONL-Anlage-Zeitstempel gegen `started_at`-Match aller Kandidaten, kostet aber Filesystem-stat plus eine pro-File-Sortierroutine. Für die zu erwartende Anzahl an Legacy-Sessions (~ein paar dutzend, einmalig nach App-Update) kein vertretbarer Aufwand.

**Risiko:** Wenn der User vor dem Hotfix tatsächlich 3 Sessions im selben cwd ohne JSONL-Antwort hatte, würde ein einziger zukünftiger JSONL-Tick eine UUID auf die jüngste mappen — die anderen beiden bleiben tot. Der Edge-Case ist eng: 3 Sessions im selben Projekt, alle ohne erste claude-Antwort.

**Auflösung:** Falls in der Praxis Schmerz: ein einmaliger Migrations-Pass beim App-Start, der alle JSONL-Files in `~/.claude/projects/` durchgeht und die UUIDs nach started_at-Reihenfolge auf die Kandidaten verteilt. Slot offen — könnte als Phase-2-Verfeinerung nachkommen.

---

## ✅ Tote `.td-sidebar-*`-CSS-Blöcke aus dem Pre-3-Sektionen-Layout — aufgelöst 2026-05-10 (Sprint 7)

**Bereich:** `src/renderer/styles/app.css` (Sektion `.td-sidebar-header`, `.td-sidebar-list`, `.td-sidebar-item`, `.td-sidebar-views`, `.td-sidebar-view-btn` etc.)

**Was:** Die Sprint-6-UI-Umstellung der Sidebar auf das 3-Sektionen-Design hat die alten `.td-sidebar-*`-Klassen (Header, Liste, Item, Item-Path, Views-Toggle, Item-Wrap) im CSS zurückgelassen. Die LeftSidebar nutzt jetzt `td-panel` / `td-list` / `td-list-item` etc. — die alten Klassen werden nirgends mehr gerendert.

**Warum so:** Beim Refactor war das CSS-Aufräumen ein Cosmetic-Schritt; ich habe die Funktionalität priorisiert und das Aufräumen verschoben, um keine unnötigen Diff-Konflikte beim parallelen Schreiben zu produzieren.

**Risiko:** Reine CSS-Bytes-Schuld (~200 Zeilen tote Regeln). Kein Funktionsschaden, kein Build-Fehler.

**Auflösung:** Sprint 7 hat den Block beim Right-Pane-CSS-Touch mitgenommen — alle Pre-3-Sektionen-Klassen (`.td-sidebar-header / -title / -actions / -icon-btn / -list / -item / -item-row / -item-name / -item-path / -badge / -item-wrap / -views / -view-btn`) sind raus. Plus zusätzlich die alten `.td-notes-footer / -header / -toggle / -meta / -textarea`-Blöcke aus dem ehemaligen Sprint-3-NotesFooter (Notes wandert in den Right-Stack mit neuen `.td-notes / -head / -body / -saving / -empty`-Klassen). Generische `.td-panel:nth-child(2)` / `.td-panel-history`-Regeln auf `.td-sidebar > .td-panel*` gescoped, damit der Right-Stack nicht versehentlich erbt.

---

---

## ✅ Sprint-2/3-Legacy-Sessions UI-blind — aufgelöst 2026-05-10 (Sprint 6)

**Bereich:** `src/renderer/panels/HistoryPane.tsx` + LeftSidebar-Verlauf-Sektion

**Was:** Sprint-2/3-Sessions (im Default-Project hängen geblieben, weil cwd auf `workspace_path` gespawnt) waren in der UI unauffindbar. Sidebar-Bucket existierte mit Session-Count-Badge, aber Klick öffnete nur einen leeren Empty-State im TabContainer — keine Liste, kein Resume.

**Warum so:** Sprint-4-Spec hatte den UI-Pfad bewusst auf Sprint 6 verschoben: das Verlauf-Panel war ein eigener Feature-Block, der erst dort gebaut werden sollte.

**Risiko:** User sah ein hohes Badge-Count am Legacy-Bucket ohne Aktions-Möglichkeit.

**Auflösung:** Sprint-6-HistoryPane mit Replace-View zeigt jetzt alle Sessions des aktiven Projekts inkl. Legacy-Bucket. Beim Klick auf den Legacy-Bucket erscheint zusätzlich ein Hinweis-Banner („Sessions aus Sprint 2/3, bevor der Workspace-Scanner echte Projekte erkannt hat"). Resume aus dem Verlauf greift dort identisch — mit dem Sprint-6-Hotfix funktioniert das auch für Legacy-Sessions, sobald der Watcher ihre JSONL einmal gesehen hat.

---

## cache_creation/cache_read in tokens_in summiert

**Bereich:** `src/main/jsonl/watcher.ts` (`messages.insert(...)`), `src/main/usage/resolver.ts` (`resolveContext`)

**Was:** Die `messages`-Tabelle hat zwei Token-Spalten: `tokens_in` und `tokens_out`. Sprint 5 schreibt `tokens_in = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, die drei Anteile stehen also nicht getrennt zur Verfügung. Die Per-Session-Kontext-Bar zeigt deshalb in `tokens.input` den summierten Wert und füllt `cache_creation` / `cache_read` mit `0` — fachlich falsch, aber numerisch konsistent (`total` ist korrekt).

**Warum so:** Schema-Spalten getrennt zu führen wäre eine Migration `0003`, plus `MessageInsert`-Type-Erweiterung. Für Sprint 5 reichte die Summe — die Plannutzungs-Bars rechnen sowieso mit `totalTokens`, und das Detail-Modal zeigt die Per-Modell-Aufschlüsselung aus `usage_buckets`, wo Cache-Anteile bereits zusammengeführt sind.

**Risiko:** Sprint 6 (Verlauf-Panel) und Phase 2 (Cache-Hit-Statistik) könnten die getrennten Werte brauchen — dann wäre eine Backfill-Migration nicht trivial möglich, weil die Original-JSONLs zwar noch existieren, aber bytes-effizientes Re-Parse schwierig wird (Offsets sind verbraucht).

**Auflösung:** Wenn Sprint 6 die Aufschlüsselung will: Migration `0003_cache_columns.sql` mit `tokens_cache_creation INTEGER` + `tokens_cache_read INTEGER` plus Watcher-Update. Backfill: Offsets zurücksetzen und JSONLs erneut von 0 lesen — kostet einmaligen Re-Scan-Hit beim nächsten App-Start, aber Daten sind dann vollständig.

---

## ✅ Empty-State des Legacy-Buckets zeigt DB-Rohnamen `__default__` — aufgelöst 2026-05-10 (Sprint 5)

**Bereich:** `src/renderer/panels/TabContainer.tsx` (Empty-State-Branch), `src/renderer/components/displayProjectName.ts` (neu)

**Was:** Beim Klick auf den Legacy-Bucket erschien im Tab-Host der Text *„Keine Sessions in `__default__`."*, weil der Empty-State `activeProject.name` direkt las und der Default-Project in der DB den Namen `__default__` trägt. Die Sidebar daneben hatte eine eigene Sonderbehandlung und renderte „Sprint-2/3-Legacy".

**Warum so:** Sprint 4 hatte zwei separate Code-Pfade — Sidebar mit Sonderbehandlung, TabContainer ohne. Cosmetic-Issue, kein Funktions-Schaden, daher in Sprint 4 verschoben.

**Risiko:** Kein technischer Schaden — User-Verwirrung bei der ersten Begegnung („Was ist `__default__`?"). Sidebar-Kontext lieferte die Antwort daneben.

**Auflösung:** `displayProjectName(p)`-Helper extrahiert (5 Zeilen, mappt `DEFAULT_PROJECT_ID` und `__default__`-Name auf „Sprint-2/3-Legacy"), in Sidebar UND TabContainer-Empty-State eingehängt. Sprint-5-Drive-by, weil PlanPane/StatsPane ohnehin Per-Projekt-Aufschlüsselung anfassen werden.

---

## xterm-Console-Error `dimensions` in Dev-Mode

**Bereich:** `src/renderer/panels/TerminalTab.tsx` (xterm-v5.5 + CanvasAddon-Lifecycle)

**Was:** In Dev-Mode mit React-StrictMode wirft xterm beim Tab-Mount/Unmount-Race einen Console-Error: `Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')` aus `Viewport.syncScrollArea` → `RendererService.dimensions`. Tritt auf, wenn ein FitAddon-`fit()`-Call vom ResizeObserver getriggert wird, während der Renderer-Service bereits disposed ist (StrictMode-Cleanup-Mount-Reihenfolge).

**Warum so:** xterm.js v5.5 hat ein internes Race in der Dispose-Sequenz, bekannt im Issue-Tracker (xtermjs/xterm.js). Der Fix wäre entweder ein Workaround (Addons explizit vor dem Terminal disposen, plus Mikro-Tick-Delay) oder ein Upgrade auf xterm v6 — letzteres ist durch [ENTSCHEIDUNGEN.md „xterm.js auf v5.5 gepinnt (kein v6)"](./ENTSCHEIDUNGEN.md) blockiert (v6 hat den Canvas-Renderer entfernt). Workaround-Aufwand für ein rein kosmetisches Problem in Dev-Mode lohnt sich aktuell nicht.

**Risiko:** Nur Console-Lärm. Funktional unbeeinträchtigt — Tippen, Copy/Paste, Tab-Wechsel, Resume und Notizen laufen alle. In Production-Builds (Electron Forge `npm run make`) ist React-StrictMode aus, der Error tritt nicht auf.

**Auflösung:** Wenn xterm.js den Race fixt (Issue-Tracker beobachten) ODER wenn Architektur-K2 auf WebGL-Renderer umstellt und xterm v6 erlaubt wird, fällt das Problem von selbst weg. Bis dahin ignorieren.

---

## ✅ Crash-Recovery für orphane running-Sessions fehlt — aufgelöst 2026-05-10 (Sprint 8)

**Bereich:** `src/main/sessions/reconciliation.ts` (neu), Hook in `src/main/main.ts:124-138`

**Was:** Sprint 3 deckte nur den geordneten App-Quit ab (`before-quit` patcht running → interrupted). Bei Hard-Crash blieb eine Session als `status='running' / ended_at IS NULL` zurück; das Sprint-6-Verlauf-Panel zeigte sie als „läuft", obwohl der claude-Prozess tot war.

**Warum so:** Variante C aus dem Sprint-3-Briefing wurde explizit auf Sprint 8 (Polish) verschoben. In Sprint 3 zeigte die UI nur Live-Tabs, der Bug war erst ab Sprint 6 sichtbar.

**Risiko:** Karteileichen in der DB nach Hard-Crash; UI-Verwirrung im Verlauf.

**Auflösung:** Sprint 8 (V4-C): `reconcileCrashedSessions(deps)` mit Driver-Injection (Sessions/Messages/Lifecycle). Beim App-Start nach `openDatabase()` werden alle running- und idle-Sessions ohne `ended_at` via `lifecycle.transition('interrupted', 'app-quit')` gepatcht; danach wird `ended_at` auf `MAX(messages.ts WHERE session_id)` korrigiert (genauester Crash-Zeit-Approximator). Sessions ohne Messages bekommen `now()` als Fallback. Idempotent (zweiter Pass macht nichts mehr). 9 neue Tests in `reconciliation.test.ts`.

---

## Notes-Auto-Save bei Hard-Quit best-effort

**Bereich:** `src/renderer/components/NotesFooter.tsx`, `window.beforeunload`-Handler

**Was:** Der `beforeunload`-Flush des Notes-Savers ist fire-and-forget — `window.api.sessions.update(...)` ist ein `invoke()`-Promise, der oft nicht mehr aufgelöst wird, bevor der Renderer-Prozess stirbt. Der Main-Prozess empfängt das IPC-Paket meist noch und schreibt synchron in die DB (better-sqlite3 ist sync), aber es gibt keine Garantie. Worst-Case-Verlust: 0–500 ms Tipps bei Strom weg, Task-Manager-Kill oder OOM.

**Warum so:** Synchroner IPC (`ipcRenderer.sendSync`) wäre die korrekte Lösung, ist aber nicht in der typed-bridge-API exponiert und müsste eigenständig durch die contextBridge geschleust werden. Für Sprint 3 nicht den Aufwand wert — der Verlust ist klein, der Trigger selten.

**Risiko:** Bei Strom weg während aktivem Tippen verliert der User die letzten 0–500 ms Tipps. Bei normalem App-Schließen oder Tab-Wechsel passiert das nicht (onUnmount/onBlur flushen synchron via invoke, das im geordneten Shutdown durchläuft).

**Auflösung:** Wenn das Schmerz wird, einen `notes:flushSync`-Channel im Preload via `ipcRenderer.sendSync` exponieren und im `beforeunload`-Handler nutzen. Sprint 8 (Settings-Dialog + Error-Handling) ist ein guter Slot, wenn die Datenpfade ohnehin angefasst werden. Bis dahin: Aufmerksamkeit beim Tippen während instabiler Stromversorgung.

---

## ✅ Default-Project als FK-Lifeline für Sprint 2 — aufgelöst 2026-05-09 (Sprint 4)

**Bereich:** `src/main/db/repos/projects.ts`, beim App-Start in `src/main/main.ts`

**Was:** Beim App-Start wird ein einzelner Project-Row mit stabiler UUID `00000000-0000-0000-0000-000000000001`, name `__default__` und `path = settings.workspace_path` in `projects` eingefügt. Alle Sessions in Sprint 2 hängen an genau diesem Project, weil `sessions.project_id` ein NOT-NULL-FK ist und der Workspace-Scanner aus Sprint 4 noch nicht existiert.

**Warum so:** Sprint 2 braucht eine lauffähige Session-DB, ohne Sprint 4 vorzuziehen. Workspace-Scanning + Project-Erkennung ist eine größere Bereich (rekursiver Scan, CLAUDE.md-Parser, Add-Project-Dialog) — das im PTY-Sprint mitzuziehen würde den Scope sprengen und das Risiko, in einem Spawn-Bug stecken zu bleiben, wachsen lassen.

**Risiko:** Wenn Sprint 4 Projekte nach `path` einliest und unser Default-Project mit `path = workspace_path` (ein *Verzeichnis-Container*, kein echtes Projekt) kollidiert, könnten doppelte Rows oder UNIQUE-Verstöße entstehen. Außerdem hängen alle Sprint-2-Sessions an einer ID, die später eventuell „migriert" werden müsste, falls der User die Sessions in echte Projekte überführen will.

**Auflösung:** Sprint 4 erkennt den Default-Project per stabiler UUID und führt einmalig einen `cwd`-Prefix-Match-Pass durch: Sessions, deren `cwd` innerhalb eines neu erkannten Projekt-Pfads liegt, werden auf das echte Project umgehängt. Was nicht passt, bleibt am Default-Project, das in der Sidebar als „Sprint-2/3-Legacy"-Bucket sichtbar ist (gekoppelt an `session_count > 0`). UNIQUE-Konflikte gibt es nicht, weil `workspace_path` und Projekt-Pfade per Definition disjunkt sind (Scanner stoppt bei `CLAUDE.md`, der workspace_path-Container hat keine). Folge-Schuld siehe Eintrag „Sprint-2/3-Legacy-Sessions UI-blind bis Sprint 6".

---

## Sprint-2/3-Legacy-Sessions sind UI-blind bis Sprint 6

**Bereich:** `src/renderer/panels/LeftSidebar.tsx` (Legacy-Bucket), Sprint-6-Verlauf-Panel

**Was:** Sprint 2/3 hat Sessions mit `cwd = settings.workspace_path` (Parent-Ordner aller Projekte, z.B. `D:\Projekte`) gespawnt. Beim Sprint-4-Remap-Pass (siehe „Default-Project als FK-Lifeline ✅") matcht keiner dieser cwd-Werte einen echten Projekt-Pfad — die Sessions bleiben im sichtbaren Legacy-Bucket. Aktuell gibt es keinen UI-Pfad, sie zu öffnen, zu resumen oder zu löschen — nur die Existenz wird über das `session_count`-Badge angezeigt.

**Warum so:** Sprint 4 lädt **keine historischen Sessions als Tabs** — Tabs entstehen ausschließlich durch neue Spawn-Events oder Resume aus dem Tab-Bar. Sprint 6 (Verlauf-Panel) wird historische Sessions des aktiven Projekts auflisten und dort wären die Legacy-Sessions normal erreichbar. Sprint 4 hat den UI-Pfad bewusst nicht vorgezogen, weil das Verlauf-Panel ein eigener Feature-Block ist (Filter, Detail-Panel, Klick-zu-Resume).

**Risiko:** User mit vielen Sprint-2/3-Sessions sieht ein hohes Badge-Count am Legacy-Bucket, ohne darauf reagieren zu können. Optisch leicht unangenehm; technisch unkritisch (Sessions sind in der DB, Notes-Inhalte erhalten). Wenn der User ungeduldig wird: direkt per SQLite-Tool in `data.sqlite` aufräumen (`DELETE FROM sessions WHERE project_id = '00000000-0000-0000-0000-000000000001';`).

**Auflösung:** Sprint 6 baut das Verlauf-Panel — beim Klick auf den Legacy-Bucket würde dieselbe Liste erscheinen wie für jedes andere Projekt. Resume aus dem Verlauf ist Sprint-3-Logik (existiert), nur das UI-Element fehlt. Bis dahin steht der Hinweis im CHANGELOG-Eintrag der Sprint-4-Season und in der Antwort auf die User-Rückfrage „Was ist Sprint-2/3-Legacy?".

---

## Empty-State des Legacy-Buckets zeigt DB-Rohnamen `__default__`

**Bereich:** `src/renderer/panels/TabContainer.tsx` (Empty-State-Branch)

**Was:** Wenn der User auf den Legacy-Bucket in der Sidebar klickt, erscheint im Tab-Host der Text *„Keine Sessions in `__default__`."* — der Empty-State liest `activeProject.name`, und der Default-Project hat in der DB den Namen `__default__`. In der Sidebar wird derselbe Eintrag korrekt als „Sprint-2/3-Legacy" gerendert (eigene Sonderbehandlung in `LeftSidebar.tsx`).

**Warum so:** Sprint 4 hat zwei separate Code-Pfade für die Anzeige: die Sidebar (mit Legacy-Sonderbehandlung) und der Empty-State im TabContainer (generisches `activeProject.name`). Die Inkonsistenz wurde im Sprint-4-Smoke-Test sichtbar; der Fix wäre eine kleine Helper-Funktion `displayProjectName(project)`, die beide Stellen nutzen — bewusst nicht im Sprint-4-Scope, weil rein kosmetisch und ohne Funktions-Impact.

**Risiko:** Visuelle Inkonsistenz, kein Funktions-Schaden. User könnte beim ersten Sehen verwirrt sein („Was ist `__default__`?"), aber der Sidebar-Kontext liefert die Antwort sofort daneben.

**Auflösung:** Helper `displayProjectName(p)` extrahieren (1 Datei, ~5 Zeilen), in `LeftSidebar.tsx` und `TabContainer.tsx` verwenden. Alternativ: beim ensureDefaultProject den `name`-Wert in `Sprint-2/3-Legacy` umbenennen — würde aber den DB-Stand für historische Tools verändern. Helper-Variante ist sauberer. Slot: Sprint 5 oder als Drive-by-Fix beim nächsten Touch der Renderer-Panels.

---

## Migrationspfad fehlt für ungültige `workspace_path`-Settings aus Sprint 1

**Bereich:** `src/main/settings/store.ts`, `src/main/settings/defaults.ts`

**Was:** Wer aus Sprint 1 eine `settings.json` mit dem alten Default `<home>/Projekte` mitbringt und diesen Ordner nicht hat, sieht beim Spawn die saubere Fehlermeldung „Working-Directory existiert nicht". Es gibt aber keine UI, das im Setting zu korrigieren — der User muss `%APPDATA%\TakumiDeck-dev\settings.json` per Texteditor öffnen. `pickDefaultWorkspacePath` in `defaults.ts` greift nur bei Erstinstallationen, nicht bei bestehenden settings.json-Dateien.

**Warum so:** Settings-Dialog ist explizit Sprint 8 (Polish). Ein „Fix"-Knopf nur für `workspace_path` wäre eine Insel-Lösung, die später durch den richtigen Settings-Dialog ersetzt würde.

**Risiko:** Frustpotenzial bei jedem ersten Sprint-2-Test-Lauf, wenn der Default-Pfad nicht zufällig passt. Im Worst Case denkt der User, die App ist kaputt, weil die saubere Fehlermeldung im Header nicht so prominent ist wie ein Dialog.

**Auflösung:** Sprint 8 mit dem Settings-Dialog. Bis dahin steht der Fix-Pfad in [CHANGELOG.md](./CHANGELOG.md) (Sprint-2-Eintrag, „Offen geblieben") und im Fehlertext selbst.

---

## Migration-Runner-Tests gegen Fake-Driver statt echter SQLite

**Bereich:** `tests/main/migrations.test.ts` + `src/main/db/migrations.ts`

**Was:** Der Migration-Runner ist gegen ein selbst gebautes `MigrationDriver`-Interface getestet (in-memory Fake mit `executed`-Array und `versionHolder`), nicht gegen eine echte better-sqlite3-Verbindung. Dadurch werden die Reihenfolge-, Skip- und Sortier-Eigenschaften des Runners abgedeckt, aber **nicht** die tatsächliche SQL-Ausführung der `0001_init.sql`.

**Warum so:** `electron-rebuild` baut better-sqlite3 nach dem ersten `npm start` für die Electron-ABI um. Danach ist das Modul in plain Node (also auch in Vitest) nicht mehr ladbar — `NODE_MODULE_VERSION 130 vs 137`-Fehler. Eine echte SQLite-Anbindung würde den User zwingen, vor jedem Testlauf manuell `npm rebuild better-sqlite3` zu callen, sonst kippen die Tests rot.

**Risiko:** Tippfehler in `0001_init.sql` (z.B. fehlendes Komma, ungültige Spalten-Definition) bleiben unentdeckt, bis die App das erste Mal startet. Akzeptabel im MVP, weil das Schema klein ist und beim Start sofort sichtbar wird, wenn etwas bricht.

**Auflösung:** Sobald wir Worker-Threads im Main hinzufügen oder einen separaten Test-Runner mit Node-ABI-Build von better-sqlite3 brauchen (z.B. via `@electron/rebuild --types prod` mit einem zweiten Build-Output-Pfad), kann ein zusätzlicher Smoke-Test die Init-Migration gegen `:memory:` laufen lassen. Bis dahin: Schema-Änderungen einmal manuell durch `npm start` validieren.

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

## <Kurzer Titel der Schuld>

**Bereich:** `<Modul / Datei>`

**Was:** Kurze Beschreibung des aktuellen Zustands — was ist hier nicht sauber oder nicht fertig?

**Warum so:** Begründung, warum die sauberere Lösung jetzt nicht umgesetzt wurde.

**Risiko:** Was passiert, wenn dieser Stand länger so bleibt? Wo kann es knallen?

**Auflösung:** Skizze der saubereren Lösung — reicht als Stichpunkt.
