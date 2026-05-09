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

## Crash-Recovery für orphane running-Sessions fehlt

**Bereich:** `src/main/main.ts` (`app.whenReady()`), `src/main/sessions/lifecycle.ts`

**Was:** Sprint 3 deckt nur den geordneten App-Quit ab (`before-quit` patcht running → interrupted, *dann* killAll). Bei Hard-Crash (Strom weg, Task-Manager-Kill, OOM, Electron-Renderer-Crash mit Main-Mitnahme) bleibt eine Session in der DB mit `status='running'` und `ended_at IS NULL` zurück. Beim nächsten App-Start würde Sprint 6 (Verlauf-Panel) sie fälschlich als „läuft" anzeigen, obwohl der zugehörige claude-Prozess längst tot ist.

**Warum so:** Variante C aus dem Sprint-3-Briefing („Reconciliation beim nächsten App-Start") wurde vom User explizit auf Sprint 8 (Polish/Error-Handling) verschoben. In Sprint 3 zeigt die UI ohnehin nur Live-Tabs, nie historische Sessions — der Bug ist sichtbar erst ab Sprint 6.

**Risiko:** Wer zwischen Sprint 3 und Sprint 8 die App durch Hard-Crash verliert, hat Karteileichen in der DB. Sprint 6 (Verlauf-Panel) würde sie als „running" zeigen — kein technischer Schaden, nur UI-Verwirrung. Wenn vor Sprint 6 jemand direkt in die DB schaut: dasselbe.

**Auflösung:** In `app.whenReady()` nach `openDatabase()` einen Reconciliation-Pass: über `sessions.listByStatus('running')` iterieren, alle Rows mit `ended_at IS NULL` auf `interrupted` patchen (`ended_at = now()` als Approximation, weil der Crash-Zeitpunkt nicht bekannt ist). Das Lifecycle-API existiert seit Sprint 3 und akzeptiert `running → interrupted`. Test-Idee: Session per Repo direkt mit `status='running' / ended_at=null` einfügen, App-Start-Reconciliation laufen lassen, Status auf `interrupted` und `ended_at` gesetzt erwarten.

---

## Notes-Auto-Save bei Hard-Quit best-effort

**Bereich:** `src/renderer/components/NotesFooter.tsx`, `window.beforeunload`-Handler

**Was:** Der `beforeunload`-Flush des Notes-Savers ist fire-and-forget — `window.api.sessions.update(...)` ist ein `invoke()`-Promise, der oft nicht mehr aufgelöst wird, bevor der Renderer-Prozess stirbt. Der Main-Prozess empfängt das IPC-Paket meist noch und schreibt synchron in die DB (better-sqlite3 ist sync), aber es gibt keine Garantie. Worst-Case-Verlust: 0–500 ms Tipps bei Strom weg, Task-Manager-Kill oder OOM.

**Warum so:** Synchroner IPC (`ipcRenderer.sendSync`) wäre die korrekte Lösung, ist aber nicht in der typed-bridge-API exponiert und müsste eigenständig durch die contextBridge geschleust werden. Für Sprint 3 nicht den Aufwand wert — der Verlust ist klein, der Trigger selten.

**Risiko:** Bei Strom weg während aktivem Tippen verliert der User die letzten 0–500 ms Tipps. Bei normalem App-Schließen oder Tab-Wechsel passiert das nicht (onUnmount/onBlur flushen synchron via invoke, das im geordneten Shutdown durchläuft).

**Auflösung:** Wenn das Schmerz wird, einen `notes:flushSync`-Channel im Preload via `ipcRenderer.sendSync` exponieren und im `beforeunload`-Handler nutzen. Sprint 8 (Settings-Dialog + Error-Handling) ist ein guter Slot, wenn die Datenpfade ohnehin angefasst werden. Bis dahin: Aufmerksamkeit beim Tippen während instabiler Stromversorgung.

---

## Default-Project als FK-Lifeline für Sprint 2

**Bereich:** `src/main/db/repos/projects.ts`, beim App-Start in `src/main/main.ts`

**Was:** Beim App-Start wird ein einzelner Project-Row mit stabiler UUID `00000000-0000-0000-0000-000000000001`, name `__default__` und `path = settings.workspace_path` in `projects` eingefügt. Alle Sessions in Sprint 2 hängen an genau diesem Project, weil `sessions.project_id` ein NOT-NULL-FK ist und der Workspace-Scanner aus Sprint 4 noch nicht existiert.

**Warum so:** Sprint 2 braucht eine lauffähige Session-DB, ohne Sprint 4 vorzuziehen. Workspace-Scanning + Project-Erkennung ist eine größere Bereich (rekursiver Scan, CLAUDE.md-Parser, Add-Project-Dialog) — das im PTY-Sprint mitzuziehen würde den Scope sprengen und das Risiko, in einem Spawn-Bug stecken zu bleiben, wachsen lassen.

**Risiko:** Wenn Sprint 4 Projekte nach `path` einliest und unser Default-Project mit `path = workspace_path` (ein *Verzeichnis-Container*, kein echtes Projekt) kollidiert, könnten doppelte Rows oder UNIQUE-Verstöße entstehen. Außerdem hängen alle Sprint-2-Sessions an einer ID, die später eventuell „migriert" werden müsste, falls der User die Sessions in echte Projekte überführen will.

**Auflösung:** Sprint 4 erkennt den Default-Project per stabiler UUID und entscheidet pro Session: entweder dem zur `cwd` passenden gescannten Project zuweisen oder als „Sprint-2-Legacy"-Bucket beibehalten. Das Konstrukt ist bewusst klein gehalten (eine Datei, 25 Zeilen), damit der Ausbau lokal bleibt.

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
