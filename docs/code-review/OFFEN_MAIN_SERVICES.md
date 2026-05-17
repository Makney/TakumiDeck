# Code-Review — Bekannte offene Punkte (Main-Services)

Befunde für `src/main/{pty,jsonl,workspace,sessions,git,usage,templates,fs,settings}/...` und `src/main/{main,paths,logger}.ts`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md). Pro Eintrag: Datei:Zeile, Kategorie, Beschreibung, Begründung, optional Trigger.

---

## ESLint-Vor-Pass-Befunde (2026-05-10)

Aus dem Initial-Lint-Lauf nach ESLint-Setup.

### parser.ts catch-Variable `e` ungenutzt — BEHOBEN 2026-05-11

- `src/main/jsonl/parser.ts:69` · Kategorie: **Warnung**
- **Beschreibung:** Catch-Block deklarierte `e`, nutzte es aber nicht. ESLint `@typescript-eslint/no-unused-vars` warnte, weil das Pattern `^_` für bewusst-ignoriert nicht erfüllt war.
- **Auflösung (2026-05-11):** Bereich-3-Review hat verifiziert, dass die Fail-Soft-Strategie korrekt ist (Warnings werden zum Watcher propagiert und geloggt), die Error-Detail-Message ging aber verloren. Fix: `e instanceof Error ? e.message : String(e)` wird jetzt in den Warning-Text aufgenommen; `eslint-disable`-Zeile + FIXME-Kommentar entfernt.

---

## Refactor-Backlog (2026-05-11)

Aus dem Main-Services-Review. Bewusst nicht im aktuellen Scope, weil „Kein Refactoring ohne Auftrag" (CLAUDE.md §3).

### Intra-Modul-Duplikat: cwd-Match-Schleife im JSONL-Watcher

- `src/main/jsonl/watcher.ts:205-217` ↔ `src/main/jsonl/watcher.ts:231-249` · Kategorie: **Verbesserung**
- **Beschreibung:** `resolveTakumiSession` und `backfillClaudeSessionId` enthalten dieselbe Such-Schleife: encoded-cwd vergleichen, höchstes `started_at` gewinnt. Einziger Unterschied ist die Kandidaten-Quelle (`listByStatus('running'|'idle')` vs. `listMissingClaudeSessionId()`).
- **Begründung:** Helper `pickMostRecentMatchingSession(candidates, folderEncoded)` extrahieren ist ein eigenständiger Refactor-Schritt. Verlangt explizite Freigabe.
- **Trigger:** wenn ein dritter Aufrufer mit derselben Match-Logik dazukommt — dann sind drei Stellen die Schwelle für die Extraktion.

### Cross-Modul-Duplikat: FsLikeDriver readdir+isExpectedFsError

- `src/main/workspace/scanner.ts:40-72` ↔ `src/main/fs/treeScanner.ts:39-53,124-128` ↔ `src/main/templates/reader.ts:32-54` · Kategorie: **Verbesserung**
- **Beschreibung:** Drei separate FS-Driver mit identischer readdir-Try/Catch-Logik und identischem `isExpectedFsError`-Helper (EACCES/ENOENT/ENOTDIR/EPERM). Das Dirent → `{ name, isFile, isDirectory }`-Mapping wird drei Mal definiert. Toolzeitig schon als 9-Zeilen-Cross-Modul-Duplikat zwischen `treeScanner` und `scanner` gemeldet — der dritte Klon in `templates/reader.ts` macht die Begründung „bewusste Trennung" weniger plausibel.
- **Begründung:** Ein `src/main/fs/safe-readdir.ts`-Helper würde alle drei harmonisieren — aber unterschiedliche Driver-Interfaces (`isFile`/`isDirectory` je nach Konsument) machen das nicht trivial. Refactor mit Variants-Pass vorbereiten.
- **Trigger:** beim nächsten Hinzufügen eines vierten FS-Drivers (oder wenn das Fehler-Set divergiert und ein Bug zeigt).

### Shallow-Merge in SettingsStore.read() übersieht neue Keys in geschachtelten Objects

- `src/main/settings/store.ts:30` · Kategorie: **Warnung**
- **Beschreibung:** `{ ...buildDefaultSettings(), ...parsed }` ist ein flacher Spread. Wenn ein User aus Sprint 1 nur ein Subset von `model_limits` in der `settings.json` hat (z.B. `{ 'claude-sonnet-4-5': 200000 }`), und Sprint 8 hat `claude-opus-4-7` zu den Defaults hinzugefügt, fehlt der neue Key im gemergten Result — das ganze User-Object überschreibt das Default-Object. Gleiches gilt für `shortcuts` und `token_warning_thresholds`.
- **Begründung:** Verhaltensänderung mit Tradeoff (User-Override gewinnt explizit vs. Auto-Migration neuer Default-Keys). Verlangt Variants A/B + Entscheidung; nicht im Review-Scope.
- **Trigger:** wenn ein neues Default-Modell hinzukommt und User-Reports auftauchen, dass die Per-Session-Kontext-Bar nicht das erwartete Limit zeigt.
- **Update Release-Review v0.2.0 (2026-05-17):** Oberfläche ist seit v0.1.2 um drei Sub-Objekte gewachsen (`screenshot_retention`, `context_soft_warning` aus Season 8, `template_top_n` aus Season 20), plus zwei neue flache Felder (`workspace_wizard_completed`, `easter_egg_enabled`). Damit gibt es jetzt fünf Sub-Objekte (inkl. `model_limits`, `shortcuts`, `token_warning_thresholds`) plus zwei nicht-Sub-Felder, bei denen ein partieller User-Override defaults verlieren könnte. Drift-Risiko skaliert; Variants-Pass jetzt überfällig.

---

## Design-by-Choice — verifizierte Nicht-Befunde (2026-05-11)

Tooling-Befunde, die das Bereichs-Review als gerechtfertigt verifiziert hat — damit der nächste Review-Pass sie nicht erneut als Hotspot meldet.

### handleFile-Komplexität (Cyclo 18, Cog 18, 82 Zeilen)

- `src/main/jsonl/watcher.ts:116` · Kategorie: **Design-by-Choice**
- **Begründung:** Vier separierbare Pflichten (Backfill, Resolve, Tail-Read + Parse, Push-Scheduling). Zwei davon sind bereits in Sub-Methoden ausgelagert; (3) und (4) sind die Hauptarbeit mit echten Domänen-Verzweigungen (truncate-recovery, known/unknown session, wroteContext/wroteUsage). Refactor wäre marginal.
- **Trigger:** wenn Sprint 6+ weitere Pflichten in den Watcher schiebt, neu bewerten.

### resolveExecutable-Komplexität (Cyclo 12, Cog 16)

- `src/main/pty/binary.ts:16` · Kategorie: **Design-by-Choice**
- **Begründung:** Drei separat-getestete Pfade (absolut · relativ · bare-name via PATH) plus Windows-spezifische `.exe`/`.cmd`/`.bat`/`.com`-Präferenz. Verzweigung ist echte OS-Domänen-Logik; ein Refactor in Sub-Funktionen würde den Lesefluss verschlechtern.

### git/driver.ts:status-Komplexität (Cyclo 12)

- `src/main/git/driver.ts:39` · Kategorie: **Design-by-Choice**
- **Begründung:** Type-Narrowing über die simple-git-Union (Text/Binary/NameStatus) plus detached-HEAD-Fallback. Jede Verzweigung trägt echte Information.

---

## Beobachtungen ohne Action (2026-05-11)

Hinweise, die für sich kein Bug sind, aber bei zukünftigen Änderungen im Blick bleiben sollten.

### awaitWriteFinish stabilityThreshold während Initial-Scan

- `src/main/jsonl/watcher.ts:62` · Kategorie: **Warnung**
- **Beschreibung:** chokidar v5 mit `ignoreInitial:false` + `awaitWriteFinish:{stabilityThreshold:100}` zusammen: beim Initial-Scan wartet chokidar für JEDE Datei 100 ms Stabilität ab. Bei einem Workspace mit z.B. 500 JSONLs heißt das spürbare Latenz nach App-Start, bis Token-Aggregation vollständig nachgezogen ist.
- **Begründung:** Aktuell keine messbare User-Beschwerde. Falls Initial-Scan-Dauer relevant wird, prüfen, ob `awaitWriteFinish` nur auf `change`-Events angewandt werden kann.
- **Trigger:** Bug-Report „Token-Dashboard zeigt falsche Zahlen direkt nach Start".

### parseJsonlSegment-Vertrag gilt nur für Reads bis EOF

- `src/main/jsonl/parser.ts:38` · Kategorie: **Warnung**
- **Beschreibung:** `Buffer.byteLength(lineWithNewline, 'utf8')` zählt Bytes korrekt, **solange** das gelesene Segment nicht mid-codepoint abgeschnitten wurde. Heutiger `realJsonlReadDriver.readTail` liest immer bis Datei-Ende (mit awaitWriteFinish-Schutz), darum kein Risiko. Wenn jemand später einen Chunk-basierten Reader baut, bricht der Byte-Offset.
- **Begründung:** Dokumentations-Hinweis am Driver-Vertrag; Code-Fix erst nötig, wenn Chunk-Reader gebaut wird.

---

## Release-Review v0.2.0 (2026-05-17)

Befunde aus dem Release-Review von v0.1.2 → v0.2.0, die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Boot-Screenshot-Retention läuft ohne Settings-Modal-Refresh-Signal

- `src/main/main.ts:317-330`, `src/renderer/modals/SettingsModal.tsx:341-410` (`ScreenshotRetentionBlock`) · Kategorie: **Verbesserung**
- **Beschreibung:** `runScreenshotRetention` beim App-Start löscht potenziell viele Dateien (Age-Cutoff + Cap). Der `ScreenshotRetentionBlock` im Settings-Modal lädt seine „Aktuell"-Anzeige (`fileCount` + `totalBytes`) per `useEffect`-Refresh erst beim Modal-Open. Beim ersten Settings-Open nach dem Start zeigt er den Stand *nach* der Retention — korrekt, aber ohne Hinweis, dass Files weggeräumt wurden. Der Boot-Log hat die Bilanz (`scanned=X deleted=Y`).
- **Begründung:** UI-Hinweis „Beim letzten Start wurden N Dateien aufgeräumt" wäre ein zusätzliches Persistenz-Detail (Boot-Report im `meta_kv`-Store oder ein flüchtiger In-Memory-State, der nur den ersten Settings-Open nach App-Start überlebt). Aufwand steht nicht im Verhältnis zum Nutzen — der User sieht beim ersten Open trotzdem die korrekten Zahlen, und die Retention-Schwellen sind seine eigene Vorgabe.
- **Trigger:** wenn ein User-Report „TakumiDeck hat ohne Vorwarnung alle Screenshots gelöscht" auftaucht, dann einen Boot-Report-Toast hinzufügen oder die letzte Retention-Bilanz im Settings-Block neben den Schwellwert-Inputs anzeigen.

### `extractTemplateBody` strippt YAML-Frontmatter nicht im Fallback-Pfad

- `src/renderer/components/templateBody.ts:28-77` · Kategorie: **Verbesserung**
- **Beschreibung:** Season-23-Templates haben YAML-Frontmatter (`variables:`-Map) am Datei-Anfang plus einen `## Vorlage`-Heading mit Code-Fence. `extractTemplateBody` findet den `## Vorlage`-Block und gibt nur dessen Fence-Inhalt zurück — das Frontmatter landet *nicht* im Prompt. Wenn ein User aber ein Template *mit* Frontmatter und *ohne* `## Vorlage`-Heading anlegt, fällt der Extraktor auf „voller Content" zurück (Fallback-Path bei Zeile 76) und der YAML-Block fließt in den Prompt mit. Alle in v0.2.0 ausgelieferten Templates (BUG_REPORT/CODE_REVIEW_START/PROJEKT_KICKOFF/RELEASE_START/SEASON_PROMPT plus `createTemplateStub`-Output) haben beides, also nicht in der Praxis exponiert.
- **Begründung:** Fix wäre einzeilig (vor dem Heading-Match einen `stripFrontmatter`-Call aus `src/shared/docs-sync.ts` einbauen — der Helper existiert seit Season 22). Aber: der Body-Extraktor lebt im Renderer und `docs-sync.ts` im Shared-Layer, der Import ist neutral. Bewusst aus Season-23-Scope rausgehalten, damit der Frontmatter-Schema-Pfad fokussiert bleibt.
- **Trigger:** beim nächsten Touch von `templateBody.ts` oder wenn ein User-Template ohne `## Vorlage`-Heading auftaucht und der YAML-Block im Prompt landet — dann `stripFrontmatter` vor dem Heading-Scan einsetzen.
