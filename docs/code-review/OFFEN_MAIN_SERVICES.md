# Code-Review — Bekannte offene Punkte (Main-Services)

Befunde für `src/main/{pty,jsonl,workspace,sessions,git,usage,templates,fs,settings}/...` und `src/main/{main,paths,logger}.ts`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

> **Behobene Befunde** sind ins Archiv ausgelagert: [`archiv/ARCHIV_MAIN_SERVICES.md`](./archiv/ARCHIV_MAIN_SERVICES.md). Diese Datei führt nur noch die **offenen** Punkte.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md). Pro Eintrag: Datei:Zeile, Kategorie, Beschreibung, Begründung, optional Trigger.

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

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (Auto-Update-Pipeline + ProjectFilesWatcher + 5h-Session-Block-Bugfix), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `electron-updater`-Listener-Stapel bei `setFeedURL`-Fehler

- `src/main/updater/auto-updater.ts:78-83` · Kategorie: **Bug** (latent)
- **Beschreibung:** Wenn `setFeedURL` wirft, kippt der Wrapper auf `error` und kehrt aus `initialize()` zurück — aber `initialized` wurde schon auf `true` gesetzt (Zeile 59). Ein späteres erneutes `initialize()` (theoretisch möglich, da der Pfad öffentlich ist) macht no-op, obwohl keine `on()`-Listener registriert wurden → keine Update-Events werden je gemeldet, Banner bleibt stumm.
- **Begründung:** `initialize()` wird aktuell nur einmal in `main.ts:314` gerufen — kein heutiger Defekt. Saubere Fix-Variante: `initialized=true` erst nach erfolgreichem Listener-Setup setzen, oder den `error`-State ohne `initialized=true` melden.
- **Trigger:** wenn das Updater-Setup jemals einen zweiten Trigger-Pfad bekommt (z.B. „User klickt Re-Check nach Netzwerk-Wiederherstellung") — dann den Init-Guard vor dem Listener-Setup justieren.

### `changedFilesAgainst` schluckt `git.status()`-Fehler ohne Log

- `src/main/git/driver.ts:205-211` · Kategorie: **Verbesserung**
- **Beschreibung:** Catch-Block leer, kein Log. Der bewusste Fallback ist okay (Diff-Liste reicht), aber bei wiederkehrenden Status-Fehlern (z.B. Lock-File-Conflict) fliegt der Hinweis unsichtbar weg. Der `diff`-Catch oben (Zeile 169, 186) ist ebenfalls stumm, dort aber explizit als „mapping bleibt leer" begründet.
- **Begründung:** Optional einen `log.warn` einsetzen, sobald der Driver einen Logger bekommt. Aktuell keine Logger-Injection im Git-Driver — eine eigene kleine Mini-Season-Aufgabe.
- **Trigger:** wenn ein User-Report „Diff-Liste ist plötzlich leer trotz lokaler Changes" auftaucht — dann den Logger-Hook einziehen und die zwei Catches loggen lassen.

### chokidar `ignored`-Predicate ohne Stat-Argument

- `src/main/fs/project-watcher.ts:110` · Kategorie: **Verbesserung**
- **Beschreibung:** `ignored: (p) => isSkippedPath(p, projectPath)` läuft auf **jeden** Pfad inkl. Files. `isSkippedPath` segmentiert den Relativpfad und prüft die `PROJECT_WATCH_SKIP_DIRS`-Set. Korrekt, aber bei tiefen Trees (Projekte mit vielen Dateien außerhalb der Skip-Dirs) wird die Funktion sehr oft aufgerufen. `path.relative` + `split` pro Aufruf ist nicht trivial.
- **Begründung:** Da `ignoreInitial: true` gesetzt ist, betrifft das nur Live-Events nach Boot — also faktisch egal. Kein Bug; reine Performance-Beobachtung.
- **Trigger:** wenn ein User „Initial-Scan / Watcher dauert lange auf großem Repo" meldet — dann auf einen pre-segmentierten Skip-Check umstellen (z.B. nur Top-Level-Segment vergleichen).

---

## Code-Review Core 2026-05-31

Befunde aus dem Core-Review (= Main-Services-Scope), die bewusst nicht gefixt werden. Der einzige actionable Befund (V1: `backfilledPaths.clear()` in `JsonlWatcher.stop()`) wurde direkt umgesetzt und steht nicht hier.

### Pass-2 Session↔File-Pairing rein positionsbasiert über mtime

- `src/main/jsonl/backfill.ts:160-166` · Kategorie: **Verbesserung**
- **Beschreibung:** Pass-2 paart Sessions (`started_at` ASC) gegen Files (`mtimeMs` ASC) rein positionsbasiert. Bei NTFS-mtime-Granularität oder kopierten/berührten Files kann die mtime-Reihenfolge von der echten Session-Chronologie abweichen → Fehlpaarung.
- **Begründung:** Die Limitation ist im Datei-Header als „dokumentiert im SEASON_LOG" erwähnt — bewusste Heuristik, kein Bug. Keine Aktion, solange die SEASON_LOG-Notiz die Heuristik abdeckt.
- **Trigger:** wenn ein User-Report „Session X zeigt die Token/JSONL einer anderen Session" auftaucht — dann ein robusteres Pairing-Kriterium als reine mtime-Position einziehen.

### `idle`-Zweig im State-Detection-Loop faktisch tot

- `src/main/db/repos/messages.ts:247-257` + `src/main/sessions/state-detection-loop.ts:108-111` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Einziger `messages.insert`-Aufrufer (`jsonl/watcher.ts:174`) schreibt nur `role:'assistant'`, daher liefert `lastRoleForSession` für jede getrackte Session immer `'assistant'`. Der `idle`-Zweig `next = lastRole === 'assistant' ? 'waiting' : 'idle'` erreicht den `'idle'`-Fall damit praktisch nie.
- **Begründung:** Im Code als „selten"/„S-3-Kopplung" bewusst dokumentiert — faktisch toter Pfad, kein Defekt. Eine Verschlankung würde die Symmetrie der Transition-Logik aufgeben.
- **Trigger:** wenn ein zweiter `messages.insert`-Aufrufer mit `role:'user'` dazukommt (oder User-Messages getrackt werden) — dann den `idle`-Zweig real prüfen oder den toten Pfad entfernen.

### `app.on('ready')`-Block ohne Single-Instance-Guard

- `src/main/main.ts:604-645` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der `app.on('ready', …)`-Block (Permission-/CSP-Handler) ist — anders als der `whenReady`-Block (Guard bei `:167` über `gotSingleInstanceLock`) — nicht durch den Single-Instance-Lock geschützt.
- **Begründung:** Eine zweite Instanz, die den Lock nicht bekommt, ruft `app.quit()` und erreicht `ready` normalerweise gar nicht mehr → kein realer Defekt, nur Konsistenz-Asymmetrie.
- **Trigger:** wenn der Single-Instance-Pfad umgebaut wird (z.B. „zweite Instanz übergibt Argv an die erste, statt zu quitten") — dann beide ready-Pfade unter denselben Guard ziehen.
