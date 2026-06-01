# Code-Review · IPC-Handler · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_IPC.md`](../OFFEN_IPC.md) — Status **Behoben** oder **Gegenstandslos**.

---

## Tooling-Hypothesen aus dem Fallow-Vor-Pass (verifiziert: bereits aufgelöst, Bereichs-Review 2026-05-12)

Die im Auftrag genannten Fallow-Hypothesen sind im Code bereits adressiert — dokumentarisch festgehalten, damit der nächste Review-Durchgang das nicht erneut nachzieht:

- `fs.ts:82-95` ↔ `fs.ts:155-167` (fs:read ↔ fs:write Project-Lookup + Anti-Traversal) → konsolidiert in `resolveValidatedProjectPath` (`src/main/ipc/fs.ts:192`). Inline-Kommentar verweist auf B-4/W-2.
- `pty.ts:132-146` ↔ `session.ts:154-164` (PtyManager-Spawn-Args) → die echte Duplikat-Stelle ist der Pre-Spawn-Check (Binary-Lookup + cwd-Existenz), nicht die Spawn-Args selbst. Konsolidiert in `src/main/pty/preSpawnCheck.ts`, beide Handler nutzen den Helper (W-1).
- Komplexitäts-Hotspots `session.ts:93` (Cyclo 11), `project.ts:64` (Cyclo 10), `app.ts:62` (Cyclo 8), `pty.ts:59` (Cyclo 8), `session.ts:62` (Cyclo 7): jede dieser Funktionen ist ein IPC-Handler, der eine echte Multi-Schritt-Orchestrierung (zod-Parse → DB-Lookup → State-Machine → Side-Effect → Result-Wrap) machen muss. Sender-Guard, zod-Parse und try/catch tragen pro Handler zwingend ~6 Branches bei. Der Pfad ist nicht produktiv aufteilbar, ohne den Lese-Fluss zu zersplittern — keine Refactoring-Aktion.

Ungenutzte Cross-Schemas aus Bereich 1 (`SessionUpdatePatchSchema`, `ClaudeMdOnDemandFileSchema`, `JsonlUsageSchema`, `SessionTypeSchema`, `SessionStatusSchema`): verifiziert — alle sind als interne Schema-Bestandteile in `src/shared/schemas.ts` referenziert (Composition aus dem Patch-Schema, dem OnDemand-Union-Member, dem JSONL-Outer-Schema bzw. den Filter-Listen). Keine Stelle, an der ein Handler ohne Validation gegen ein passendes Schema arbeitet.

---

## Bereichs-Review IPC (2026-05-31) — sofort behoben

Befunde aus dem vollständigen IPC-Layer-Review (alle 15 Handler), die im selben Durchgang gefixt wurden. Die bewusst offen gebliebenen DbC-Punkte (D-1 `models:fetch-available`, D-2 `terminal:save-buffer`-Größen-Cap) stehen in [`../OFFEN_IPC.md`](../OFFEN_IPC.md).

- **W-1 · `pty:write` ohne Teardown-Guard** (`src/main/ipc/pty.ts`): `manager.write` lief vor jedem Existenz-Check; ein letzter Keystroke nach PTY-Exit (Tab-Close vor `pty:exit`) ließ `requireHandle` werfen → `PTY_WRITE`-Error an den fire-and-forget-Renderer. **Fix:** `if (!manager.has(sessionId)) return ok(null)` vor dem Write — Teardown-Race wird still verworfen.
- **V-1 · Bracketed-Paste-Regex pro Keystroke** (`src/main/ipc/pty.ts`): der `\x1b[200~…\x1b[201~`-Strip-Regex (`[\s\S]*?`) lief bei jedem Tastendruck über den gesamten Input, bei MB-Pastes teuer. **Fix:** billiger `includes('\x1b[200~')`-Vorcheck überspringt den Regex im Normalfall (einzelne Taste).
- **V-2 · `pty:resize` / `pty:kill` ohne Existenz-Check** (`src/main/ipc/pty.ts`): beide reichten die `sessionId` direkt an `manager.*` durch, das via `requireHandle` bei entferntem PTY warf. **Fix:** je `manager.has()`-Guard mit stillem `ok(null)`, konsistent zu W-1.
- **V-3 · `projectId`-Nullish-Semantik undokumentiert** (`src/main/ipc/stats.ts`): in der stats-Domain heißt `projectId ?? null` *projektübergreifend*, anders als bei `fs:*`/`git:*` (dort `PROJECT_NOT_FOUND`). **Fix:** Konventions-Kommentar im Modul-Header, damit künftige stats-Channels die Semantik beibehalten.

Verifiziert read-only-folgenfrei: alle Renderer-Aufrufe (`window.api.pty.write/resize`) sind fire-and-forget, `pty.kill` wird vom Renderer nicht aufgerufen — throw→stilles `ok(null)` hat keine Renderer-sichtbare Regression. typecheck + lint + `pty-manager.test.ts` (10 Tests) grün.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_IPC.md`](../OFFEN_IPC.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### `pty:create` setzt `start_commit_sha` race-frei via WHERE-IS-NULL, Kommentar fehlt

- `src/main/ipc/pty.ts:212-213` · Kategorie: **Verbesserung-Doku**
- **Beschreibung:** Das fire-and-forget `gitDriver.revParse(...).then(...).catch(...)` kann nach Session-Archive/Close auflaufen. `setStartCommitSha` hat `WHERE start_commit_sha IS NULL` (siehe Driver `src/main/db/repos/sessions.ts:552-555`) und ist deshalb idempotent + race-frei. Der Handler-Kommentar in `pty.ts:212-213` erwähnt aber nur die Spawn-Wahl, nicht die Race-Behandlung — beim nächsten Touch würde jemand eventuell einen `lifecycle.isShuttingDown()`-Check ergänzen wollen, der bei Bestandscode nicht nötig ist.
- **Begründung:** Inline-Kommentar um „WHERE-Klausel-Idempotenz schützt vor Session-Archive-Race" ergänzen. Kein Code-Fix nötig.
- **Trigger:** nächste Änderung am PTY-Spawn-Pfad (z.B. bei der in Phase 2 geparkten Terminal-Session-ohne-Claude-Karte) — dann den Kommentar mit-anziehen.
- **Behoben:** 2026-06-01 · Inline-Kommentar ergänzt · Im Baseline-SHA-Block in `pty.ts` dokumentiert, dass `setStartCommitSha` via `WHERE start_commit_sha IS NULL` idempotent + race-frei gegen Session-Archive ist und kein `isShuttingDown()`-Check nötig ist; kein Code-Fix.

---

### `fs:set-watched-project` log-frei, andere fs:*-Handler loggen Ergebnis-Bilanz

- `src/main/ipc/fs.ts:278-309` · Kategorie: **Stil**
- **Beschreibung:** Kein `log.info`-Eintrag bei Watcher-Wechsel/Stop. `fs:list-templates` und `fs:clear-screenshots` loggen ihre Ergebnis-Bilanz; der ProjectFilesWatcher loggt zwar selbst `[project-watcher] ready/gestoppt`, aber der IPC-Eintrittspunkt bleibt im Main-Log unsichtbar (z.B. bei stillem Fail-Path Renderer-Race vs Watcher-Setup).
- **Begründung:** Später ein `log.info('[fs:set-watched-project] projectId=...')` ergänzen — reine Diagnose-Konsistenz.
- **Trigger:** wenn ein User-Report „Auto-Refresh feuert nicht trotz aktivem Projekt" auftaucht — dann den Einstiegs-Log zur Diagnose nutzen.
- **Behoben:** 2026-06-01 · Eintrittspunkt-Log ergänzt · `log.info('[fs:set-watched-project] projectId=…')` direkt nach der zod-Parse eingefügt (null = Stop-Signal sichtbar); reine Diagnose-Konsistenz zu den anderen fs:*-Handlern; typecheck + lint grün.

---

### `terminal:save-buffer` loggt bei Fehler nicht, `terminal:load-buffer` schon (Asymmetrie)

- `src/main/ipc/terminal-buffer.ts` (Save-Catch vs. Load-Catch) · Kategorie: **Stil**
- **Beschreibung:** Der Load-Catch macht `log.warn(...)` vor `errFromUnknown`, der Save-Catch nicht. Ein Save-Fail (z.B. zod-Reject bei >1 MiB Snapshot oder DB-Lock) verschwindet still im IpcResult ohne Main-Log-Spur.
- **Begründung:** Symmetrisch ein `log.warn` im Save-Catch ergänzen — reine Diagnose-Konsistenz.
- **Trigger:** wenn ein User-Report „Terminal-Verlauf wird nach Resume nicht angezeigt" auftaucht — dann den Save-Log zur Diagnose nutzen.
- **Behoben:** 2026-06-01 · Log-Asymmetrie behoben · `log.warn('[terminal:save-buffer] fehlgeschlagen: …')` im Save-Catch ergänzt, symmetrisch zum load-buffer-Catch; 7 terminal-buffer-Tests + lint grün.
