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
