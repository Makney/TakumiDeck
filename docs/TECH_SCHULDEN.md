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
