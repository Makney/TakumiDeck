# Design-Entscheidungen

Dieses Dokument hält die **Warum-Entscheidungen** fest, nicht die Was-Entscheidungen. Wenn jemand (auch das zukünftige Ich in einer neuen Session) fragt *„warum haben wir damals nicht einfach …?"*, dann steht es hier.

## Wann kommt ein Eintrag hier rein?

- Scope- oder Architektur-Frage mit **mehreren sinnvollen Lösungen**.
- Entscheidung für eine Variante, die **später hinterfragt werden könnte**.
- Bewusst offen gelassene Baustellen, damit sie nicht als „vergessen" wirken.

**Nicht** hier rein: triviale Umsetzungsdetails, Bugfixes ohne Design-Anteil, kurzfristige Präferenzen.

## Format pro Eintrag

- Eine `##`-Überschrift mit prägnantem Titel.
- Abschnitte in dieser Reihenfolge:
  - **Entscheidung:** der gewählte Weg, 1–2 Sätze.
  - **Varianten:** A / B / C mit Kernmerkmal, markiert welche gewählt wurde.
  - **Grund:** *warum* A gewinnt — oder warum B/C disqualifiziert sind.
  - **Konsequenz:** was das für zukünftige Arbeit bedeutet (kein Boilerplate — nur wenn relevant).
  - Optional **Implementierungsdetail:** wenn die Umsetzung selbst eine Wahl war (z.B. Whitelist statt Blacklist).

Neue Einträge wandern **oben** an (neuster zuerst). Keine Daten in den Titel — der Titel ist thematisch, das Datum steckt implizit in der Git-History.

---

## Season-Counter: dynamisch aus sessions.season_number statt separater Spalte

**Entscheidung:** Die nächste Season-Nummer eines Projekts wird zur Lesezeit als `COALESCE(MAX(sessions.season_number), 0) + 1` aus der `sessions`-Tabelle abgeleitet — und beim Templates-Send mit `{{NEXT_SEASON_NR}}` atomar auf die aktive Session geschrieben. Die ursprüngliche `projects.next_season_number`-Spalte (Sprint 6) ist damit dead-code und wird im Schema nur noch aus Backwards-Kompatibilität mit Default `1` befüllt.

**Varianten:**

- **A** DB-Wert einmalig per SQL korrigieren (`UPDATE projects SET next_season_number = N`). Pflasterfix; der ursprüngliche Drift-Mechanismus bleibt — der Counter geht beim nächsten Templates-Send-Workflow erneut auseinander.
- **B** Counter dynamisch aus `sessions.season_number` ableiten + Templates-Send alloziert und persistiert die Nummer auf der aktiven Session (gewählt). Robust gegen Drift, weil der "Verbrauch" der Nummer und ihre persistente Spur (die `sessions`-Row) zusammenfallen.
- **C** `docs/SEASON_LOG.md` als Source of Truth, Markdown-Parser auf den Allokations-Pfad. Käme der Roadmap-Realität am nächsten, weil "Season" eigentlich ein Doku-Konzept ist und nicht an PTY-Spawns gekoppelt sein muss — koppelt aber den IPC-Allokations-Pfad an einen Datei-Parser, der bei kaputter `SEASON_LOG.md`-Section silent failed wäre.

**Grund:** Der ursprüngliche Bug entstand, weil die Sprint-6-Spalte nur entlang eines Allokations-Pfads (`pty:create` mit `type='feature'`) hochgezählt wurde. Im realen Daily-Use läuft eine Season aber häufig per Templates-Send in eine bestehende Session — und dieser Pfad bumpte den Counter nicht. A fixt das Symptom, nicht die Ursache. C ist zu groß für den Nutzen: ein Markdown-Parser am Allokations-Pfad braucht eigene Fehler-Modi (was passiert bei kaputter Section?), und die Doku-Datei wäre dann implizit Schema. B koppelt die Daten-Realität (eine Session mit `season_number = N`) an die Anzeige der nächsten Nummer — keine zweite Wahrheit, kein Drift möglich. Der atomare UPDATE-Pfad beim Templates-Send (`SessionRepository.assignSeasonNumber`) ist idempotent: ein zweiter Send in dieselbe Session liefert dieselbe Nummer zurück, kein zufälliges Hochzählen.

**Konsequenz:** Sessions ohne `season_number` (Bug/Custom/Review/Resume und alle pre-Patch-Templates-Send-Sessions) tauchen im neuen MAX nicht auf — der Counter spiegelt nur Feature-Sessions, die als solche markiert sind. Für Projekte mit historisch gemischten Allokations-Pfaden bedeutet das: der erste Allocate nach dem Fix kann tiefer einsteigen als die git-Realität (Beispiel TakumiDeck: git-Commits zeigen Season 10, MAX in der DB steht bei Season 7, der nächste Allocate liefert 8). Die Lücken füllen sich automatisch über die nächsten Templates-Sends. Eine einmalige SQL-Korrektur (`UPDATE sessions SET season_number = N WHERE id = '<latest>'`) springt direkt auf den richtigen Wert, ist aber kein Pflicht-Schritt. `projects.next_season_number` bleibt im Schema, wird beim Project-Insert default `1` gesetzt und nirgends mehr ausgelesen — dokumentiert als TECH_SCHULDEN-Eintrag (Drop in einer zukünftigen Migration).

**Implementierungsdetail:** `ProjectDbDriver.allocateSeasonNumber` ist jetzt eine reine SELECT-Operation (keine Transaktion mehr), weil der eigentliche „Verbrauch" der Nummer erst beim Session-Insert (`pty:create`) bzw. UPDATE (`assignSeasonNumber`) passiert. Better-sqlite3 ist synchron und der Electron-Main-Prozess single-threaded — zwei Allokationen werden zwangsweise serialisiert, ein Race-Fenster gibt es nicht. Die korrelierte Subquery im `PROJECT_SELECT_WITH_COUNT` (`COALESCE(...) + 1`) wirkt pro Project-Row; bei Listen-Reads (`listAll`) ist das ein Subquery-pro-Projekt, was bei der realen Projekt-Anzahl (<50 in jedem realistischen Setup) vernachlässigbar bleibt.

---

## Frontmatter-Refetch beim Modal-Open statt CLAUDE.md-Watcher

**Entscheidung:** Das CLAUDE.md-Frontmatter (im Renderer-Store `useUiStore.activeProjectFrontmatter`) wird beim Mount des `TemplatesModal` und `PreCommitModal` per `loadActiveProjectFrontmatter(project.id)` neu gelesen — nicht über einen kontinuierlich laufenden Watcher.

**Varianten:**

- **A** Refetch beim Modal-Open (gewählt). Minimale Diff: zwei `useEffect`-Hooks in den Modals, kein neuer Watcher-Lifecycle, kein zusätzlicher IPC-Push-Channel.
- **B** chokidar-Watcher auf der CLAUDE.md des aktiven Projekts, Push-Event an den Renderer bei Änderung. Robuster gegen externe Edits in dem Sinn, dass ActionBar-Trigger-Pills und EditorPane mit-aktualisiert würden, ohne dass der User ein Modal öffnen muss.

**Grund:** Der reale Schmerzpunkt ist „ich habe CLAUDE.md geändert und das Template zeigt noch die alte Phase" — und der Pfad zum Template-Senden geht zwangsweise durch den Modal-Open. A deckt diesen Pfad zuverlässig ab. B würde zusätzlich die Live-Anzeige in ActionBar/EditorPane synchron halten, aber dort hat das Frontmatter im Daily-Use weniger Sichtbarkeit (Trigger-Pills sind primär `commit` und `docs_update`-Phrasen, deren Wechsel sehr selten ist; EditorPane zeigt den Body, nicht das Frontmatter). Der Watcher-Lifecycle (Setup beim Projekt-Wechsel, Cleanup beim Schließen, chokidar-`awaitWriteFinish`-Tuning, Re-Entry beim Datei-Lösch-und-Neu-Anlegen) ist ein eigenes Stück Infrastruktur — Aufwand-Nutzen ist hier ungünstig.

**Konsequenz:** Frontmatter-Stale-Cache greift nur noch, wenn der User CLAUDE.md ändert UND danach kein Modal öffnet (= keine Templates-Send, kein PreCommit). In diesem Edge-Case bleibt der `effectiveDefaultModel`-Hint in der ActionBar oder die Trigger-Phrasen-Pille stale bis zum nächsten Project-Switch oder App-Neustart. Akzeptierte Lücke — der Daily-Use-Pfad (CLAUDE.md ändern → Templates senden) ist gefixt. Bei Bedarf nachrüstbar (Watcher) ohne Schema-Brüche, die Refetch-Logik bleibt unter dem Watcher.

---

## Modell-Filter im Verlauf-Panel: current_model statt Join über messages.model

**Entscheidung:** Die neue Modell-Filter-Pillen-Reihe im Verlauf-Panel filtert auf `sessions.current_model` (Single-Column-`IN(...)`-WHERE), nicht auf eine `EXISTS`-Subquery über `messages.model`. Sessions tauchen unter genau einem Modell auf — dem, mit dem sie zuletzt liefen. Das aggregierte „welche Modelle wurden in dieser Session benutzt"-Bild lebt separat im Detail-Pane-Block „Modelle".

**Varianten:**

- **A** Filter auf `sessions.current_model` (gewählt). Triviale SQL-Erweiterung im bestehenden `sessionsHistory`-Statement-Cache, Cache-Key um `modelsLen` erweitert, eine `IN (?, ?, ...)`-Klausel. Sessions kommen in der Liste genau einmal vor.
- **B** Filter via `EXISTS (SELECT 1 FROM messages WHERE session_id = s.id AND model IN (?))`. Eine Session mit Opus-Start und Sonnet-Wechsel tauchte dann in beiden Filter-Pillen auf — semantisch „irgendwann benutzt". Mächtiger, aber die Sessions-Liste verdoppelt sich gedanklich („warum sehe ich dieselbe Session in zwei Filtern?"), und der Join wäre auf der `messages`-Tabelle deutlich teurer.
- **C** Beide Modi via Toggle in der Filter-Bar („aktuell / je benutzt"). Maximale Flexibilität, kostet aber UI-Slot und ein neues Konzept, das im Verlauf-Panel sonst nirgends auftaucht — Over-Engineering für ein Pillen-Filter.

**Grund:** Der Daily-Use-Intent ist „zeig mir alle Sessions, die zuletzt mit Opus liefen" — A trifft das direkt. B verschiebt den Aggregat-Aspekt in den Filter, obwohl der Detail-Pane ohnehin die volle Modell-Aufschlüsselung der Session zeigt; doppelt Aggregat ist redundant. Die Modell-Spalte in der Tabellen-Anzeige zeigt sowieso `current_model` (eine Zelle pro Session) — Filter auf dieselbe Quelle hält die UI konsistent: was die Tabelle zeigt, lässt sich auch filtern. Variante B hätte einen Fall produziert, in dem die Tabelle Modell X zeigt, der Filter aber Modell Y matcht — verwirrend.

**Konsequenz:** Sessions ohne `current_model` (theoretisch möglich, in der Praxis nur bei kaputten Pre-Spawn-Sessions) sind nicht filterbar — sie tauchen weder bei aktiver noch bei inaktiver Pille auf, sondern nur im „kein Filter"-Zustand. Das ist ok, weil die Spalte real fast immer befüllt ist und der Workaround (Modell-Pille leer lassen) trivial ist. Die Modell-Liste in der UI ist eine statische 5er-Konstante (`MODEL_FILTER_OPTIONS`) — bewusst NICHT dynamisch aus den im Projekt vorkommenden Modellen. Dynamische Pillen, die je nach Projekt verschwinden/erscheinen, sind verwirrend; die fünf bekannten Modelle decken den Daily-Use ab und ein unbekannter Modell-ID-Wert bleibt in der Tabellen-Spalte sichtbar (Fallback auf rohen String), nur nicht im Filter — bewusste Beschränkung.

**Implementierungsdetail:** Statement-Cache-Key ist `t${typesLen}_s${statusesLen}_m${modelsLen}_q${hasQuery ? 1 : 0}` — Permutations-Raum ≤7×8×5×2 = 560, alle dauerhaft cacheable. Schema bleibt locker auf `z.string().min(1)` für die Modell-IDs (kein Enum-Bind an die fünf UI-Modelle), damit alte Sessions mit umbenannten Modell-IDs filterbar bleiben.

---

## Modell-Aggregat pro Session: aus messages.model statt Timeline-Tabelle oder initial_model

**Entscheidung:** Die im Detail-Pane angezeigte Modell-Aufschlüsselung („welche Modelle in dieser Session, wieviel je") ist eine reine Read-Aggregation aus `messages.model` (neu in Migration 0006), gerendert als kompakte Inline-Liste mit Counts. Kein zeitlicher Verlauf, keine separate Event-Tabelle, keine `initial_model`-Spalte.

**Varianten:**

- **A** Aus `messages.model` aggregieren (gewählt). `SELECT model, COUNT(*) GROUP BY model ORDER BY count DESC, model ASC`, eine zusätzliche Spalte auf der bestehenden messages-Tabelle, der Watcher schreibt das Feld pro Message mit. Antwortet auf „welche Modelle, wie viel pro Modell" — alles, was der Detail-Pane braucht.
- **B** Eigene Event-Tabelle `session_model_events(session_id, model, switched_at)` mit echtem Timeline-Logging. Würde „16:42 Opus → Sonnet (Slash-Befehl) · 17:15 Sonnet → Opus (Resume)" ermöglichen. Braucht aber dediziertes Switch-Event-Logging im Watcher und im Resume-Pfad, ein eigenes Schema plus Backfill für historische Daten — und die Timeline-Sicht ist im Detail-Pane gar nicht in der Spec.
- **C** Nur zwei Werte zeigen: `sessions.initial_model` (neue Spalte, beim Spawn gesetzt) und `current_model` (bestehend). Minimaler Schema-Change, aber liefert nur „Start vs. jetzt" — Sessions mit 5 Modell-Wechseln im Daily-Use sehen identisch zu Sessions mit einem Wechsel aus. Verliert den Mehrwert.

**Grund:** A passt zum tatsächlichen Need: der User will wissen, „wie hat sich der Modell-Mix in dieser Session zusammengesetzt", nicht „in welcher Reihenfolge". Die Count-Aggregation liefert implizit die Antwort „welches Modell dominierte" (= das mit höchstem Count) und „wurde überhaupt gewechselt" (= mehr als ein Eintrag). Daten-Quelle ist sowieso vorhanden — der JSONL-Parser liest `message.model` seit Sprint 5, nur der Watcher-Insert hatte das Feld bis Season 10 verworfen. B baut eine Parallel-Welt zur messages-Tabelle für einen Use-Case, der nicht in der Spec steht, und C verliert die Tiefe der Aufschlüsselung.

**Konsequenz:** Backfill für Pre-Migration-Messages nutzt `sessions.current_model` als Approximation (eine Session = ein Hint-Wert, historisch ungenau bei Modell-Wechsel). Dokumentiert als TECH_SCHULDEN-Eintrag — löst sich auf, sobald Pre-Migration-Sessions archiviert sind und neue Messages mit exaktem per-Message-Modell die Daten dominieren. Detail-Pane blendet den Block aus, wenn die Session genau ein Modell hat — der Single-Modell-Fall ist redundant zur Tabellen-Spalte, und ein Hide bei ≤1 Aggregat-Eintrag verhindert, dass der Detail-Pane mit „Modelle · Sonnet 4.6 · 47" eine Information doppelt zeigt, die schon in der Spalte steht.

**Implementierungsdetail:** Aggregat reist mit jedem `SessionHistoryEntry` im IPC-Response — Bulk-Query nach der History-Liste (`SELECT session_id, model, COUNT(*) ... WHERE session_id IN (?, ?, ...) GROUP BY session_id, model`) statt N+1. Statement-Cache pro IN-Listen-Länge analog zum sessionsHistory-Pattern. Alternative „separater IPC bei Klick auf Eintrag" wäre billiger im average-case, aber das Flackern beim Klicken (extra Round-Trip pro Selektion) ist im Daily-Use unangenehmer als die mit-gesendete Aggregat-Payload (≤5 Einträge pro Session = vernachlässigbar). `SessionRepository` bekommt das `MessageRepository` als optionale zweite Konstruktor-Dep — Bestands-Tests, die nur den Sessions-Repo brauchen, lassen den Parameter weg und sehen `models: []` (kein Detail-Aggregat).

---

## Kontext-Soft-Warning: Marker an der ctx-Bar + Tooltip statt Pille oder Toast

**Entscheidung:** Die persönliche Erfahrungsgrenze für die Per-Session-Kontext-Bar (Default 20 %, im Settings-Tab Token-Tracking konfigurierbar und per Toggle abschaltbar) wird als visueller Marker direkt an der `ctx`-Bar in der Action-Bar gerendert plus einer vierten, dezenten Tonungs-Stufe `soft` (gedämpfter `--td-blue`-Hinweis), sobald die Auslastung den Marker überholt. Der Hinweis-Text „Kontext über X % — Output-Qualität kann sinken" sitzt im `title`-Tooltip der Bar.

**Varianten:**

- **A** Marker an der Bar + soft-Tonung + Tooltip-Text (gewählt). Permanente Distanz-Anzeige zur Schwelle, Hinweis-Text on demand. Kein neuer UI-Slot, kein Layout-Sprung beim Überschreiten.
- **B** Eigene „⚠ Kontext > X %"-Pille unter der Action-Bar, sobald die Schwelle gerissen ist. Ohne Hover sichtbar, aber kein permanenter „wie weit weg"-Marker — User sieht nur „drüber/drunter". Layout springt im Moment des Überschreitens.
- **C** Einmaliger Toast unten rechts beim ersten Überschreiten pro Session. Maximal unaufdringlich, aber die explizit gewünschte Distanz-Anzeige fehlt komplett, und die Toast-Infrastruktur existiert noch nicht — Neu-Bau für ein dezentes Signal ist Overkill.

**Grund:** A liefert beides — die permanente Distanz-Anzeige (User-Wunsch: „Eine kleine Markierung wäre gut in der Leiste") UND den sanften Hinweis-Text — ohne Layout-Slot zu kosten und ohne neue UI-Infrastruktur. B verliert den Distanz-Aspekt, C dazu noch den permanenten Charakter. Der Marker selbst ist 2 px breit und ragt 2 px über und unter die 4-px-Bar hinaus (effektiv 8 px hoch); helles Off-White (`rgba(255,255,255,0.7)`) hält ihn auf jedem Fill-Ton sichtbar, `z-index: 1` über dem Fill macht ihn auch bei Überschreitung erkennbar. Erste Iteration mit 1 px Breite, gedämpftem Grau und ohne `z-index` war zu schwach — User-Feedback hat das direkt bestätigt, der Fix war eine reine CSS-Änderung (kein Schema-/Logik-Touch).

**Konsequenz:** Die Soft-Tonungs-Stufe `soft` ist eine eigene Vokabel neben Default / `warn` / `orange` / `red`. Sie sitzt absichtlich unter der Default-Yellow-Schwelle (User-Setting → bei Default 20 % vs. yellow 70 %); überschneidet sich also nicht mit dem etablierten Limit-Naehe-Alarm. Wenn jemand die Soft-Schwelle über die Yellow-Schwelle setzt, gewinnt immer die stärkere Tonung (`red > orange > warn > soft > Default`). Toggle = aus blendet Marker und Tonung komplett aus, die Yellow/Orange/Red-Logik bleibt unberührt — der User kann das Feature also einfach abschalten, falls es im Daily-Use stört, ohne andere Token-UI zu verlieren.

**Implementierungsdetail:** `overflow: hidden` auf `.td-ctx-bar` ist im Zuge der Marker-Sichtbarkeit weggefallen, damit der Marker oben/unten überstehen darf. Der Fill bekommt jetzt selbst `border-radius: 1px` (Inner-Radius < Outer-Radius), damit die abgerundeten Bar-Ecken visuell weiter sauber bleiben — gleicher Effekt wie zuvor mit `overflow: hidden`, aber ohne den Marker mitzuclippen. Marker-Triggered-Zustand markiert nur ein zusätzlicher blauer Halo via `box-shadow` — die Kern-Farbe bleibt neutral, weil der Marker eine *Position* markieren soll, nicht selber ein Alarm-Signal sein. Soft-Tonung selbst übernimmt das Alarm-Signal über die Fill-Farbe.

---

## JSONL-Watcher-Resolver: UUID-First mit cwd-Fallback statt nur cwd-Match

**Entscheidung:** Der JSONL-Watcher mappt Events primär über die claude-eigene Session-UUID aus dem JSONL-Dateinamen gegen `sessions.claude_session_id` und greift nur dann auf den bestehenden cwd-Encoded-Match auf `running`/`idle`-Sessions zurück, wenn für die UUID keine TakumiDeck-Session bekannt ist. Die Resolver-Logik ist als pure Funktion `resolveJsonlToSession(filePath, deps)` aus dem `JsonlWatcher` extrahiert; die `private`-Methode wickelt sie nur noch in die Repo-Calls ein.

**Varianten:**

- **A** UUID-First-Match mit cwd-Fallback (gewählt). Deterministisch, status-agnostisch, unabhängig vom aktiven Tab.
- **B** Aktive Session als „Hint" aus dem Renderer an den Watcher schicken; bei Ambiguität bevorzugt der Watcher die Hint-Session. Hätte einen neuen IPC-Channel plus Coupling UI-State ↔ JSONL-Pipeline gefordert — verletzt die Sprint-5-Architektur (Watcher kennt UI nicht), und ein Tab-Wechsel mitten in einem JSONL-Write erzeugt Race-Conditions.
- **C** Mapping-Cache `filePath → sessionId` im Watcher, befüllt vom ersten Match (egal welcher Heuristik); Folge-Events lesen aus dem Cache. Macht den ersten Match permanent — ein Fehl-Match (jüngste-Session-Heuristik liegt daneben) wird damit dauerhaft verewigt.

**Grund:** A nutzt eine Datenverbindung, die im System bereits existiert: `claude_session_id` wird seit Sprint-6-Hotfix beim `pty:create` direkt befüllt (`--session-id <id>`) und vom Backfill-Pfad im Watcher (`backfillClaudeSessionId`) für Legacy-Sessions nachgeholt — sie ist also für 99 % der laufenden Sessions sofort verfügbar, und der Backfill-Pfad räumt den Rest auf, sobald der Watcher die JSONL einmal gesehen hat. Damit ist das Mapping JSONL-Datei → TakumiDeck-Session 1:1 und deterministisch. Die alte cwd-Match-Heuristik („gewinne die `started_at`-jüngste Session im selben Projekt-Pfad") war ein Sprint-5-Provisorium, das funktionierte solange nur eine Session pro Projekt gleichzeitig lief — sobald mehrere Tabs im selben Pfad laufen (mehrere Seasons parallel), spiegelte die Per-Session-Kontext-Anzeige fremde Tokens in den aktiven Tab. Variante B verschiebt das Problem nur auf eine andere Kopplungs-Achse und bricht die Architektur-Trennung; Variante C konserviert das alte Falsch-Match-Risiko statt es zu eliminieren.

**Konsequenz:** Der cwd-Fallback bleibt erhalten und ist der einzige Pfad für „externe" Sessions, die claude ohne TakumiDeck geschrieben hat (kein Spawn-IPC durchlaufen, kein Backfill noch nicht angefasst). Das ist genau der ursprüngliche Use-Case der Heuristik aus Sprint 5 und schadet nicht — er greift nur, wenn der UUID-Lookup leer zurückkommt. Status-Filter beim Fallback bleibt `running` + `idle` (Live-Tracking-Pfad), beim UUID-Match dagegen status-agnostisch — so trifft auch ein Token-Push während einer resumed-completed-Session die richtige Session.

**Implementierungsdetail:** `findByClaudeSessionId` ist eine neue Repo-Methode mit SQLite-`ORDER BY started_at DESC LIMIT 1`-Statement (Tie-Break auf die jüngste, falls per Konstruktion mal zwei Sessions dieselbe UUID hätten — sollte nie passieren, aber Defense-in-Depth) und einer entsprechenden InMemory-Driver-Implementierung für Tests. Die Resolver-Logik ist als pure Funktion mit injizierten Repo-Methoden (`findByClaudeSessionId`, `listByStatus`) testbar — `tests/main/jsonl-resolver.test.ts` deckt sieben Fälle ab (UUID-Win-gegen-juengste-cwd-Session, Status-Agnostik, Fallback-Aktivierung, Tie-Break im Fallback, Non-UUID-Filename, leere Kandidaten).

---

## Projekt entfernen: Hover-Trash + Modal statt Kontextmenü, Hard-Delete + Bulk-Remap statt Soft-Archive

**Entscheidung:** „Projekt aus Liste entfernen" wird durch ein Hover-Trash-Icon im Sidebar-Eintrag getriggert und durch ein eigenes Bestätigungs-Modal mit Doppel-Confirm vollzogen. Server-seitig löscht der neue IPC `project:remove` die `projects`-Row tatsächlich (kein `archived`-Flag) und hängt vorher alle Sessions und ihre `messages`-Rows in einer better-sqlite3-Transaction auf den Default-Bucket um.

**Varianten (UI-Trigger):**

- **A** Hover-Trash-Icon im Sidebar-Eintrag + Modal (gewählt). Aktion ist beim Hovern entdeckbar, der Modal-Body hat Platz für den vollen Hinweis-Text („Sessions und Verlauf bleiben erhalten und wandern in den Legacy-Bucket"). Default-Bucket bekommt kein Icon.
- **B** Rechtsklick-Kontextmenü + Inline-Confirmation. Sehr leise UI, aber Rechtsklick als Trigger existiert bisher nicht im Renderer — neue Infrastruktur (Custom-Menü mit Click-Outside-Close, Tastatur-Handling, Viewport-Bounding) für eine seltene Aktion, und der Hinweis-Text passt nicht ins Menü.
- **C** Hover-Trash **und** Rechtsklick (beide öffnen das Modal). Maximal entdeckbar, aber zwei UI-Pfade ohne Wiederverwendungs-Hebel und neue Menu-Infra-Auslöser.

**Varianten (Datenpfad):**

- **D** Hard-Delete + Bulk-Reassign-Transaction (gewählt). Sessions wandern serverseitig auf den Default-Bucket, dann `DELETE FROM projects`. Ein UPDATE pro Tabelle, kein Per-Session-Loop — der Sprint-4-Remap iteriert pro Session, weil die cwd-Match-Logik dort pro Session entscheidet; hier wandert die ganze Mannschaft, also reicht ein Statement.
- **E** Soft-Archive mit neuem `projects.archived`-Flag. Migration nötig, plus jede Liste/Filter/Lookup-Stelle muss das Flag respektieren (Sidebar, Verlauf-Filter, History-Quickliste, Repo-Selects).
- **F** FK-Cascade `ON DELETE CASCADE` für `sessions.project_id`. Sessions wären weg statt im Legacy-Bucket — verletzt die explizite Spec-Anforderung.

**Grund:** A löst das Reibungsproblem („Aktion entdecken ohne Manual") direkt, ohne neue Renderer-Infrastruktur zu fordern — der Trash-Slot reiht sich ins bestehende `td-row-x`-Pattern ein, sichtbar gemacht durch eine kleine Opacity-Regel auf `.td-row-hover`. Memory-Hinweis „konvenient vor traditionell" trägt das Argument: der moderne Daily-Driver-Pfad ist die Empfehlung, nicht der konservative. B wäre eine Vor-Investition in Kontextmenü-Infrastruktur, die heute kein zweiter Use-Case einlöst. C kostet das Doppelte ohne erkennbaren Mehrwert. D ist der einzige Datenpfad, der Sessions wie gewünscht im Legacy-Bucket weiterleben lässt und gleichzeitig den Repo-State sauber hält: kein neues Flag, das in 8 Lese-Stellen mitgepflegt werden müsste, kein zweiter View-Filter, der irgendwann mal nicht-archivierte Projekte mit archivierten verwechselt. E wäre eine substantielle Schema-Erweiterung für ein UX-Feature, das ohne sie auskommt. F bricht die Spec.

**Konsequenz:** Wenn Phase 3 mal „Projekt-Papierkorb mit Restore" verlangt, ist E der spätere Pfad — die heutige Hard-Delete-Wahl ist umkehrbar, weil die zugehörigen Sessions weiter in der DB liegen (nur am Default-Bucket); eine zukünftige Restore-Funktion müsste die `projects`-Row neu anlegen und die Sessions per cwd-Match (oder gespeicherter Pre-Remap-projectId) zurück-umhängen. Aktuell kein Use-Case, daher kein Vorab-Aufwand. Hover-Sichtbarkeit über `opacity` (nicht `visibility`) — das Item springt beim Hover-Wechsel nicht, Layout-Breite bleibt konstant. `:focus-visible`-Regel auf dem Trash-Button hält das Icon auch bei Keyboard-Fokus sichtbar (Tab-Navigation soll die Aktion erreichen können).

**Implementierungsdetail:** Doppel-Confirm sitzt im RemoveProjectModal-Footer (lokaler `confirmStage`-State), nicht im Sidebar-Eintrag — der erklärende Hinweis-Text braucht den Modal-Body als Bühne, eine Inline-„⚠ Wirklich?"-Geste im Listen-Item wäre zu knapp gewesen. Default-Bucket-Schutz ist doppelt: UI rendert das Trash-Icon nur für `p.id !== DEFAULT_PROJECT_ID`, und der Server-Handler lehnt `DEFAULT_PROJECT_ID` zusätzlich mit `PROJECT_DEFAULT_IMMUTABLE` ab — Belt-and-Suspenders, weil der User über DevTools jederzeit einen direkten IPC-Call absetzen könnte. Vor dem `project:remove` schließt der Renderer alle offenen Tabs des Projekts via `handleCloseTab` (PTY-Kill + Lifecycle-Übergang auf `completed`), sonst hätten die Tabs im `useSessionStore` weiter auf eine projectId verwiesen, die in der DB nicht mehr existiert.

---

## Seed-basierte Native-Dep-Closure im ASAR-Build statt prune-Vertrauen oder Denylist

**Entscheidung:** Der `ignore`-Filter in `forge.config.ts` lässt von `node_modules/` nur die Pakete durch, die in der transitive Dep-Closure einer expliziten Seed-Liste liegen — und diese Seed-Liste ist exakt die Externals aus `vite.main.config.ts` (heute `better-sqlite3`, `@lydell/node-pty`). Alle anderen prod-Deps werden von Vite ins Main-/Renderer-Bundle inlined und sind im ASAR-`node_modules` redundant.

**Varianten:**

- **A** Kompletter `node_modules`-Pass-through (Status quo vor Phase 2) — verworfen, weil electron-packager dann den `prune`-Schritt nicht greifen ließ und devDeps unbenötigt im ASAR landeten (84.7 MiB statt 24.9 MiB). Auch `prune: true` explizit zu setzen hat in Kombination mit plugin-vite nichts geändert — der Schritt taucht nicht im Pack-Log auf.
- **B** Hartcodierte Denylist bekannter devDep-Prefixes (`@babel`, `@eslint`, `@vitejs`, …) — verworfen, weil bei jedem neuen devDep der Filter manuell gepflegt werden müsste und das nächste devTool ohne Vorwarnung im Bundle landet.
- **C** `npm ls --omit=dev` synchron im Forge-Config-Load + Allowlist aus der Output-Liste — verworfen wegen `child_process.execSync` zur Build-Time (langsam, fehleranfällig wenn npm-Version variiert).
- **D** Seed-basierte Closure aus `package.json`-Lookups (gewählt). Forge-Config liest `package.json` der Seed-Pakete und walked rekursiv über `dependencies` + `optionalDependencies`. Reine JSON-Reads, keine Child-Prozesse, deterministisch.

**Grund:** D ist die einzige Variante, die sowohl den ASAR-Bloat löst (alles außer der echten Native-Closure fliegt raus) als auch wartungsarm bleibt (keine Denylist-Pflege, kein neuer Build-Schritt). Die Seed-Liste ist genau zwei Einträge lang und korrespondiert 1:1 mit dem `external`-Array in `vite.main.config.ts` — wenn dort ein neues Native-Modul hinzukommt, muss der Seed parallel ergänzt werden (Konvention via Kommentar an beiden Stellen). prune-Vertrauen scheitert daran, dass plugin-vite den Schritt im aktuellen Pfad nicht reproduzierbar durchreicht; das explizit zu fixen wäre Pfusch an plugin-vite, nicht an unserer Config. Eine `npm ls`-Lösung würde Build-Zeit beim ersten Pack messbar verlängern und die Forge-Config an einen externen Prozess koppeln, dessen Output-Format zwischen npm-Versionen variieren kann.

**Konsequenz:** Renderer-Bundle bleibt fett genug (1.78 MiB), weil Vite alle Pure-JS-Deps inlinet — das ist gewollt und macht den ASAR-Schlankheits-Effekt erst möglich. Wenn in Phase 3 ein neues Native-Modul (z.B. ein OS-Notifier oder eine zweite SQLite-Variante) hinzukommt, muss es **beide** Stellen treffen: external in `vite.main.config.ts` und Seed in `forge.config.ts`. Falls jemand das vergisst, schlägt der Pack im besten Fall lautstark fehl (Modul fehlt zur Laufzeit) — im schlimmsten Fall fehlt nur eine transitive Dep, die selten getroffen wird. Schutz: Smoketest-Erwartung „App startet, DB öffnet, PTY spawnt" muss vor jedem Release durch.

**Implementierungsdetail:** Scope-Verzeichnisse (`/node_modules/@<scope>`) müssen explizit durchgelassen werden, wenn der Scope ein prod-Paket enthält — sonst klemmt electron-packager den gesamten Subtree weg (ein erster Versuch schickte `@lydell/node-pty` komplett ins Off, weil der Scope-Knoten gefiltert wurde). `prodScopes` ist als separates Set vorab errechnet und in `isProdDepPath` als erste Bedingung gecheckt. `optionalDependencies` werden in die Closure mitgenommen, weil node-pty seine Plattform-Binaries (`@lydell/node-pty-win32-x64` etc.) so deklariert; ohne den Pfad fehlt die ConPTY-Binary im Windows-Pack.

---

## Custom-Session-Typ: dedizierte Label-Spalte statt Enum-Aufweichung

**Entscheidung:** Der fünfte Session-Typ „Eigene Art" landet als neuer Enum-Wert `'custom'` in `SessionType`, die freie Bezeichnung lebt in einer eigenen nullable Spalte `sessions.custom_type_label` (Migration 0005). Der Verlauf-Filter bündelt alle `custom`-Sessions in eine einzige Pille „Eigene Art" statt einer Pille pro vergebenem freien String.

**Varianten:**

- **A** Neuer Typ `'custom'` + dedizierte Label-Spalte (gewählt). Datenmodell bleibt streng typisiert, Filter ist deterministisch, freie Bezeichnung ist semantisch von `title` getrennt.
- **B** Enum aufweichen, freier String wird selbst zum `sessions.type`-Wert. Keine Migration, aber Tippfehler-Risiko (`"Refactor"` vs `"refactor"` → zwei Buckets), Filter-Liste explodiert mit jedem neuen freien String, zod verliert seine Schutzfunktion an der IPC-Grenze.
- **C** Freier Text wandert als Prefix in den Titel (`[Refactor] Auth-Cleanup`). Null Migration, aber die Bezeichnung kollidiert semantisch mit echten Titeln und Anzeige-/Filter-Logik müsste Titles parsen.

**Grund:** A ist die einzige Variante, die das Datenmodell sauber hält — eine zusätzliche Spalte kostet einmalig eine triviale Migration und liefert dafür deterministisches Filtering, klare Typ-Validierung (zod-`superRefine` macht das Label bei `type='custom'` zur Pflicht und ignoriert es anderwärts) und keine Title-Sondersemantik. B löst das eigentliche Problem nicht — eine offene String-Domain in `sessions.type` würde sofort Filter-Explosion und Migrations-Bedarf nach hinten verschieben, sobald der erste User merkt, dass „Refactoring" und „Refactor" als zwei Buckets erscheinen. C bricht die Title-Eindeutigkeit und macht Anzeige-Refactors anfällig, weil jede Title-Anzeige zwei Pfade kennen muss.

**Konsequenz:** Season-Number-Allocation bleibt `feature`-exklusiv — `custom` bekommt keine Nummer (gleiche Regel wie für `bug`/`review`/`docs-sync`). HistoryActionModal und HistoryPane zeigen bei `type='custom'` die `custom_type_label`-Bezeichnung statt des generischen Mappings; das Fallback-Label „Eigene Art" greift nur, falls eine Session unerwartet ohne Label in der DB landet (sollte durch das zod-`superRefine` ausgeschlossen sein, ist aber defensives Rendering). Verlauf-Filter-Pille „Eigene Art" bündelt alle Custom-Sessions absichtlich — würde der User später viele Bezeichnungen vergeben, bleibt die Pillenliste konstant. Eine „pro freier Bezeichnung eine eigene Pille"-UX wäre erst sinnvoll, wenn der User wirklich nach einer Sub-Kategorie filtern will, was im Daily-Use unwahrscheinlich ist.

**Implementierungsdetail:** Der `superRefine`-Pflicht-Check sitzt an der IPC-Grenze, nicht nur am Submit-Button — der User kann das UI-Disable durch DevTools manipulieren, der Main-Handler lehnt ungültige Payloads trotzdem ab. Length-Cap auf 60 Zeichen entspricht der Verlauf-Spalten-Breite (mehr wäre via Tooltip lesbar, nicht in der Tabellen-Zelle). `customTypeLabel` zieht im Renderer als optionale Prop durch SessionTab → TerminalTab → `pty:create`; beim Resume aus dem Verlauf nehmen HistoryPane und HistoryActionModal die Bezeichnung aus dem `SessionHistoryEntry` mit in den neu angelegten Tab, damit der Wiederaufgriff dieselbe Anzeige trägt.

---

## Templates-Fenster ist kein Modal mehr, sondern ein draggable Tool-Panel

**Entscheidung:** Das Templates-Fenster verliert den `td-modal-backdrop`-Wrapper und wird als `position: fixed`-Panel direkt auf dem Viewport gerendert, mit einem Drag-Griff am Header. `aria-modal` entfällt — `role="dialog"` bleibt für Screenreader. Click-Outside-Close gibt es nicht mehr (es gibt kein Outside-Element mehr, das den Trigger trägt); Esc und `×` schließen weiter. Position-State liegt im Component (`useState<{x,y}>`), Initial-Wert in einem Mount-Effect (Viewport-Zentrierung).

**Varianten:**

- **V1** Minimal: Backdrop weg, Modal bleibt zentral fixiert. Wenn es den Editor verdeckt: Esc + Wieder-Öffnen. Minimaler Aufwand, aber bei der eigentlichen User-Motivation („nebenbei im Editor lesen") immer noch ein Reibungspunkt.
- **V2** Draggable Tool-Panel (gewählt): Backdrop weg + Drag-Griff am Header. Pointer-Events-basiert (pointerdown/pointermove/pointerup), Bounding gegen Viewport. User kann das Fenster frei verschieben.
- **V3** Side-Pane: Templates wandert als dauerhafter Pane neben dem Editor ins Layout. Layout-Refactor, größere Implementierungszeit. Verworfen, weil der Use-Case Daily-Driver-Komfort ist, kein neuer Permanent-Slot.

**Grund:** V2 löst das eigentliche Reibungsproblem — Modal-Open hat den Editor blockiert, der User konnte keinen Text aus den `.md`-Files in die Modal-Inputs übernehmen, ohne das Fenster zu schließen. Der Drag-Griff ist die natürliche „Tool-Palette"-UX (vergleichbar mit IDE-Suchfeldern, die man wegschieben kann). V1 wäre Halbgenuss: das Fenster wäre zwar non-blocking, würde aber bei jedem zweiten Workflow im Weg sitzen und der User würde es genauso oft schließen/wieder-öffnen wie heute. V3 wäre Over-Engineering für einen Use-Case, der nicht jeden Tag eintritt — ein Permanent-Slot kostet ständig Screen-Real-Estate, ein Tool-Panel nur on-demand.

**Konsequenz:** Andere Modals (`NewSessionModal`, `PreCommitModal`, `SettingsModal`, `HistoryActionModal`, `UsageDetailModal`) behalten das klassische Backdrop-Verhalten — sie sind tatsächlich modal (User-Entscheidung erzwungen, keine Hintergrund-Interaktion sinnvoll). Templates ist der Sonderfall, weil das Modal mit anderen UI-Elementen kombiniert wird (Editor lesen, dann ins Modal-Form). Falls die Drag-UX später für weitere Tool-Panels nützlich wird, wandert die Logik in einen Shared-Hook (`useDraggablePanel`); aktuell ist sie lokal im TemplatesModal, weil Single-User reicht.

**Implementierungsdetail:** Drag-Listener werden via `useEffect`-Cleanup nur registriert, solange `dragOffset` gesetzt ist — kein dauerhaftes Pointer-Move-Abfangen am Window. Buttons im Header (`+ Neu`, `×`) bekommen kein eigenes Stop-Propagation; stattdessen prüft der PointerDown-Handler via `closest('button')`, ob das Event aus einem Button kommt, und beendet den Drag-Trigger früh. Damit funktioniert ein Klick auf `×` zuverlässig (kein „Mini-Drag" durch ein paar Pixel Maus-Wackeln), und neue Header-Buttons brauchen keinen extra Boilerplate. Bounding-Konstanten (80 px rechts/60 px unten) sind hartcodiert — wenn das Fenster sehr klein wird (z.B. Multi-Monitor mit kleinem Sekundär), müsste das überarbeitet werden, aber im 1080p+-Standard reicht es.

---

## Erweiterte Template-Variablen: Konvention-basierter Body, META-Filter, In-App-Edit über vorhandenen Editor

**Entscheidung:** Die drei neuen Auto-Variablen (`LETZTE_SEASON_NAME`, `TECH_SCHULDEN_RELEVANT`, `LETZTE_ENTSCHEIDUNGEN`) werden serverseitig über einen eigenen IPC `templates:resolve-auto-vars` aufgelöst, weil sie DB- (SessionRepository) und Datei-Zugriff (`docs/TECH_SCHULDEN.md` / `docs/ENTSCHEIDUNGEN.md`) brauchen und damit nicht in den Renderer gehören. Der Template-Body wird nach einer dateigetragenen Konvention extrahiert: erster Code-Fence unter `## Vorlage`, Fallback auf volle Datei. Doku-Parser filtern META-Sektionen über das Pflicht-Label im Body (`**Bereich:**` für Schulden, `**Entscheidung:**` für Entscheidungen) — naives `##`-Section-Splitting hatte die Erklär-Sektionen aus dem Datei-Kopf als Top-3-Einträge ausgegeben. Die In-App-Template-Verwaltung läuft über den bereits in Phase 1 (Sprint 7) gebauten Markdown-Editor: `✎`-Stift im Templates-Modal öffnet die `.md` als File-Tab im Right-Pane, `+ Neu` schreibt einen Stub und öffnet ihn ebenfalls dort.

**Varianten:**

- **A** Renderer-only: Auto-Variablen werden im Renderer befüllt, der Renderer liest die `.md`-Dateien selbst — verworfen, weil der Renderer kein direktes FS hat (Sandbox/contextIsolation) und für SQLite ohnehin auf den Main angewiesen ist.
- **B** Hybrider IPC pro Auto-Variable (`templates:get-last-season`, `templates:get-schulden`, …) — verworfen wegen Round-Trip-Vervielfachung (3 IPCs pro Modal-Open statt einer), kein Vorteil bei der Boundary-Validierung.
- **C** Ein gebündelter IPC `templates:resolve-auto-vars`, der alle Server-Werte in einem Roundtrip liefert (gewählt). zod-validiert, einheitliches Error-Handling, Default-Project-Bucket bekommt explizit leere Werte ohne FS-Touch.

Für die **Body-Extraktion**:

- **A1** Konvention „erster Code-Fence unter `## Vorlage`" mit Fallback auf volle Datei (gewählt). `SEASON_PROMPT.md` folgte der Struktur seit Sprint 6, kein Migrate nötig; einfache Templates ohne Erklärtext funktionieren via Fallback weiter.
- **A2** Explizite Marker-Kommentare (`<!-- TEMPLATE-START -->`/-END) — verworfen, weil alle Bestands-Templates angepasst werden müssten und die Marker im Markdown-Editor sichtbar bleiben (kein Klapp-Verhalten).
- **A3** YAML-Frontmatter mit `body:`-Feld — verworfen wegen mühsamer Mehrzeilen-Pflege in YAML.

Für das **Template-Management**:

- **M1** Edit-Stift öffnet den vorhandenen Markdown-Editor (gewählt). Nutzt die Phase-1-Editor-Infrastruktur, Templates bleiben als `.md`-Files Git-versionierbar, kein neuer Persistenz-Layer.
- **M2** In-Place-Editor im Modal (eigene CodeMirror-Instanz) — verworfen, weil eine zweite Editor-Komponente parallel zu warten wäre und Konflikt-Erkennung bei externem Edit mehr Aufwand als Wert liefert.
- **M3** Templates in eigener SQLite-Tabelle mit voller CRUD-UI — verworfen, weil Git-Versioning entfiele und der Migrationspfad für bestehende `.md`-Templates Aufwand ohne klaren Wert bedeutet.

**Grund:** Variante C bündelt die drei Server-Werte in einem Channel; die zod-Validierung greift an einer Stelle, der Renderer hat nur einen `Promise<Result>` zu verarbeiten. A1 ist der einzige Pfad ohne Datei-Migration und gleichzeitig defensiv durch den Voll-Fallback — Templates, die der Konvention nicht folgen, bleiben weiter funktional. Der META-Label-Filter ist die natürliche Heuristik der Doku-Konvention: Pflicht-Labels markieren echte Einträge, ihre Abwesenheit markiert Erklärtext-Sektionen. M1 nutzt einen Building-Block, der bereits vorhanden ist (Markdown-Editor + File-Tab-Store) und gewinnt damit „kostenlos" Auto-Save, Diff-View beim Editieren und konsistente Tab-Navigation.

**Konsequenz:** Server-Auto-Vars sind explizit opt-in pro Template — `SEASON_PROMPT.md` referenziert sie nicht im Default-Block, weil ein erster Patch die Vorlage zu invasiv erweitert hatte und der Erklär-Block der Datei dadurch eine doppelte Rolle bekam (Doku UND Default-Prompt). Neue Templates können die Tokens jederzeit einbauen; das Modal blendet die zugehörigen Sidebar-Felder dann automatisch ein. Mehrzeilige Auto-Var-Werte werden in der Sidebar als kompakter Snippet mit „Mehr"-Toggle gerendert, weil ein einfaches `white-space: pre-line` die Spalte bei Top-3-Einträgen mit langer Was-Zeile sprengt. Top-N für Schulden und Entscheidungen ist heute hartcodiert auf 3 — falls der Schmerz real wird (z.B. zu wenig oder zu viel Kontext im Prompt), wandert das in `settings.json`; dokumentiert in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).

**Implementierungsdetail:** `TemplateFile.relPath` ist im Shared-Type ergänzt und vom Main-Reader gefüllt — für Projekt-Templates mit Forward-Slash-Normalisierung (das `fs:read/write`-Schema verlangt Forward-Slashes), für globale Templates `null`. Damit weiß das Modal pro Eintrag, ob der Edit-Pfad verfügbar ist; der Edit-Stift ist für globale Templates disabled mit Tooltip-Hinweis auf den `%APPDATA%/TakumiDeck/templates/`-Ordner. Der Phase-Label-Helper (`derivePhaseLabel`) ist tolerant gegenüber Windows-Pfadtrennern und Case (`docs\\roadmap\\phase2.md` → `Phase 2`) — das `current_phase_file`-Feld kann beides liefern, je nachdem wie der User es geschrieben hat.

---

## Trigger-Phrasen-Schnellbuttons: dynamisch aus Frontmatter, Submit via separates CR

**Entscheidung:** Die Action-Bar rendert pro Eintrag aus `workbench.trigger_phrases` automatisch eine eigene Pille. Das zod-Schema akzeptiert über `.catchall(z.string().min(1))` beliebige zusätzliche Keys jenseits der zwei Pflicht-Keys (`docs_update` + `commit`). Die `commit`-Phrase wird aus der Pillen-Liste herausgefiltert, weil die bestehende commit-Pille mit PreCommit-Modal weiterläuft. Submit-Enter geht als separates Carriage-Return außerhalb des Bracketed-Paste-Blocks an die PTY, gesteuert über ein opt-in `submit: true`-Flag im `td-template-send`-Event.

**Varianten:**

- **A** Eine schlanke Pille hartcoded für `docs_update`, kein Schema-Touch. Roadmap-Beschreibung wäre nicht erfüllt — eine spätere dritte Phrase bräuchte ein zweites Mal Code.
- **B** Dynamische Pillen-Reihe mit Schema-Lockerung, alle Phrasen als eigene Pille sichtbar (gewählt).
- **C** Eine einzelne „▾ Phrasen"-Pille mit Dropdown-Menü — verworfen, weil bei den heute realistischen 2–3 Phrasen ein unnötiger Extra-Klick pro Send anfällt. Sinnvoll erst ab ~5 Phrasen.

**Grund:** B löst genau das Roadmap-Versprechen („dynamische Buttons aus `workbench.trigger_phrases`") und skaliert ohne Refactor. Die Schema-Catchall ist die natürliche zod-Form für „zwei Pflicht-Keys + offene Erweiterung" — eine spätere Migration auf `Record<string, string>` ohne Pflicht-Keys wäre unnötig, weil die zwei Standard-Keys von den Working-Rules referenziert werden und nicht wegfallen dürfen. C wäre eine Investition in UI-Mechanik (Popover, Outside-Click, ESC, Pfeil-Tastatursteuerung), die sich erst rentiert, sobald die Pillen-Reihe wirklich breit wird.

**Konsequenz:** `commit` ist als HIDDEN_KEY explizit in `triggerPhrasePills.ts` ausgeklammert — eine Sicherheits-Whitelist, kein Free-for-all-Filter (Why-Kommentar im Code). Wenn in einer späteren Phase weitere Pflicht-Phrasen mit eigenem Modal-Workflow dazukommen (z.B. ein `release`-Wizard), wandern sie zusätzlich in die Whitelist. Pillen-Sortierung: `docs_update` zuerst (Standard-Daily-Driver), danach alphabetisch — neue User-Phrasen reihen sich also vorhersehbar ein.

**Implementierungsdetail:** Submit-Enter via separates `\r` an die PTY ist nicht kosmetisch — Claude Codes TUI behandelt einen Newline **innerhalb** eines Bracketed-Paste-Blocks `\x1b[200~ … \x1b[201~` als „Newline im Eingabefeld einfügen" (Shift+Enter-Verhalten), nicht als Submit. Das CR muss zwingend außerhalb des Blocks ankommen, damit das TUI es als Tastatur-Enter erkennt. PreCommitModal hatte denselben latenten Bug (Phrase mit `\n` im Paste-Text) und wurde im selben Pass auf das `submit: true`-Flag umgestellt — der dortige „nach Send Modal schließen"-Pfad hat den Bug bisher kosmetisch maskiert, real wurde der commit-Trigger im TUI nie automatisch abgesendet. Templates absichtlich **nicht** auf `submit: true` — lange Prompts mit User-Variablen will man vor dem Send oft noch im Eingabefeld inspizieren.

---

## Screenshot-Drop: Ablage außerhalb des Projekts, Clipboard-Image-Paste mitgenommen

**Entscheidung:** Gedroppte und gepastete Direkt-Bilder werden in `<userData>/screenshots/` abgelegt, nicht in den aktiven Projektordner. Der eingefügte Text ist immer ein roher absoluter Dateipfad (mit Quotes nur bei Whitespace). Zusätzlich zum Drag-Drop greift derselbe Pfad bei `Ctrl+Shift+V` mit einem Bild in der Zwischenablage (Image-First im bestehenden `clipboardKeyHandler`).

**Varianten:**

- **A** Nur Drag-Drop, Ablage in `<userData>/screenshots/` außerhalb der Projekte.
- **B** Wie A, aber Ablage in `<projekt>/.screenshots/` — verworfen, weil jedes Projekt eine `.gitignore`-Pflege braucht, der Multi-Projekt-Fall (kein aktives Projekt) ohnehin auf A zurückfallen müsste und Screenshots semantisch keine Repo-Assets sind.
- **C** A + Clipboard-Image-Paste (gewählt). Image-First nur, wenn ein `imagePasteSaver`-Driver gesetzt ist; ohne Driver bleibt der klassische Text-Paste-Pfad aus Sprint 3.5 unverändert (Regressions-Schutz).

**Grund:** `Win+Shift+S` → Snip im Clipboard ist der reale Daily-Driver-Workflow für Windows-Screenshots — häufiger als ein expliziter Drag aus dem Explorer. Variante A allein hätte den halben Workflow abgedeckt. B koppelt das Feature an Projekt-Hygiene-Themen, die mit dem eigentlichen Feature-Kern (Bild → claude-Prompt) nichts zu tun haben. Der Ablage-Ort folgt der Working-Rule „konvenient vor traditionell" aus dem Auto-Memory.

**Konsequenz:** Die Screenshots-Ablage wächst über die Zeit; ein „Aufräumen"-Mechanismus ist Phase-2-Backlog (TTL oder Manual-Clear-Button in Settings). Die MIME-Whitelist im Schema (`PNG/JPEG/GIF/WebP`) ist auf die Browser-Standard-Drag-Drop-Formate beschränkt — SVG ist explizit raus, weil es als XSS-Vektor in Read-Tool-Antworten gefährlich wäre und claude-code es nicht als Bild-Quelle akzeptiert.

**Implementierungsdetail:** Bytes wandern als base64-String durch den `fs:save-screenshot`-IPC, nicht als `Uint8Array` oder `Blob`. Grund: `contextBridge` clont binäre Buffer-Typen über die Sandbox-Grenze nicht stabil; base64 ist verlustfrei, vom zod-Schema trivial validierbar (Längen-Cap auf 33 MiB ≈ 25 MiB roh) und im Renderer durch `btoa` über latin1-Chunks effizient herstellbar. `File.path` wurde in Electron 32 entfernt — die Bridge nutzt `webUtils.getPathForFile(file)` aus dem Preload-Context.

---

## State-Detection in Phase 2: TUI für `waiting`/`permission-prompt`, JSONL für `running`/`idle`

**Entscheidung:** Die volle State-Detection aus Phase 2 verteilt die Klassifikation auf zwei Quellen. `waiting` und `permission-prompt` werden ausschließlich vom Renderer per TUI-Pattern auf dem serialisierten xterm-Buffer erkannt und via `pty:tui-state`-IPC an den Main-Lifecycle gepusht. `running` und `idle` macht weiterhin der Main-Loop alle 2 s aus dem JSONL-Timestamp (Phase-1-Mechanik). Der JSONL-Loop überspringt running-Sessions mit stale JSONL — er darf `running` nicht eigenständig auf `idle`/`waiting` herunterstufen.

**Varianten:**

- **A** TUI nur für `permission-prompt`, JSONL für alles andere — verworfen, weil extended thinking / Perambulating den JSONL-Timestamp stale werden lässt, ohne dass Claude fertig ist. Die Session würde fälschlich auf `waiting`/`idle` kippen.
- **B** TUI für `waiting` + `permission-prompt`, JSONL für `running` + `idle`, mit Skip-Schutz für stale-running-Sessions (gewählt).
- **C** Komplette State-Detection im Renderer auf TUI-Patterns — verworfen, weil dann Crash-Recovery beim App-Start keine Quelle hat (Renderer noch nicht mounted) und der JSONL-Watcher seinen Token-Path-Datenfluss doppelt fahren müsste.

**Grund:** Die zwei Signal-Quellen messen unterschiedliche Dinge: JSONL = „schreibt Claude gerade?" (gut für running/idle, blind bei TUI-Prompts ohne JSONL-Output). TUI = „was zeigt Claude gerade an?" (gut für Input-Prompt + Permission-Dialog, blind für interne Aktivität ohne TUI-Refresh). Erst die Kombination deckt alle vier Status zuverlässig ab. Variante B macht beide Quellen verantwortlich für *eigene* Status — kein Konkurrenz-Schreibpfad, kein State-Flackern.

**Konsequenz:** Lifecycle-`ALLOWED`-Map ist Phase-2-typisch erweitert (running/idle → waiting/permission-prompt, und Rückweg → running). Bewusst verboten bleibt der Pfad `waiting`/`permission-prompt` → `idle`, damit der JSONL-Loop den vom Renderer gemeldeten TUI-Status nicht alle 2 s aushebelt. Pattern-Definition ist versioniert (`PatternVersion` mit `id`, Fixtures, Semver-Range pro Claude-Code-Version) — neue Claude-Code-Generationen kommen als zusätzlicher Eintrag dazu, alte Fixtures bleiben als Regressionsnetz grün. Box-Layout-Toleranz (`^\s*`) im waiting-Pattern war der konkrete Bug-Fix in Season 1 — diagnostiziert per Live-DevTools-Logging am echten Buffer.

---

## Electron auf 41 statt 42 (Code-Review Build/Konfig)

**Entscheidung:** Electron-Security-Bump landet auf 41.5.1, nicht auf der zum Review-Zeitpunkt aktuellen 42.0.1. Behebt die 18 High-CVEs aus dem npm-audit, ohne den Native-Module-Build-Pfad lokal zu brechen.

**Varianten:**

- **A** Electron 42.0.1 mit Source-Rebuild von `better-sqlite3` — scheitert auch mit VS Build Tools, weil die Quelle quelltext-inkompatibel mit V8 13.x ist (`v8::External::New/Value` Signatur-Bruch, `cppgc/heap.h` nutzt `__builtin_frame_address` als GCC/Clang-Intrinsic, MSVC kann es nicht auflösen).
- **B** Electron 41.5.1 mit Prebuilt-Binary von `better-sqlite3` 12.9.0 (ABI v145) — gewählt.
- **C** Electron 33 lassen — verworfen, trägt 18 High-CVEs.

**Grund:** Variante A scheitert nicht primär an der Build-Toolchain (das ließe sich lösen), sondern an einem **API-Bruch in V8 13.x**: `better-sqlite3` 12.9.0 ruft `v8::External::Value()` ohne `Isolate*`-Argument auf und `v8::Template::SetNativeDataProperty` als mehrdeutige Überladung — beides funktioniert nur gegen Electron-≤-41-Header. Zusätzlich nutzt `cppgc/heap.h` aus dem Electron-42-SDK ein GCC/Clang-Intrinsic, das MSVC nicht kennt. Variante A ist damit blockiert, bis `better-sqlite3` ein Release mit Electron-42-Support liefert (kein Datum, keine Prebuilts auf GitHub für ABI v146). Variante B kostet einen Minor-Electron-Versionsschritt — und alle 18 gemeldeten CVEs sind in `electron <= 39.8.4`, also durch B vollständig abgedeckt.

**Konsequenz:** Beim nächsten `better-sqlite3`-Release mit Electron-42-Prebuilds (oder beim Schritt auf eine SQLite-Library mit weniger Build-Toolchain-Ballast) kann der Electron-Bump auf 42 nachgeholt werden — als isolierter Maintenance-Pass. Slot offen in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md). VS-2022-Build-Tools sind seit 2026-05-12 lokal installiert; sie sind als Reserve sinnvoll, lösen den Bump aber nicht — die Inkompatibilität ist in der Quelle, nicht im Compiler.

---

## Code-Review-Pass: Main-Hardening (Bereich 5 + Hotfix CSP-Dev-Block)

**Entscheidung:** Der Main-Prozess implementiert vier sicherheitsarchitektonische Policies, die im MVP-Pre-Release-Code-Review (2026-05-12, Bereich 5 + Hotfix `6fe11a9`) festgelegt wurden und ab v0.1 dauerhaft gelten:

1. **CSP doppelt verankert** — zusätzlich zum Meta-Tag im Renderer-HTML setzt `webRequest.onHeadersReceived` denselben CSP-Inhalt als HTTP-Header. Greift vor dem ersten Script-Tag, gilt auch für `file://`-Loads (Electronegativity CSP_GLOBAL_CHECK).
2. **CSP-Profil dev/prod-aware** — Production: strict `script-src 'self'`. Development: zusätzlich `'unsafe-inline'`/`'unsafe-eval'` (für Vite-6 `@vitejs/plugin-react` Fast-Refresh-Preamble) + `ws://localhost:5173` im `connect-src` (für HMR-WebSocket).
3. **shell.openExternal-Whitelist** — `setWindowOpenHandler` öffnet `http(s)`-Ziele explizit im System-Browser, andere Schemata (`file:`/`javascript:`/`data:`) bleiben blockiert. `will-navigate` blockt In-Place-Navigation aus dem Renderer und öffnet HTTP(S) extern (Electronegativity LIMIT_NAVIGATION_GLOBAL_CHECK).
4. **Default-deny Permission-Handler mit Clipboard-Whitelist** — `setPermissionRequestHandler` + `setPermissionCheckHandler` lehnen alle Browser-Permissions (Mikro, Geo, Notifications, MIDI, …) ab. Ausnahme: `clipboard-sanitized-write` und `clipboard-read` werden explizit whitelisted, weil das Terminal-Copy/Paste-Wiring (`clipboardKeyHandler`) sonst still scheitert — Chromes Auto-Grant für `clipboard-sanitized-write` wird durch den Override mit ausgehebelt (Hotfix nach Anwender-Report 2026-05-12, in CHANGELOG dokumentiert). Weitere Whitelist-Einträge bei Bedarf in zukünftigem Sprint (Electronegativity PERMISSION_REQUEST_HANDLER_GLOBAL_CHECK).

**Varianten** (für CSP-Profil dev/prod, die nicht-triviale der vier Entscheidungen):

- **A** Einheitliche strict-CSP, Vite-Dev über andere Plugin-Konfig ohne inline-Script — verworfen, weil `@vitejs/plugin-react`-Fast-Refresh-Preamble nicht ohne inline läuft und ein Custom-Plugin-Pfad fragil wäre.
- **B** Dev-Mode-Branch in der CSP-Definition (gewählt) — Dev ist Owner-Maschine, kein realistischer Threat-Vektor; Prod-Build wird identisch hardened wie vor dem Hotfix.
- **C** CSP nur als Meta-Tag (Status vor dem Hotfix) — verworfen, weil Vite-6 die Inline-Preamble nicht umgehen kann und der Renderer dadurch in Dev leer blieb.

**Grund:** Sicherheits-Policies, die im Code-Review als „Default-Hardening für ein lokales Daily-Driver-Tool ohne externe Surface" plausibel waren. CSP-Doppel-Verankerung kostet eine doppelt zu pflegende Stelle (Meta-Tag im Renderer + Header in `main.ts`) — Trade-off bewusst akzeptiert. Dev/Prod-Trennung ist die einzige nicht-triviale: sie öffnet im Dev-Mode bewusst die CSP-Lücke, weil die App lokal auf einer Owner-Maschine läuft und der Dev-Workflow (Fast-Refresh, HMR) sonst nicht funktioniert.

**Konsequenz:** Bei jeder Änderung der CSP-Werte beide Stellen synchron pflegen (Meta-Tag und Header). Wenn TakumiDeck später als signiertes Build über npm distributed wird, die Permission-Whitelist neu evaluieren (Notifications wären dann plausibel). Bei Vite-Update auf v7+ prüfen, ob die Fast-Refresh-Preamble nicht mehr inline kommt — dann Dev-CSP wieder verschärfen.

---

## UsageBar als Vorlage-treue Zeile statt Card (Sprint 9, Variant A)

**Entscheidung:** UsageBar im PlanPane rendert ohne eigenen Border und Card-Background — nur Label-Zeile + Track. Click-Target ist die ganze Zeile, Hover signalisiert Klickbarkeit ausschließlich über Color-Wechsel auf accent.

**Varianten:**

- **A** Vorlage-treue Zeile (gewählt — kein Border, kein bg, padding 0, hover via color-only)
- **B** Card-Optik beibehalten — TakumiDeck-Eigenheit dokumentieren

**Grund:** Working-Rule „bei Konflikt mit Vorlage gewinnt die Vorlage" zieht durch. Card war Sprint-7-Default, Vorlage hat reine Zeilen — die wirken eleganter und passen zur reduzierten Plan-Pane-Optik (kein Card-Stack, keine Border-Schwere). Track bekommt ohne Card-Border einen eigenen 1-px-Border + heller Background (`line-2`), damit die Bar trotzdem sichtbar bleibt.

**Konsequenz:** Click-Target ohne sichtbaren Card-Rand — Hover-Color-Wechsel ist die einzige Klickbarkeit-Markierung. Wenn das im Daily-Driver zu subtil wirkt, ist der Fallback ein Cursor-pointer + zarter Border via `outline: 1px solid transparent` mit Hover auf accent-line.

---

## Settings-Modal: 2-Spalten-Sidebar statt horizontaler Tab-Bar (Sprint 9, Variant A — D5)

**Entscheidung:** Settings-Modal-Body nutzt Grid `180 px 1 fr` mit linker `td-settings-sidenav` (App-konsistente `td-list-item`-Klassen) und rechter `td-settings-content`-Sektion. Inner-Scroll auf der Content-Seite, Outer-Scroll auf dem Body deaktiviert.

**Varianten:**

- **A** 2-Spalten-Sidebar nach Vorlage (gewählt)
- **B** Horizontale Tab-Bar mit `border-bottom`-Highlight beibehalten — als TakumiDeck-Eigenheit dokumentieren

**Grund:** Vorlage rendert das Settings-Modal als klassisches Preferences-Layout (app.jsx 422-431). Skaliert besser auf viele Tabs (6 aktuell, erweiterbar), Sidebar-Stil ist mit der App-Sidebar konsistent. Horizontale Tab-Bar war Sprint-8-Default ohne Vorlage-Bezug — Drift, die durch Sprint-9-Vorlage-Treue korrigiert wird.

**Konsequenz:** Sidebar-Buttons sind `td-list-item`-Klassen — Hover/Active-Verhalten erbt automatisch. Tab-Wechsel via vertikale Selektion (für Power-User mit Tastatur potenziell langsamer als horizontale `Tab`-Navigation, aber Settings ist kein Power-Use-Pfad). Bei künftiger Erweiterung um Account/API-Keys/Sync-Settings (Phase 5+) trägt das Layout ohne Refactor.

---

## Per-Bar `reset_schedule` als UI-Slot ohne Backend-Berechnung (Sprint 9)

**Entscheidung:** `LimitBar.reset_schedule?: { day_of_week, hour, minute }` als optionales Feld pro Bar. Schema validiert, JSON-Editor im Settings-Token-Tracking-Tab kennt das Feld, UsageBar-Tooltip zeigt „Reset: Montag 00:00 (Phase-2-Backend)" wenn gesetzt. **Aggregations-Logik nutzt den Wert noch nicht** — `usage:window` rechnet weiter mit Rolling-`window_hours`.

**Varianten:**

- **A** Globaler `weekly_reset` für alle weekly-Bars + Form-Felder im Settings-Tab
- **B** Pro-Bar `reset_schedule` im JSON-Editor (gewählt)

**Plus:**

- **a** UI-Slot, Backend Phase 2 (gewählt)
- **b** Auch Backend-Berechnung jetzt: `usage:window` startet beim letzten Reset-Zeitpunkt

**Grund:** Pro-Bar ist flexibler (verschiedene Limits könnten unterschiedliche Reset-Zyklen haben — z.B. Anthropic-Account vs. Claude-Design-Web vs. eigene custom-Filter), und der JSON-Editor ist für Power-User-Konfig sowieso da. UI-Slot statt Backend-Logik, weil:
- die echte Reset-Berechnung (window vom letzten Reset bis jetzt, nicht rolling) ist eine nicht-triviale Änderung am `usage:bucket`-Aggregat
- ohne reale Daten zur Reset-Cadence (Anthropic gibt keinen Account-API-Endpoint dafür) ist die UI-Eingabe sowieso nur eine Schätzung
- Phase 2 kann den UI-Slot direkt nutzen, kein UI-Refactor nötig

**Konsequenz:** Tooltip macht klar, dass es ein UI-Slot ist (`(Phase-2-Backend)`-Suffix). User können den Wert setzen, ohne dass die Bar-Berechnung sich ändert — kein Verwirrungs-Risiko. Phase-2-Backend-Arbeit ist isoliert auf das `usage:window`-Aggregat.

---

## Settings-Persistenz: Auto-Save pro Form-Field statt Save-Button

**Entscheidung:** Form-Inputs im Settings-Modal triggern beim Tippen einen 500-ms-debounced Patch via `settings:set` — kein expliziter Save-Button. Mehrere Felder werden in einem einzelnen Patch koalesziert (`createDebouncedSaver` puffert pro Tick und feuert atomar). Der Raw-JSON-Editor (für `limit_bars[]`, `sensitive_file_patterns[]`) hat einen separaten „Anwenden"-Knopf, weil unfertiges JSON sonst die `settings.json` verkrüppeln würde.

**Varianten:**

- **A** Auto-Save pro Field (gewählt — V2-A)
- **B** Expliziter Save-Button mit Dirty-Indikator
- **C** Save+Schließen kombiniert im Modal-Footer

**Grund:** Settings-Tweaks im Daily-Driver sind kleine Korrekturen („P90-Window von 192 auf 168 ziehen", „Modell-Limit auf 200 k") — kein Modal-Overhead pro Tweak. Pattern ist konsistent mit dem 500-ms-Notes-Save (Sprint 3) und dem 500-ms-CodeMirror-YAML-Linter (Sprint 7). Variante B würde jeden Tweak einen Klick mehr kosten; Variante C zwingt Modal-Reopen pro Setting. Raw-JSON ist explizit ausgenommen, weil ein zwischenzeitlich kaputter Buffer den Server schreiben würde — beim Tippen ist „valid JSON" ein hartes Pre-Check.

**Konsequenz:** Lokaler optimistischer State pro Modal — der Eingabewert ist sofort sichtbar, der Server-Roundtrip ersetzt ihn beim nächsten Tick. SaveStatusBadge zeigt „Auto-Save aktiv / Speichert… / ✓ Gespeichert (N Felder) / ⚠ <Fehler>" als dezenten Indikator unten links. Beim Modal-Close wird einmal explizit `flush()` getriggert, damit die letzten <500 ms Tipps nicht verloren gehen.

**Implementierungsdetail:** `createDebouncedSaver(api, { scheduler })` mit injectable Scheduler — Tests fahren mit Manual-Scheduler statt vi.useFakeTimers, deterministisch. Lokale Schema-Validation via `AppSettingsPatchSchema.safeParse` BEVOR der IPC läuft, damit ungültige Werte als error-Outcome ohne Server-Belastung gemeldet werden.

---

## JSON-Editor-Validation: Live-Lint debounced statt on-Save

**Entscheidung:** Der CodeMirror-6-Raw-JSON-Editor (für `limit_bars[]`, `sensitive_file_patterns[]`) hat einen `linter`-Extension mit 300-ms-Debounce, der bei jedem Tipp den aktuellen Buffer gegen ein zod-Schema parst und Fehler-Marker an der jeweiligen Zeile setzt. Der „Anwenden"-Knopf ist nur aktiv, wenn der Linter keine Fehler meldet.

**Varianten:**

- **A** Live-Lint via zod-Parse beim Tippen, debounced 300 ms (gewählt — V1-A)
- **B** on-Save: Fehler erst beim Anwenden-Klick als Toast
- **C** on-Blur: Marker erst, wenn der Editor-Fokus rausgeht

**Grund:** Daily-Driver-Pattern: wer JSON tippt, will sofort wissen, ob's noch Sinn ergibt. Variante A ist konsistent mit dem Sprint-7-YAML-Linter (auch debounced). Variante B verschiebt das Feedback zu spät — User klickt Apply, sieht Fehler, muss zur Stelle scrollen. Variante C unterdrückt Tipp-Lärm, aber auch jede Live-Bestätigung — ungewöhnlich für CodeMirror-Erfahrung. 300 ms (nicht 500 ms wie YAML) sind eine kürzere Pause, weil JSON-Strukturfehler lauter sind als YAML-Indentation-Drift und sofortige Sichtbarkeit hilft.

**Konsequenz:** `JsonRawEditor`-Komponente nimmt eine `validate(source) → { value, errors }`-Funktion injected — Tests können Pure-Validierung gegen synthetische Buffer fahren. CM6-Diagnostics-Marker mappen Zeile 1 als Fallback bei strukturellen JSON-Fehlern, weil `JSON.parse` keine Position-Info im Standard-Error liefert.

---

## Crash-Recovery: ended_at = MAX(messages.ts) statt now()

**Entscheidung:** Reconciliation-Pass beim App-Start patcht orphane running/idle-Sessions mit `ended_at IS NULL` auf `interrupted` und korrigiert `ended_at` anschließend auf den letzten `messages.ts` der Session (genauester verfügbarer Crash-Zeit-Approximator). Sessions ohne Messages bekommen `now()` als Fallback.

**Varianten:**

- **A** `ended_at = now()` beim App-Start
- **B** `ended_at = null`, nur Status patchen
- **C** `ended_at = MAX(messages.ts WHERE session_id)`, Fallback `now()` (gewählt — V4-C)

**Grund:** Variante A zeigt im Verlauf-Detail „endete heute Mittag", obwohl der Crash gestern Abend war — User wird verwirrt. Variante B verzichtet auf Dauer-Berechnung („Endete: —" optisch ehrlich, aber nutzlos für Reporting). Variante C ist genauer — der Timestamp der letzten claude-Antwort vor Crash ist die beste verfügbare Approximation. Kosten: ein indizierter `MAX(ts)`-Query pro Karteileiche, bei der Größenordnung (selten >1-2 pro Crash) vernachlässigbar.

**Konsequenz:** Neues Modul `src/main/sessions/reconciliation.ts` mit Driver-Injection (SessionRepository + MessageRepository + Lifecycle). Lifecycle-Transition setzt `ended_at = clock()` initial, danach explizites `sessions.update()` mit dem MAX-Wert — kein State-Machine-Touch nötig, weil running/idle → interrupted seit Sprint 5 erlaubt ist. Idempotent: zweiter Pass macht nichts mehr (alle Live-Sessions sind dann bereits interrupted).

---

## Datei-Tab-Persistenz: nur Tab-Liste, kein Buffer-Cache

**Entscheidung:** `useFileTabsStore.hydrateFromStorage` rekonstruiert Tab-Identitäten (id/kind/relPath/label + activeId pro Projekt) aus localStorage und triggert für jeden file-Tab einen `fs:read` im Hintergrund. Unsaved Buffer werden NICHT persistiert — der User muss vor App-Schluss bewusst Ctrl+S drücken (Sprint-7-Konvention „manueller Save").

**Varianten:**

- **A** Nur Tab-Liste, Inhalt re-fetched (gewählt — V5-A)
- **B** Tab-Liste + unsaved Buffer im localStorage
- **C** Tab-Liste + Buffer + Konflikt-UI bei extern editierten Files

**Grund:** Variante B müsste mit dem Edge-Case „Datei wurde extern editiert während App geschlossen war" umgehen — entweder still überschreiben (Datenverlust) oder Konflikt-UI bauen (Variante C). Variante C ist Konflikt-Modal-Aufwand für einen seltenen Fall. Variante A ist konsistent mit Sprint-3-Notes-Save-Pattern (Daten leben in der DB, Restart sauber) und vermeidet das Datei-Konflikt-Problem komplett. Manuelle-Save-Konvention aus Sprint 7 deckt den Buffer-Verlust-Fall: der User ist gewohnt, Ctrl+S zu drücken, weil die Editor-Toolbar einen ●/○-Indikator hat.

**Konsequenz:** Schema-versioniert mit `v: 1` — künftige Tab-Felder können einen Schema-Bump auslösen, der alte Snapshots still verwirft. localStorage-Schreibwege sind in `persistCurrent(getter)` zentralisiert: jede Mutation, die Identität/Reihenfolge/Active-Pointer ändert, schreibt sofort. `setDirty/setSaved` schreiben bewusst nicht — Dirty-Status ist ohnehin nicht persistiert.

---

## Sensitive-File-Patterns: additiv zu hartcoded Defaults

**Entscheidung:** Neue Settings-Spalte `sensitive_file_patterns: string[]` (Default `[]`) wird ZUSÄTZLICH zu den hartcoded Defaults (`.env(.*)`, `secrets.*`, `*.key`, `*.pem`) ausgewertet. Defaults sind nicht abschaltbar — der User kann nur erweitern. User-Patterns matchen auf den ganzen `relPath` (nicht nur den Basename), damit Regeln wie `config/private/.*` möglich sind.

**Varianten:**

- **A** Additiv (gewählt — V8-A)
- **B** User-Patterns ersetzen die Defaults komplett
- **C** Additiv mit `disable_default_sensitive_patterns`-Flag

**Grund:** Die hartcoded Defaults sind universell richtig — es gibt kein Projekt, in dem `.env` *nicht* sensitiv ist. Variante B würde User erlauben, sich versehentlich in den Fuß zu schießen (Defaults löschen, später `.env` exposen). Variante C wäre Phase-2-Power-User-Komfort, kostet aber Komplexität für einen ungeklärten Bedarf. Variante A deckt 100 % der realistischen Custom-Cases ab (eigene Konventionen wie `*.credentials.json`, `vault.yml`) ohne Sicherheits-Downgrade.

**Konsequenz:** `findSensitiveFiles(paths, userPatterns)` nimmt das Array als zweiten Parameter; ungültige RegEx-Quellen werden still gedroppt (Aufrufer kann via `validateUserPatterns` für UI-Hint nachfragen). PreCommitModal reicht `settings.sensitive_file_patterns` durch. Settings-Dialog hat den JSON-Editor in der Workspace-Tab.

---

## Header-Bar: native Frame entfernt, td-titlebar übernimmt komplett

**Entscheidung:** `BrowserWindow` wird mit `frame: false` erstellt — die native Electron-Title-Bar ist weg. Die td-titlebar (36 px hoch, Architektur 6.0) übernimmt Drag-Region (`-webkit-app-region: drag`) und Window-Controls (min/max/close via IPC `app:window-action`). Keine doppelte Header-Reihe.

**Varianten:**

- **A** `frame: false`, nur td-titlebar (gewählt nach User-Screenshot)
- **B** Native Frame + td-titlebar parallel
- **C** Native Frame, keine td-titlebar (Sprint-8-Rückabwicklung)

**Grund:** Variante B war der initiale Sprint-8-Stand und produzierte einen Doppel-Header (Electron's native + meine td-titlebar zeigen beide „TakumiDeck"). User-Feedback zum Screenshot machte das offensichtlich. Variante C würde Brand, Projekt+Branch+Sessions-Anzeige und den Settings-Button verlieren — nicht akzeptabel. Variante A ist die saubere Implementierung der Architektur-6.0-Spec, die ohnehin „Window-Controls (minimieren, maximieren, schließen)" als Teil der Header-Bar definiert hatte.

**Konsequenz:** OS-Resize-Handles bleiben funktional (Electron-Default), Drag funktioniert über `-webkit-app-region: drag` auf `.td-titlebar`, Buttons innerhalb sind `no-drag`. macOS würde traffic-lights verlieren, aber TakumiDeck ist Windows-primär (Architektur K3). Phase 5+ könnte einen `titleBarStyle: 'hidden'`-Pfad für macOS dazustellen, falls die App jemals dorthin portiert wird.

---

## Mid-Spalten-Verteilung: 1.6fr/1fr statt 1fr/1fr

**Entscheidung:** Das App-Grid ist `240px 1.6fr 1fr 232px` — Mid-Spalte (Terminal/Verlauf) bekommt ~62 % der mittleren Fläche, Editor ~38 %. Sprint-7 hatte 1fr/1fr; bei realer Bildschirmbreite war die Tabelle in der HistoryPane + die Filter-Pillen für 50 % zu eng (clipping in `overflow: hidden`).

**Varianten:**

- **A** 1.6fr/1fr — Terminal/Verlauf bekommt mehr Platz (gewählt nach User-Screenshot)
- **B** Bei 1fr/1fr lassen, nur Filter-Wrap fixen
- **C** Editor ein-/ausklappbar machen

**Grund:** Variante B hätte den Filter-Bug allein gefixt, aber die Tabelle bleibt in 6 Spalten auf 640 px gequetscht. Variante C ist Phase-2-Komfort — Toggle-Komponente plus Persist plus Layout-Reflow beim Klick. Variante A ist die billigste Lösung mit dem größten Effekt: zwei Zeichen in `app.css`, Daily-Driver-Workflow „Terminal links + Code-Edit rechts gleichzeitig sehen" funktioniert weiter, Editor ist schmaler aber CodeMirror skaliert problemlos.

**Konsequenz:** Sprint-7-Layout-Spec war nicht eindeutig zu 1fr/1fr — das Design-Handoff-`styles.css` hat das Grid mit `1fr 1fr` gezeichnet, aber das war eher Initial-Wireframe als bindende Spec. Bei 32"-Monitoren (typische Daily-Driver-Konfiguration ~2560 px breit) sind beide Spalten weiter komfortabel groß; bei 14" (~1366 px) ist Mid jetzt ~700 px statt 560 px — knapp ausreichend für die Tabelle.

---

## Build-Distribution: Squirrel-Setup + Portable-ZIP parallel

**Entscheidung:** `npm run make` produziert beide Artefakte: Squirrel-Setup-EXE (klassische Windows-Installation mit Start-Menü-Eintrag) UND Portable-ZIP (entpackbar auf USB-Stick). Forge-Config hatte `MakerSquirrel` + `MakerZIP` schon konfiguriert; Sprint 8 bestätigt das als verbindliche Distribution.

**Varianten:**

- **A** Squirrel-Default mit totem Auto-Updater-Stub
- **B** Squirrel + Portable-ZIP (gewählt — V6-B)
- **C** Nur Portable-ZIP, kein Installer

**Grund:** Variante A reicht für die Stamm-Maschine, hilft aber nicht bei „mal schnell auf der zweiten Maschine probieren" oder „an Freunde weitergeben". Portable-ZIP entspannt zusätzlich den SmartScreen-Stress (kein Code-Signing im MVP, Architektur 12) — Doppelklick auf entpackten Ordner überspringt die Installer-Warnung komplett. Variante C verliert Start-Menü-Komfort und macht Updates schwerer. B kostet kaum mehr Build-Zeit und gibt beide Distribution-Pfade.

**Konsequenz:** Manuelle GitHub-Release-Anleitung in `docs/DEV_SETUP.md`: Version bumpen → `npm run make` → Setup-EXE + ZIP als Asset hochladen → Release publish. Auto-Update wäre Phase 5+ via electron-updater, GitHub Actions Build wäre Phase 5+ bei aktiver Distribution.

---

## Right-Pane-Layout: 4-Spalten-Grid statt 232-px-Single-Pane

**Entscheidung:** App-Layout ist ein 4-Spalten-Grid (240 / 1fr / 1fr / 232 px) mit zwei Zeilen (1fr / 300 px). Editor und Diff bekommen eine eigene breite Spalte (3. Cell, oben); Files und Notes leben als schmaler Stack ganz rechts (4. Cell, full-height); PlanPane sitzt unter dem Editor (3. Cell, unten); StatsPane bleibt unter dem Terminal (2. Cell, unten). Klassen-Vokabular `td-col-mid-top / -mid-bottom / -right-top / -right-bottom / -right-stack` 1:1 aus `docs/design/claude-export/styles.css`.

**Varianten:**

- **A** Single-Right-Pane (232 px, drei Sektionen vertikal: Editor/Diff oben + Files mitte + Notes unten) — Sprint-7-Briefing-Wortlaut
- **B** 4-Spalten-Grid wie Design-Handoff: Editor in eigener `1fr`-Spalte, Files+Notes als `td-col-right-stack`-Spalte ganz rechts (gewählt nach User-Feedback)
- **C** Editor verdrängt das Terminal über einen Mitte-Toggle (Design-Handoff-„midPanel"-Tweak) — wäre Phase-2-Komfort, kostet aber Sicht auf Terminal + Editor parallel

**Grund:** Variante A war der pragmatische Erstwurf aus dem Briefing — 232 px für einen vollständigen Markdown-Editor sind aber zu eng (Code wickelt nach 30 Zeichen, YAML-Linter-Marker schwer lesbar). User-Feedback nach Phase 4: „in der Vorlage sieht es besser aus" — und die Design-Vorlage hat von Anfang an 4 Spalten gezeichnet, nicht 3 mit Editor im schmalen Stack. Variante C wäre ein moderner Toggle-Pfad gewesen, kostet aber den Daily-Driver-Use-Case „Terminal links + Code-Edit rechts gleichzeitig sehen", der das Hauptargument für eine Multi-Pane-Workbench ist.

**Konsequenz:** PlanPane wandert von Mitte-unten nach Editor-unten (3. Spalte, untere Zeile). Die ehemaligen `.td-app-content / -row-top / -row-bottom`-Flex-Container entfallen — das CSS-Grid macht das in einem Schritt. `RightPane.tsx` wird in `EditorPane.tsx` (Editor + Diff) und `RightStack.tsx` (Files + Notes) aufgeteilt, eine Komponente pro Grid-Cell. Die Sidebar verliert ihre explizite 240-px-Breite — Grid-Cell `.td-col-left` ist jetzt die Quelle.

**Implementierungsdetail:** Trennstriche zwischen Cells laufen über `gap: 1px; background: var(--td-line)` am Grid statt über `border-right`/`border-left` an den einzelnen Cells. Genau die Design-Handoff-Implementierung.

---

## Markdown-Editor: manueller Save (Ctrl+S) statt Auto-Save

**Entscheidung:** Ctrl+S triggert `fs:write`; Editor-Toolbar zeigt einen Save-Button und einen Dirty-Indikator („○ tippt…/● gespeichert"). Pure-Logik-Util `editorDirtyState` mit `saved`/`buffer`-Strings + `isDirty/updateBuffer/markSaved`. Auto-Save gibt es bewusst NICHT.

**Varianten:**

- **A** Manueller Save mit Ctrl+S + dirty-Indikator (gewählt — Architektur 6.8 + Roadmap-Wortlaut)
- **B** Debounced Auto-Save 500 ms wie Notes (Memory-Default-Pfad „konvenient vor traditionell")
- **C** Hybrid: Auto-Save 1.5 s + Ctrl+S Force

**Grund:** Notes sind ephemeres Pad-Editing — Auto-Save passt. CLAUDE.md / CHANGELOG / Roadmap-Files sind aber versionierte Doku, die der User bewusst editiert, dann den Diff anschaut, dann den commit-Trigger sendet. Auto-Save würde unbeabsichtigte Tipps sofort persistieren und den manuellen Diff-/Commit-Workflow korrumpieren — der dirty-Stand ist hier ein Feature, nicht ein Reibungspunkt. **Bewusste Abweichung von der „UX-Defaults: konvenient vor traditionell"-Memory-Konvention** — Architektur 6.8 + Roadmap-Spec waren eindeutig, und die Workflow-Begründung trägt.

**Konsequenz:** Memory-Konvention bleibt für reine UX-Picks gültig (Daily-Driver-bevorzugte Pfade), aber Spec hat Vorrang, wenn die App-Workflow-Logik auf Sichtbarkeit von Zwischenzuständen baut (hier: dirty vs. saved als Trigger für die User-Entscheidung „commit jetzt vs. weiter editieren").

---

## Datei-Tab-Stack pro Projekt statt globale Tab-Liste

**Entscheidung:** `useFileTabsStore` hält `tabs: Record<projectId, FileTab[]>` und `activeId: Record<projectId, string|null>`. Beim Project-Wechsel sieht der User die Datei-Tabs des neuen Projekts; die alten bleiben in-memory erhalten und kommen zurück, wenn er das Projekt erneut aktiviert. Diff-Tab ist Sonderfall mit fester ID `'diff'` und sitzt immer ganz links pro Projekt-Stack.

**Varianten:**

- **A** Alle Datei-Tabs verwerfen beim Project-Wechsel
- **B** Per-Projekt-Stack analog Sprint-4-Terminal-Tabs (gewählt)

**Grund:** Daily-Driver-Case ist Multi-Tasking zwischen Projekten — A würde User dauerhaft frustrieren. B ist konsistent mit dem etablierten Terminal-Tab-Pattern (Sprint 4 Variante A: Tabs sind projekt-scoped, alle dauerhaft mounted). Implementierungsaufwand für B: ~80 Zeilen Store + 12 Tests; A wäre ~10 Zeilen, hätte aber UX-Schaden.

**Konsequenz:** Persistenz nur In-Memory beim App-Lauf — kein DB-Schema-Touch (Sprint-7-Auflage „keine neue Migration"). Beim App-Restart sind die Datei-Tabs weg, genau wie Terminal-Tabs in Sprint 4. Phase 2+ kann das in `localStorage` persistieren, wenn der Daily-Driver-Use-Case das fordert.

---

## Sensitive-File-Patterns: hartcoded statt konfigurierbar

**Entscheidung:** Pure-Logik-Util `isSensitiveFile` matcht den Datei-Basename gegen vier RegEx-Pattern: `^\.env(\..+)?$/i`, `^secrets\..+$/i`, `\.key$/i`, `\.pem$/i`. Settings-konfigurierbar wäre eine `sensitive_file_patterns: string[]`-Spalte in `AppSettings` — bewusst nicht implementiert.

**Varianten:**

- **A** Hartcoded-Liste (gewählt)
- **B** Konfigurierbar via `settings.json` mit denselben Defaults

**Grund:** Settings-Dialog kommt erst Sprint 8 — bei B müsste der User bis dahin die `settings.json` per Texteditor anfassen, um eigene Patterns zu ergänzen. Defaults decken die Standard-Cases (Twelve-Factor-`.env`, CI-Secrets, SSL-Keys/PEMs) bereits ab. „Hartcoded mit klarem Erweiterungs-Pfad bei echtem User-Bedarf" ist sauberer als „konfigurierbar, aber ohne UI".

**Konsequenz:** Sprint 8 (Settings-Dialog) kann die Liste in den UI-Editor ziehen, wenn nach erstem User-Test echte Custom-Patterns nachgefordert werden. Das `findSensitiveFiles`-API ist schon driver-frei, der Settings-Hook wäre eine 5-Zeilen-Verdrahtung.

**Implementierungsdetail:** Match läuft auf den BASENAME, nicht auf den ganzen Pfad — sonst würde `docs/keyboard-notes.md` als sensitiv markiert, weil der Pfad „key" enthält. Defensiv-Test deckt diesen False-Positive-Pfad ab.

---

## Diff-Viewer: @codemirror/merge.unifiedMergeView pro Datei statt Patch-Renderer

**Entscheidung:** Diff-Tab zeigt eine File-Liste oben (klickbar) und unten den Inline-Diff der ausgewählten Datei via `@codemirror/merge.unifiedMergeView`. Der Renderer holt parallel `git:show` (HEAD-Version) und `fs:read` (Working-Tree-Inhalt) und übergibt beide an die Extension — die berechnet den Diff intern und markiert Hinzufügungen/Löschungen inline.

**Varianten:**

- **A** Raw `git diff`-Output in einem CodeMirror-Plain-View mit eigener `+ / -`-Färbung (Design-Handoff-Pattern in `claude-export/components.jsx` `DiffViewer`)
- **B** `@codemirror/merge.unifiedMergeView` mit HEAD-Version als `original` (gewählt — Architektur 6.7 + Sprint-7-Briefing-Wortlaut)
- **C** Side-by-side `MergeView` aus demselben Paket — wäre Phase-2-Komfort, braucht mehr horizontalen Platz

**Grund:** Architektur 6.7 sagt explizit „Render mit @codemirror/merge"; das Briefing wiederholt das. Variante A war einfacher (kein zusätzliches `git:show`-IPC), hätte aber die Spec gebrochen und wäre kein „echter" Inline-Diff (kein Edit-fähiges Original-Reference). Variante C ist Phase 2 — im 1fr-breiten Editor-Slot reicht unified.

**Konsequenz:** Neuer IPC-Channel `git:show` mit `showFile(repoPath, relPath, ref='HEAD')`-Method im GitDriver. Untracked Files werfen einen simple-git-Error („exists on disk, but not in HEAD") — der Driver fängt das ab und liefert leeren String, sodass der unifiedMergeView alle Working-Tree-Zeilen korrekt als Hinzufügung markiert. Read-only via `EditorView.editable.of(false) + EditorState.readOnly.of(true)`.

---

## Sidebar-Layout: 3 Sektionen statt View-Toggle

**Entscheidung:** Die LeftSidebar rendert drei vertikal gestapelte `td-panel`-Sektionen (Projekte / Aktive Sessions / Verlauf) wie im Claude-Design-Handoff (`docs/design/claude-export/components.jsx`). Klick auf ein aktives Tab-Item wechselt zur Terminals-Hauptansicht und aktiviert den Tab; Klick auf einen Verlauf-Eintrag wechselt zur Replace-View des HistoryPane mit dem Item vorausgewählt. Modal-State (NewSession/Templates) liegt im `useUiStore`, weil sowohl die Sidebar als auch die Tab-Bar Buttons besitzen, die dieselben Modale öffnen.

**Varianten:**

- **A** Projekt-Liste + View-Toggle „Tabs / Verlauf" pro aktivem Projekt (Sprint-6-Initial-Implementation)
- **B** 3 Sektionen wie im Design-Handoff (gewählt)
- **C** Sidebar nur für Projekte; Tabs und Verlauf ausschließlich oben/im Replace-View

**Grund:** Variante A war der pragmatische Erstwurf für den Replace-View-Pattern (Q4 Variante A), aber der User-Feedback-Hinweis war eindeutig: das Design-Handoff hat von Anfang an drei Sektionen geplant, und die volle Sichtbarkeit ist für Daily-Driver-UX wertvoll — Aktive Sessions in der Sidebar erlauben Multi-Tab-Übersicht ohne Tab-Bar-Scrolling, und der Verlauf-Quick-Access (10 jüngste pro Projekt) macht den Schritt ins HistoryPane optional. Variante C verschenkt diesen Komfort komplett.

**Konsequenz:** Tab-Bar oben im Hauptbereich BLEIBT — Sidebar und Tab-Bar sind synchronisierte Ansichten. Doppelte UI-Pfade sind hier Feature, nicht Bug: in der Praxis nutzt der User die Sidebar zum Multi-Tab-Überblick und die Tab-Bar zum Schnellwechsel beim Schreiben. Tote `.td-sidebar-*`-CSS-Blöcke aus dem Pre-3-Sektionen-Layout sind als TECH_SCHULDEN-Eintrag markiert.

**Implementierungsdetail:** Verlauf-Quickliste in der Sidebar filtert Tabs aus, die schon offen sind — sonst würde derselbe Eintrag als „aktive Session" UND als „letzter Verlaufs-Eintrag" doppelt erscheinen. Das volle HistoryPane mit Filter und Tabelle bleibt für die Suche, die Sidebar-Quickliste ist nur Quick-Access für die jüngsten 10 Einträge.

---

## × auf Tab ist non-destruktiv, Archive ist explizit

**Entscheidung:** Sprint 3 hatte `× = archive + PTY-Kill` als ein Schritt; Sprint-6-UX-Fix trennt das in zwei Aktionen. `session:close` killt nur den PTY (falls running) und überlässt den Lifecycle-Übergang dem `pty:exit`-Handler (running/idle → completed). Der neue `session:archive`-Channel macht die explizite Lifecycle-Transition zu archived und ist nur über den Verlauf-Detail-Pane mit Inline-Confirmation erreichbar.

**Varianten:**

- **A** × schließt nur den Tab, kein Archive (= aktuelle Variante B-Logik), kein UI-Pfad zum Archivieren
- **B** A + Archive-Button im Verlauf-Detail-Pane mit Confirmation (gewählt)
- **C** × öffnet Confirmation-Modal („schließen / archivieren / abbrechen")
- **D** × wie Sprint 3 archiviert direkt, aber `archived → running` in der State-Machine erlauben

**Grund:** Editor- und Browser-Konventionen sehen × konsistent als „Tab weg, Datei/Inhalt bleibt" — Sprint-3-Spec brach das mentale Modell. Variante D weicht den `archived`-Endzustand der State-Machine auf, was die Sprint-3-Truth-Table-Tests entwertet und den semantischen Unterschied zwischen completed und archived verschwimmen lässt. Variante C zwingt Modal-Overhead pro × auf den 95-%-Fall (= „Tab weg") nur um den 5-%-Fall (= „wirklich loswerden") abzudecken. Variante A allein versteckt den Archive-Pfad komplett — Sessions stapeln sich ohne UI-Weg zum Aufräumen. B ist die einzige Variante, die beide Fälle sauber trennt: häufiger Pfad ist non-destruktiv, seltener Pfad hat einen klaren Knopf an der erwarteten Stelle.

**Konsequenz:** Sprint-3-Lifecycle-State-Machine bleibt **unverändert** — `archived` ist weiter Endzustand, alle Truth-Table-Tests grün. Die Trennung lebt rein in den IPC-Handlern und der UI: × → `session:close`, Archivieren-Button → `session:archive`. Default-Filter im HistoryPane blendet `archived` aus, damit die Liste nicht mit Karteileichen verstopft.

**Implementierungsdetail:** Inline-Confirmation statt Modal. Erster Klick auf „Archivieren" zeigt einen roten Banner mit „Wirklich? Session ist danach nicht mehr resume-fähig" plus Abbrechen + „Ja, archivieren". Zweiter Klick führt aus. Wenn der User den selektierten Eintrag wechselt, wird der Confirm-Marker automatisch abgeräumt — der Bestätigungs-Zustand klebt nicht auf der falschen Zeile.

---

## Resume-Bug-Fix: claude --session-id beim Spawn + Watcher-Backfill (Variante C)

**Entscheidung:** TakumiDeck spawnt neue Sessions mit `claude --session-id <takumi-uuid>`, sodass claude-codes interne Session-UUID identisch mit unserer `sessions.id` ist und `--resume <takumi-uuid>` nahtlos matcht. Für Legacy-Sessions (Sprint 2/3 + pre-Hotfix Sprint 6, gespawnt ohne `--session-id`) befüllt der JSONL-Watcher rückwirkend eine neue Spalte `sessions.claude_session_id` aus der UUID des JSONL-Filenamens. Resume nutzt `claude_session_id ?? id` und gibt `SESSION_NO_CLAUDE_UUID` zurück, wenn beides null ist.

**Varianten:**

- **A** Nur `--session-id` beim Spawn (neue Sessions sofort resume-fähig, Legacy-Sessions bleiben tot)
- **B** Nur Watcher-Backfill (Legacy-Sessions werden lebensfähig, neue Sessions haben Race-Window von ~100 ms-2 s nach Spawn)
- **C** Beide kombiniert (gewählt)

**Grund:** Sprint-5-ENTSCHEIDUNGEN.md („Sessions-Mapping über encodeCwd statt UUID") hatte angenommen, claude-code akzeptiere kein `--session-id`-Flag — Stand 2026-05-10 ist das überholt (siehe `claude --help`). Variante A war der saubere Weg für neue Sessions, hätte aber alle bestehenden Test-Sessions des Users dauerhaft als „nicht resume-fähig" zementiert (~19 Legacy-Sessions plus die in Sprint 6 erstellten). Variante B brachte für neue Sessions ein Race-Window — beim ersten Resume-Versuch direkt nach Spawn könnte die UUID noch nicht backfilled sein. C kombiniert die jeweiligen Stärken: Spawn-Pfad ist race-frei (UUID ist beim DB-Insert schon bekannt), Backfill-Pfad heilt den Altbestand sobald der Watcher die JSONL einmal gesehen hat.

**Konsequenz:** Migration `0003_claude_session_id.sql` mit nullable Spalte; alle bestehenden Rows bekommen `NULL`. `setClaudeSessionId(sessionId, claudeUuid)` ist idempotent (UPDATE WHERE id = ? AND claude_session_id IS NULL → atomarer Check-and-Set), kann pro JSONL-Tick aufgerufen werden, ohne vorher zu prüfen. Watcher-Backfill ist status-agnostisch (`listMissingClaudeSessionId()` liefert running/idle/completed/interrupted/error/archived), damit auch Legacy-completed-Sessions geheilt werden — Sprint-5-Live-Pfad (`resolveTakumiSession`) bleibt auf running/idle, weil dort Token-Inserts stattfinden und Doppelzählung bei completed unerwünscht wäre.

**Implementierungsdetail:** UUID-Extraktion erfolgt aus dem JSONL-Filename (`<uuid>.jsonl`), nicht aus der `sessionId`-Spalte der einzelnen Zeilen — pro File schreibt claude-code GENAU eine UUID, der Filename ist die einzige Quelle der Wahrheit. Bei mehreren Backfill-Kandidaten im selben encoded-cwd-Folder (mehrere TakumiDeck-Sessions ohne UUID, alle im selben Projekt) gewinnt die jüngste — gleiche Heuristik wie Sprint-5-`resolveTakumiSession`. Die Mehrdeutigkeit ist als TECH_SCHULDEN-Eintrag dokumentiert.

---

## Atomare Season-Counter-Allocation im Main

**Entscheidung:** `pty:create`-Handler ruft `projects.allocateSeasonNumber(projectId)` in einer better-sqlite3-Transaction (SELECT + UPDATE) auf, bevor die Session-Row geschrieben wird. Das returnt die Vorgänger-Nummer als Season-Wert; `next_season_number` ist danach um 1 höher persistiert. Nur für `type='feature'` — Bug/Review/Docs-Sync bekommen `null` (Architektur 6.6).

**Varianten:**

- **A** Renderer liest `next_season_number` aus dem Project-Store, vergibt sie im Modal, schickt sie als Teil des `pty:create`-Payloads
- **B** Atomar im Main-Handler in einer Transaction (gewählt)

**Grund:** Renderer-Increment ist die natürliche Quelle künstlicher Lücken: bei Modal-Abbruch wäre die Nummer schon vergeben, beim Spawn-Fehler ebenso, und zwei parallel geöffnete Modals könnten dieselbe Nummer ziehen. Variante B macht die Allocation race-frei — better-sqlite3-Transaktionen sind synchron + lokales File, der einzige verbleibende Lücken-Fall ist ein Hard-Crash zwischen Increment und sessions.create-Insert (Mikrosekunden-Fenster). Architektur 6.6 akzeptiert Lücken explizit, also kein Rollback-Aufwand nötig.

**Konsequenz:** Modal-Vorschau ist eine separate read-only-Berechnung (`activeProject.next_season_number` direkt aus dem Store), nicht durch einen IPC-Roundtrip. Wenn der User schnell zwei Sessions hintereinander öffnet, kann die zweite Modal-Vorschau einen veralteten Wert zeigen — der echte atomare Increment im Main vergibt aber die korrekte nächste Nummer. Akzeptable Drift, weil die Vorschau Komfort, nicht Wahrheit ist.

**Implementierungsdetail:** Driver-Methode `allocateSeasonNumber(projectId): number | null` mit Transaction in `SqliteProjectDriver`; Test-Driver simuliert das durch ein einfaches Read-Modify-Write im Map. Returnt null, wenn das Projekt nicht existiert — Defense-in-Depth, weil der Renderer-Filter im Sprint-4-Layout das eigentlich nicht zulässt.

---

## Verlauf-Panel als Replace-View statt Modal

**Entscheidung:** Die Verlauf-Liste mit Filter und Detail-Pane lebt im Hauptbereich des Layouts (= Tab-Slot wird bei `mainView === 'history'` durch das `HistoryPane` ersetzt), nicht in einem Modal-Overlay. TabContainer und HistoryPane werden BEIDE im DOM gerendert — der Wechsel ist nur ein CSS-`display`-Toggle, damit die xterm-Buffer der laufenden Tabs nicht disposed werden (Sprint-3-Pattern: alle Terminals dauerhaft mounted).

**Varianten:**

- **A** Replace-View (gewählt)
- **B** Modal-Overlay (analog UsageDetailModal)
- **C** Sidebar-Sub-Sektion mit Detail-Inline

**Grund:** Tabelle mit 6 Spalten + Filter-Bar + Detail-Pane braucht horizontalen Platz — ein Modal wäre dafür gequetscht (max 540 px Standard / 820 px wide), die Sidebar mit 240 px komplett unzureichend. Replace-View nutzt die volle Bildschirmbreite, und das Pattern ist konsistent zum Workspace-Sprint (Sidebar-Klick ändert Hauptansicht). Variante B würde zudem den TabContainer beim Modal-Open verdecken, der User verliert die laufenden Sessions aus dem Sichtfeld.

**Konsequenz:** App.tsx rendert beide Views (`<TabContainer>` + `<HistoryPane>`) parallel, mit `display: none/flex` je nach `mainView`. xterm-Lifecycle bleibt intakt, kein Buffer-Verlust beim Wechsel. HistoryPane registriert seine eigenen useEffect-Cleanups beim Unmount — also kein Memory-Leak, falls der User das Projekt komplett wechselt.

**Implementierungsdetail:** Klick auf einen Verlauf-Eintrag in der Sidebar setzt `historySelectedId` im UiStore + wechselt `mainView` auf `history`. HistoryPane synchronisiert seinen lokalen `selectedId` aus dem Store — der lokale State erlaubt Klicks IM HistoryPane, ohne dass jeder Klick durch Zustand-Cycle rendern muss.

---

## Templates: on-demand-Discovery und beide Quellen separat

**Entscheidung:** `fs:list-templates` läuft on-demand bei jedem Modal-Open, ohne chokidar-Watcher. Globaler Ordner (`%APPDATA%\TakumiDeck\templates`) und Per-Projekt-Ordner (`<projekt>\docs\templates`) plus Legacy-Konvention (`<projekt>\docs\*_TEMPLATE.md`) werden gescannt; jedes Template trägt einen `source`-Tag (`'global'` oder `'project'`). Konflikte bei gleichem Dateinamen werden NICHT aufgelöst — beide Einträge erscheinen nebeneinander.

**Varianten:**

- **A** Initial-Scan beim App-Start mit Cache, manueller Re-Scan-Button
- **B** On-Demand beim Modal-Open (gewählt)
- **C** Live-Watcher analog Sprint-5-JSONL-Watcher
- Konflikt-Auflösung: Per-Projekt-Override / **beide separat** (gewählt) / Hard Error

**Grund:** Templates ändern sich selten und sind klein (typisch <10 Files pro Projekt). Variante A spart ~50 ms beim ersten Modal-Open, zwingt aber zu einem Re-Scan-Knopf für den Edge-Case „User hat gerade ein Template angelegt". Variante C baut eine ganze Watcher-Infrastruktur für ein gelöstes Problem — der Initial-Scan-Code aus Sprint 5 (chokidar v5 + ignored-Predicate) ist nicht trivial, und Templates rechtfertigen den Aufwand nicht. B ist die einfachste Variante, die alle Cases abdeckt.

Für die Konflikt-Auflösung: Per-Projekt-Override hat den klassischen „warum geht mein globales Template hier nicht?"-Stolperstein und verlangt eine Einstellung zum Aushebeln. Hard-Error blockt einen seltenen Edge-Case mit einem UX-Bremsklotz. „Beide separat mit Source-Tag" macht den Konflikt sichtbar (kleiner Badge „Global" / „Projekt") und überlässt dem User die Wahl.

**Konsequenz:** TemplatesModal lädt bei jedem Open via `fs:list-templates`. Die Listen-Sortierung ist fix: globale zuerst (alphabetisch), dann Per-Projekt (alphabetisch). Variable-Filling-UI rendert nur die Felder, die das gewählte Template tatsächlich braucht — `findVariablesInTemplate` liefert die Tokens, die UI zeigt nur dazu passende Inputs.

---

## Sessions-Mapping über encodeCwd statt UUID

**Entscheidung:** TakumiDeck-Sessions matchen ihre claude-code-JSONL-Datei NICHT über die UUID im Filename, sondern über den encoded-cwd-Anteil im Eltern-Ordnernamen. claude-code vergibt seine eigene Session-UUID intern; unsere `sessions.id` ist davon entkoppelt. Der Watcher encoded den `cwd` jeder running/idle-Session nach demselben Schema (`:/\\` → `-`) und vergleicht mit `path.basename(path.dirname(filePath))`. Bei mehreren Sessions im gleichen Projekt-Ordner gewinnt die jüngste (höchstes `started_at`).

**Varianten:**

- **A** UUID-Filename ↔ `sessions.id` matchen (Sprint-5-Briefing-Annahme — beim Smoke-Test sofort als falsch erkannt)
- **B** encodeCwd-Match mit jüngster Session als Tiebreaker (gewählt)
- **C** Beim PTY-Spawn die JSONL-UUID aus der ersten Zeile des frischen Files lesen und ein Mapping persistieren

**Grund:** Architektur-Kapitel 4 hatte den Pact „sessions.id matched zu Claude Codes session-uuid" angenommen — claude-code liefert das aber nicht ab, weil es seine UUID intern vergibt und keinen `--session-id`-Flag entgegennimmt. Variante A scheiterte beim ersten Smoke-Test in Sprint 5 (alle JSONLs landeten als „extern" markiert, messages-Tabelle blieb für die aktive Session leer). Variante C wäre der robusteste Weg (1:1-Mapping in einer eigenen Tabelle), kostet aber: Race zwischen Spawn-Zeitpunkt und JSONL-Anlage, Watcher-First-Read-Logik um die Mapping-Zeile zu erkennen, plus Sprint-2-Schema-Erweiterung. Für 2-5 parallele Tabs reicht Variante B mit dem „jüngste gewinnt"-Tiebreaker — bei Bedarf später ohne Datenverlust nach C migrierbar.

**Konsequenz:** `messages.session_id` ist weiterhin unsere TakumiDeck-Session-ID, nicht die claude-UUID. Der Filename der JSONL-Datei wird nirgends gespeichert (außer in `jsonl_offsets.file_path` als Lookup-Key). Wenn der User parallel im selben Projekt zwei Tabs offen hat und in beiden gleichzeitig prompted, kann der jüngere Tab fälschlich Tokens des älteren zugewiesen bekommen — Limitation in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), für 2-5-Tab-Realität tolerabel.

**Implementierungsdetail:** `encodeCwd(cwd)` ist verlustbehaftet (mehrere `cwd`-Werte können denselben encoded-cwd erzeugen, wenn ein Pfadsegment selbst `-` enthält). Aktuelle Heuristik akzeptiert das, weil claude-code die Konvention konsistent benutzt — solange wir gegen denselben Encoder matchen, geht nichts verloren.

---

## Token-Persistenz: messages + usage_buckets parallel

**Entscheidung:** Pro JSONL-Zeile mit `usage`-Feld schreibt der Watcher zwei Stellen: einen Insert in `messages` (Per-Session-Detail) und einen Upsert in `usage_buckets` (Hourly-Aggregat pro Modell). Beide Tabellen waren in Architektur Kapitel 4 vorgesehen; Sprint 5 ist der erste Sprint, der sie befüllt.

**Varianten:**

- **A** Beide Tabellen wie Architektur 4 vorsieht (gewählt)
- **B** Nur `usage_buckets`, Per-Session-Detail bei Bedarf aus dem JSONL-File on-demand tailen
- **C** Nur `messages`, Aggregate zur Lesezeit per `GROUP BY` berechnen

**Grund:** A ist die einzige Variante, die gleichzeitig schnelle Plannutzungs-Bars (= Aggregat-Reads aus `usage_buckets`) und Sprint-6-Verlauf-Panel (= Per-Session-Token-Zahlen aus `messages`) bedient. C wird bei wachsendem Datenvolumen merklich langsam — der 5h-Bar müsste bei jedem Push tausende Messages gruppieren. B verschiebt die Komplexität in den Sprint-6-Pfad, der dann erneut den JSONL-Tail brauchen würde — duplizierter Lesepfad, der schon vom Sprint-5-Watcher abgedeckt ist.

**Konsequenz:** Schreib-Aufwand pro Zeile verdoppelt sich (zwei Inserts), aber better-sqlite3 ist synchron und schnell genug, um mit dem 100-ms-`awaitWriteFinish`-Cadence Schritt zu halten. Sprint 6 (Verlauf-Panel) und Phase 2 (Heatmap) lesen jeweils aus der passenden Tabelle, ohne JSONL-Tail. Externe claude-Sessions (ohne TakumiDeck-Spawn) tragen weiter zu `usage_buckets` bei (für die globalen 5h/weekly-Bars), landen aber NICHT in `messages` — sie haben keine TakumiDeck-Session-Zuordnung.

**Implementierungsdetail:** `messages.tokens_in` summiert `input_tokens + cache_creation + cache_read` (statt nur `input_tokens`). Damit fallen Cache-Treffer in den Per-Session-Kontext-Wert mit ein, was claude-codes eigenem `/context` näher kommt. Cache-Anteile getrennt zu persistieren wäre Sprint-6-Schema-Erweiterung, falls das Verlauf-Panel das braucht.

---

## JSONL-Watcher-Scope: globaler chokidar mit Initial-Scan

**Entscheidung:** chokidar-Watch über das gesamte `~/.claude/projects/`-Verzeichnis ab App-Start, mit `ignoreInitial: false` für den vollständigen Initial-Scan aller existierenden JSONL-Dateien. Filterung auf `.jsonl`-Endung über das `ignored`-Predicate (chokidar v5 hat den Glob-Support entfernt). Pro Datei persistierter Byte-Offset in der `jsonl_offsets`-Tabelle (Migration `0002`); Re-Reads beim nächsten App-Start kosten 0 Bytes pro unveränderter Datei.

**Varianten:**

- **A** Globaler Glob mit Initial-Scan, persistierte byte-offsets (gewählt)
- **B** Nur JSONLs aktuell laufender Sessions (Target-Watch on demand), keine Historie
- **C** Lazy: chokidar-Watch nur auf Verzeichnis, Add-Events triggern pro neuer Datei

**Grund:** Variante B verfehlt den eigentlichen Sprint-5-Zweck — die globalen 5h/weekly-Bars brauchen historische Daten als P90-Datenbasis (192-h-Fenster). Ohne Initial-Scan zeigen sie wochenlang Fallback-Werte, nicht die echten Limits. Variante C addiert eine Discovery-Schicht über fs.readdir, die nichts gegenüber chokidars eingebauter Recursive-Walk gewinnt. A skaliert mit ~7 JSONLs pro Projekt × ~10 Projekten beim User in unter 2 Sekunden — vertretbarer Cold-Start.

**Konsequenz:** chokidar v5 unterstützt keine Glob-Pattern mehr (Mid-Sprint-Discovery). Statt `.../**/*.jsonl` watchen wir den Root und filtern Non-JSONL-Files via `ignored`-Predicate. `awaitWriteFinish: 100 ms` schützt gegen partielle Writes, kostet aber Latenz: bei aktiv schreibenden Files (laufende claude-Antwort) kommt der Update-Event erst, wenn das File für 100 ms ruht — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md). `ready`-Event mit Info-Log als Diagnose, damit Initial-Scan-Probleme im `main.log` sichtbar sind.

**Implementierungsdetail:** Anti-Reentrancy pro Datei: chokidar kann `change`-Events sehr schnell hintereinander auslösen, aber unsere `handleFile`-Logik ist async (file-IO + DB). Eine `Map<filePath, Promise>` serialisiert das, damit der zweite Event nicht denselben Bytes-Bereich nochmal liest.

---

## Recharts-Strategie: CSS-Bars top-level, Recharts nur im Detail-Modal

**Entscheidung:** Die Top-Level-Plannutzungs-Bars (5h, weekly_*, Per-Session-Kontext) sind reine CSS-Bars (`<div>` mit `width: <percent>%` plus Schwellen-Farb-Klassen). Recharts kommt erst im `UsageDetailModal` zum Einsatz — dort als Linien-Diagramm für die Per-Modell-Burn-Rate.

**Varianten:**

- **A** CSS-Bars top-level + Recharts im Detail-Modal (gewählt)
- **B** Pure Recharts überall — Bars + Tooltips aus `BarChart`
- **C** Dünner Wrapper um Recharts mit `td-*`-Token-Vorbelegung

**Grund:** Recharts hat keine Theme-API; das Anpassen an `tokens.css`-Variablen (`--td-accent`, `--td-warn`, etc.) erfordert Inline-Style-Overrides für jede SVG-Komponente. Für 5 Top-Level-Bars ist das mehr Wrestling als Mehrwert — eine CSS-Bar ist 30-40 Zeilen Markup + Style, perfekt token-konform und mit vollem Hover/Click-Verhalten. Recharts dort einsetzen, wo es Mehrwert hat: Detail-Modal mit echter Zeitreihe / Per-Modell-Aufschlüsselung. Variante B wäre Engineering-Lärm, Variante C ein Wrapper, der aktuell nur an einer einzigen Stelle gebraucht würde.

**Konsequenz:** Recharts ist als Dependency installiert (Architektur 2 hat sie ohnehin vorgesehen) und wird im `UsageDetailModal` direkt benutzt — kein eigener Theme-Layer. Wenn Phase 2 mehr Recharts-Stellen braucht (Heatmap-Variante etc.), kann ein Token-Wrapper später nachgerüstet werden, wenn der Bedarf klar ist.

---

## State-Detection-Heuristik: rein Last-Event-Timestamp

**Entscheidung:** Die Sprint-5-State-Detection klassifiziert running/idle ausschließlich über den Timestamp der letzten JSONL-Zeile pro Session: jünger als 3 Sekunden = `running`, sonst `idle`. Alle 2 Sekunden läuft eine Loop im Main-Prozess, die für jede Session im Status `running` oder `idle` die Klassifikation neu ermittelt und ggf. via `SessionLifecycle.transition` umschreibt.

**Varianten:**

- **A** Last-Event-Timestamp wie Architektur 6.2 (gewählt)
- **B** Typ-bewusst (bestimmte JSONL-Message-Types als „aktiv", andere ignorieren)
- **C** PTY-Stdout-Activity-Bursts als zweite Quelle parallel zu JSONL

**Grund:** Architektur 6.2 spezifiziert Variante A wörtlich („last line <3 s ago"), und sie ist trivial gegen Driver-Injection testbar (Pure-Logik mit Fixed-Clock + InMemory-Repo). Variante B (Permission-Prompt-Recognition, `waiting`-Status) ist explizit Phase-2-Material in Architektur 8 — drift-anfällig gegen Claude-Code-Format-Änderungen, kein Sprint-5-Bedarf. Variante C löst ein Problem, das wir noch nicht haben (JSONL-Latenz reicht in der Praxis).

**Konsequenz:** Lifecycle-State-Machine erweitert um `running ↔ idle`. `running → waiting` bleibt explizit verboten — Phase 2 wird das durch eine bewusste ALLOWED-Map-Änderung freischalten, nicht versehentlich. Sessions ohne Messages (frisch gespawnt, claude tippt noch nicht) werden NICHT auf `idle` gesetzt — sonst würde ein neuer Tab sofort grau erscheinen, bevor der erste Output kommt.

---

## Workspace-Scan: Async-Walk mit Konkurrenz-Limit

**Entscheidung:** Der Workspace-Scanner läuft als async-rekursiver Walk auf `fs.promises.readdir`, mit einem schmalen Promise-Pool (Konkurrenz-Default 4). Stop-Marker pro Subordner: `CLAUDE.md` (= Projekt erkannt, Recurse stoppt) oder `.git/` ohne `CLAUDE.md` (Stop ohne Erkennung). Versteckte Verzeichnisse und `node_modules` werden übersprungen. Max-Depth 5.

**Varianten:**

- **A** Async-Walk mit Konkurrenz-Limit (gewählt)
- **B** Sync-Walk via `fs.readdirSync`
- **C** Lazy On-Demand: erst beim ersten Sidebar-Refresh-Klick scannen

**Grund:** Bei einem persönlichen Tool mit 1–3 Projekten wäre B in der Praxis kaum unterscheidbar von A — aber sobald der Workspace mal 50 Subordner trägt, blockiert sync den Main-Prozess für die Scan-Dauer und IPC-Calls hängen währenddessen. Variante C verschiebt den UX-Hit auf den ersten Sidebar-Klick (leere Sidebar nach Cold-Start) ohne nennenswerten Gewinn. A skaliert mit, ohne den Initial-Code aufzublähen — das Driver-Pattern (`FsLikeDriver`) macht Tests gegen synthetische Fake-Trees identisch leicht wie bei B.

**Konsequenz:** Phase-2 wird ohnehin auf einen `chokidar`-Live-Watcher umsteigen — der ist auch async. A passt nahtlos. Die `realFsDriver`-Implementation schluckt erwartbare fs-Errors (`EACCES`/`ENOENT`/`ENOTDIR`/`EPERM`) und liefert Best-Effort, sodass ein einziger nicht-lesbarer Subordner den ganzen Scan nicht abbricht.

**Implementierungsdetail:** `versteckte Verzeichnisse` (Punkt-Präfix außer `.git`) und `node_modules` werden hart aus dem Recurse-Set rausgenommen — kein Setting, weil Architektur 6.1 die Marker-Logik fix vorgibt und die Ausschlüsse pragmatisch sind (sonst kämen `.cache`-Trees mit ihren CLAUDE.md-artigen Files als Fehl-Erkennung rein).

---

## CLAUDE.md-Parser: gray-matter + zod-validierte `workbench`-Section

**Entscheidung:** TakumiDeck verwendet `gray-matter` für die Trennung von YAML-Frontmatter und Markdown-Body. Die `workbench:`-Section wird nachgelagert durch `ClaudeMdFrontmatterSchema` (zod) validiert — `trigger_phrases.docs_update` und `trigger_phrases.commit` sind strict-Pflicht, alle anderen Felder optional. „Datei ohne Frontmatter" und „Frontmatter ohne `workbench:`-Section" sind legitime Zustände (Result.ok mit `frontmatter: null`); kaputte YAML oder fehlende Trigger-Phrasen liefern klare Result-Errors mit Codes.

**Varianten:**

- **A** `gray-matter` als kombiniertes Paket (gewählt)
- **B** `js-yaml` + handgeschriebene `---`-Splitter-Logik
- **C** Vollständig handgeschriebener Mini-YAML-Parser (keine npm-Dependency)

**Grund:** Der Markdown-Body von CLAUDE.md kann selbst `---`-Trennlinien enthalten (Architektur-Doku tut es) — ein selbst geschriebener Splitter würde dort schon stolpern. BOM-Bytes (Windows-Notepad), CRLF und alternative Trenner-Stile sind ebenfalls Edge-Cases, die `gray-matter` als de-facto-Standard im Markdown-Ökosystem längst kapselt. Bundle-Differenz ist im Electron-Kontext irrelevant. Variante C erfindet etablierte YAML-Semantik nochmal selbst und ist gegen den Aufwand-Gegenwert nicht zu rechtfertigen.

**Konsequenz:** `js-yaml` kommt als transitiver Sub-Dependency mit; falls Sprint 7 (Markdown-Editor mit Inline-YAML-Validierung) eine direkte Verwendung braucht, ist es schon im Tree. Strict-Pflicht für Trigger-Phrasen schützt Working-Rule-3 und 5: ohne sie kann der Workflow nicht funktionieren, also lieber sofort einen sprechenden Fehler als später undefined-Cascading.

---

## Default-Project-Migration: Auto-Match per cwd-Prefix mit Legacy-Bucket

**Entscheidung:** Beim ersten Sprint-4-Start wird das Sprint-2-Default-Project (UUID `…0001`) als Legacy-Bucket in der Sidebar sichtbar gemacht und ein einmaliger `cwd`-Prefix-Match-Pass läuft: für jede Session mit `project_id = DEFAULT_PROJECT_ID` wird geprüft, ob `session.cwd` innerhalb eines neu erkannten Project-Pfads liegt. Treffer → Session wird per FK-Update auf das echte Project umgehängt. Kein Treffer → Session bleibt am Default-Bucket; der Bucket wird in der Sidebar nur angezeigt, solange `session_count > 0` ist.

**Varianten:**

- **A** Auto-Match per cwd-Prefix beim ersten Sprint-4-Start, Rest bleibt sichtbar als Legacy (gewählt)
- **B** Default-Project bleibt unsichtbar in der Sidebar, Sessions hängen still daran weiter
- **C** Confirm-Dialog beim Start: „X Legacy-Sessions löschen oder behalten?"

**Grund:** Variante A ist datenverlust-frei *und* räumt sichtbar auf — alle Sessions, deren `cwd` auf ein erkanntes Projekt fällt, wandern automatisch dorthin; was nicht passt, bleibt sichtbar erreichbar (sobald Sprint 6 das Verlauf-Panel hat). Variante B versteckt eine wachsende Karteileichen-Menge ohne UI-Pfad zur Bereinigung. Variante C bricht den App-Start mit einem Dialog auf, dessen einzige sinnvolle Antwort „Behalten" ist, solange kein Recovery-Pfad existiert.

**Konsequenz:** Die Sprint-2-`__default__`-Schuld ist damit aufgelöst (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), ✅-Eintrag). Eine neue, kleinere Folgeschuld entsteht: Sprint-2/3-Sessions, die mit `cwd = workspace_path` (Parent-Ordner) gespawnt wurden, matchen *keinen* der echten Projekt-Pfade und landen dauerhaft im Legacy-Bucket — UI-erreichbar erst mit Sprint-6-Verlauf-Panel. Im Test-Szenario aus dem Sprint-4-Smoke waren das 19 Sessions; für Neu-Sessions ab Sprint 4 ist das Problem behoben (NewSession-Modal nutzt jetzt `activeProject.path`).

**Implementierungsdetail:** Die Match-Logik (`isPathInsideProject`) ist trennzeichen-sicher: `D:\Foo` matched nur Pfade, die mit `D:\Foo<sep>` beginnen oder exakt gleich sind — `D:\Foobar` als Sub-Path-Trick wird abgelehnt. Beide Pfade werden über `path.resolve` normalisiert, damit Trailing-Slashes und Mixed-Separators auf Windows kein Problem sind.

---

## Per-Projekt-Tab-Filter: Renderer-Filter, alle xterm-Instanzen mounted

**Entscheidung:** Tabs leben weiter in einem flachen `tabs[]`-Array im `useSessionStore`; jeder Tab trägt sein `projectId`. Die Tab-Bar zeigt nur Tabs des aktiven Projekts (Renderer-Filter über `activeProjectId` aus `useUiStore`); alle xterm-Instanzen aller Projekte bleiben dauerhaft im DOM mounted (CSS `display: none/flex`), PTYs aller Projekte laufen weiter. Beim Projekt-Wechsel rotiert `activeId` automatisch auf den ersten Tab des neuen Projekts oder auf null (Empty-State).

**Varianten:**

- **A** Renderer-Filter über `activeProjectId`, alle xterm dauerhaft mounted (gewählt)
- **B** Tabs als `Map<projectId, Tab[]>` strukturiert, statt flach
- **C** Sessions beim Projekt-Wechsel komplett aus dem Renderer ausblenden + frisch laden

**Grund:** Sprint 3 hatte Tab-Persistenz auf „alle xterm dauerhaft mounted" festgelegt (siehe gleichnamiger Eintrag oben) — Variante A hier zieht die Logik konsequent in die Sprint-4-Filterschicht durch: derselbe Mount-Lifecycle, derselbe Test-Aufwand, dasselbe Speicher-Profil bei 2–5 Tabs pro Projekt × 1–3 Projekten. Variante B würde Cross-Project-Operationen (z.B. „wie viele running-Sessions insgesamt?") umständlicher machen, ohne ein konkretes Problem zu lösen. Variante C widerspricht direkt der Sprint-3-Entscheidung — Re-Mount kostet xterm-Buffer, der aufwendig per Snapshot rekonstruiert werden müsste.

**Konsequenz:** `nextTab` und `prevTab` sind projekt-scoped (akzeptieren `projectId` als Argument), `pickNextActive` rotiert nur innerhalb des Projekts. `selectTabsForProject` als kleiner Selector dient sowohl der Tab-Bar als auch den Navigations-Helpern. Wenn das aktive Projekt 0 Tabs hat, bleibt der Multi-Terminal-Stack komplett verborgen und der projekt-spezifische Empty-State greift („Keine Sessions in <Projekt>").

---

## `useUiStore` als eigener Renderer-Store ab Sprint 4

**Entscheidung:** Die Auswahl des aktiven Sidebar-Projekts (`activeProjectId`) liegt in einem neuen `useUiStore` (`src/renderer/stores/ui.ts`), nicht im `useProjectStore`.

**Varianten:**

- **A** Neuer `useUiStore` für UI-State (gewählt)
- **B** `activeProjectId` als Feld direkt im `useProjectStore`
- **C** Aus URL/Hash-Routing ableiten

**Grund:** Architektur-Kapitel 2 nennt `useUiStore` explizit als einen der vier vorgesehenen Domain-Stores (`useSessionStore`, `useProjectStore`, `useUsageStore`, `useUiStore`). Sprint 4 ist der natürliche Anlass, ihn aufzumachen — Sprint 5 (Token-Dashboard mit Detail-Panel) und Sprint 8 (Settings-Modal-Sichtbarkeit) werden sehr wahrscheinlich denselben Store mit-nutzen. Variante B würde Domain-Daten (Projekt-Liste) und UI-Zustand (Auswahl) vermischen — ein Pattern, das Architektur-2 bewusst anders gezeichnet hat. Variante C (Hash-Router) wäre Phase-2-Reife (Deep-Linking, Browser-Back) für eine App, die aktuell keine Routes hat.

**Konsequenz:** Zwei neue Renderer-Stores in Sprint 4 (`useUiStore` + `useProjectStore`), beide minimal. Der `useUiStore` wächst in den nächsten Sprints organisch — keine Eröffnungs-Kosten in einem späteren Sprint, wenn der Store sowieso auseinander gerissen werden müsste.

---

## Copy/Paste-Bindings: Smart Ctrl+C/V als Default + zwei Alternativen

**Entscheidung:** Das Terminal akzeptiert drei parallele Copy/Paste-Bindings — Smart Ctrl+C/V (Daily-Driver-Default), Ctrl+Shift+C/V (cross-platform-Standard), Ctrl+Insert/Shift+Insert (Unix-X11-Konvention). Smart Ctrl+C kopiert, *wenn* eine Selection existiert (plus Auto-`clearSelection`), sonst läuft das Event als SIGINT durch. Ctrl+V pastet immer und überschreibt das selten genutzte `\x16` der traditionellen Terminals.

**Varianten:**

- **A** Smart Ctrl+C/V plus Ctrl+Shift+C/V plus Ctrl+Insert/Shift+Insert parallel (gewählt)
- **B** Nur Ctrl+Shift+C/V — saubere Disambiguierung, kein Override von SIGINT
- **C** Nur Smart Ctrl+C/V — minimale Reibung, aber keine Bypass-Option für Hotkey-Konflikte

**Grund:** Variante B war mein erster Vorschlag, ist „theoretisch reinste" Wahl (keine Mehrdeutigkeit, kein Verlust von SIGINT bei vergessener Selection) — aber Windows Terminal, VS Code und sogar moderne Linux-Terminals (Konsole, GNOME mit Setting) sind seit Jahren auf Smart Ctrl+C/V als Default gewechselt: in der Praxis schlagen die UX-Vorteile die seltenen Selection-Verwechslungen, und der `clearSelection()`-Auto-Reset nach jedem Copy entschärft den Resteffekt. Variante C verliert den Bypass, falls Ctrl+C systemweit von einer anderen App belegt wäre — aktuell unwahrscheinlich, aber kostenlos abdeckbar. Variante A liefert alle drei Wege gleichzeitig: User wählt das, was Fingergedächtnis und installierte Tools (z.B. ShareX kapert oft Ctrl+Shift+C global) zulassen.

**Konsequenz:** Pure-Logik-Util `createCopyPasteKeyHandler` mit driver-injected `ClipboardLike` + `getTerminal`-Lambda, 17 Tests ohne xterm/Browser-Clipboard. Falls Smart-Ctrl+C in der Praxis schmerzt (versehentliche Selection schluckt SIGINT), kann das Smart-Verhalten per Setting deaktiviert werden — aktuell hardcoded, Settings-UI ist Sprint 8.

**Implementierungsdetail:** Bracketed-Paste-Mode (`\x1b[200~...\x1b[201~`) übernimmt xterms `terminal.paste(text)` automatisch — claude erkennt das und verarbeitet den Block als ein einziges Eingabe-Event statt zeilenweise. Bei Pastes >~100 Zeilen komprimiert claude code die Anzeige zu einem `[Pasted text #N +K lines]`-Platzhalter; das ist claudes Feature, nicht unsere Begrenzung.

---

## Tab-Persistenz: alle xterm-Instanzen dauerhaft mounted

**Entscheidung:** Pro Session lebt eine eigene Terminal-Komponente dauerhaft im DOM; Tab-Wechsel ändert nur die CSS-Sichtbarkeit (`display: none/flex`). Kein Snapshot/Replay über die SerializeAddon-API, kein gemeinsamer Multiplex.

**Varianten:**

- **A** Alle Terminals bleiben mounted, inaktive werden per CSS versteckt (gewählt)
- **B** Snapshot-und-Wiederherstellen pro Tab-Wechsel (SerializeAddon ein-/auspacken, Lücke aus Main nachpuffern)
- **C** Eine globale xterm-Instanz, Datenströme werden pro Session gemultiplext und beim Wechsel neu in das eine Terminal geschrieben

**Grund:** Architektur-K2 zielt auf 2-5 Tabs realistisch; bei der Tab-Anzahl ist die Speicherersparnis von B/C marginal, aber die Komplexitätskosten sind real. Variante B muss ANSI-Escape-Sequenzen über den Snapshot-Roundtrip robust halten — Cursor-Mode, Alt-Screen, Mausreports und Bracketed-Paste-State sind genau die Stellen, an denen partielle Replays kaputtgehen. Variante C verlangt Per-Session-Cursor-State-Tracking und kollidiert mit Resize-Events. A ist die einzige Variante, die mit dem existierenden xterm-Lifecycle (`open`, `dispose`, `loadAddon`) ohne Tricks auskommt.

**Konsequenz:** Pro Tab eine Canvas-Render-Pipeline + Scrollback im RAM. Bei Bedarf später (Phase 2: mehr Tabs, Heatmap-Renderer-Refactor) auf eine andere Variante umschwenken — die zentrale `TabContainer`-Komponente kapselt die Sichtbarkeitslogik, der Wechsel wäre lokal. Inaktive Tabs liefern 0×0-Boxes an den ResizeObserver — das `safeFit`-try/catch fängt die FitAddon-Throws sauber ab.

---

## Lifecycle-State-Machine: zentraler Reducer im Main

**Entscheidung:** Eine Klasse `SessionLifecycle` im Main-Prozess kennt alle erlaubten Status-Übergänge (running→completed/interrupted/error/archived, completed/interrupted/error→running per Resume + →archived) als 2D-Map. Jede Status-Änderung — egal ob aus pty:exit, session:close, session:resume oder before-quit — geht durch `lifecycle.transition()`. Disallowed Transitions werden als `IpcResult.err` mit Code `LIFECYCLE_INVALID_TRANSITION` abgewiesen; Side-Effects (`ended_at` setzen/nullen) hängen pro Übergang an einer Stelle.

**Varianten:**

- **A** Zentraler Reducer mit Truth-Table und Side-Effect-Map (gewählt)
- **B** Dezentral: jeder IPC-Handler setzt seinen Zielstatus selbst, das Repo akzeptiert weiter alles aus dem Status-Enum
- **C** Repo-Whitelist auf erlaubte Werte ohne Vor-Bedingungs-Prüfung („running darf zu archived per Renderer-Bug springen")

**Grund:** Working Rule 4 verlangt, dass die Tests der Season die *neue* Lifecycle-Logik abdecken — eine zentrale State-Machine hat genau einen Test-Pfad pro From×To-Kombination und ist damit trivial als Truth-Table abdeckbar (26 Tests in Sprint 3, davon 18 reine Daten-Assertions). Variante B würde dieselben Regeln auf 4-5 Handler verteilen, und Sprint 5 (State-Detection mit waiting/idle) müsste die Regeln dort überall erweitern. Variante C verfehlt den Punkt der State-Machine, weil sie Vor-Bedingungen ignoriert.

**Konsequenz:** Sprint 5 erweitert genau eine Map-Konstante (`ALLOWED`) um die waiting/idle-Übergänge, und die JSONL-Watch-Logik schreibt durchs lifecycle-API. Driver-Injection-Pattern wie Sprint 1/2: die Klasse nimmt nur `SessionRepository` und eine `Clock`-Funktion — Tests fahren ohne better-sqlite3 (InMemorySessionDriver) und ohne System-Clock (Fixed-Clock).

**Implementierungsdetail:** Idempotente Übergänge (gleicher Status nochmal) sind No-ops und liefern die aktuelle Row zurück — vermeidet Lärm in Tests und Logs, falls ein Handler aus Versehen zweimal feuert. `ended_at` wird beim Wiedereintritt in einen Endzustand *nicht* überschrieben, damit der ursprüngliche Endzeitpunkt erhalten bleibt (z.B. completed → archived behält den Completion-Zeitpunkt).

---

## Resume mit ursprünglichem Modell, ohne erneuten Picker

**Entscheidung:** Der Resume-Button spawnt `claude --resume <session-id>` mit dem in `sessions.current_model` gespeicherten Modell-Wert; es gibt keinen Modell-Dialog vor dem Resume und kein Setting für ein anderes Verhalten.

**Varianten:**

- **A** Resume nimmt das gespeicherte Modell, kein Picker (gewählt)
- **B** Resume öffnet vor dem Spawn nochmal den Modell-Picker, vorbelegt mit dem letzten Wert
- **C** Setting `resume_with_original_model` (Default true), umschaltbar auf „immer fragen"

**Grund:** Architektur 6.2 ist explizit Spec („gleichem Modell wie ursprünglich"). Das Argument für B (User will eventuell auf billigeres Modell wechseln) wird von Claude-Codes eigenem `/model`-Befehl im laufenden Prozess abgedeckt — nach dem Resume kann jederzeit umgeschaltet werden. Variante C addiert einen Setting-Eintrag, der wahrscheinlich nie umgestellt wird, und kostet Sprint-8-UI-Aufwand.

**Konsequenz:** Wenn sich später herausstellt, dass B-Verhalten häufig gewünscht ist (z.B. wenn das ursprüngliche Modell deprecated wurde), ist die Erweiterung lokal: NewSessionModal kennt schon den Modell-Picker, im Resume-Pfad würde derselbe Dialog mit `defaultValue=session.current_model` aufgerufen.

---

## Notes-Save: Debounce + Blur + Unmount + beforeunload

**Entscheidung:** Der Auto-Save für Notizen läuft als pure-Logik-Util `createNotesSaver` mit 500 ms Debounce; zusätzlich greifen Sofort-Flushes bei `onBlur` (Textarea verliert Fokus), `useEffect`-Cleanup (Tab-Wechsel oder App-Quit-vor-Render) und `window.beforeunload` (Renderer wird gleich getötet).

**Varianten:**

- **A** Pure 500 ms Debounce ohne weitere Trigger
- **B** Debounce + onBlur + onUnmount + beforeunload (gewählt)
- **C** Sofort-Save bei jedem Keystroke

**Grund:** Architektur 6.2 verlangt 500 ms Debounce — Variante C scheidet damit aus. Variante A scheitert genau am Sprint-3-Test-Szenario („mehrere Inputs in 500 ms ergeben einen Save", was Debounce abdeckt — *aber* zusätzlich müssen die letzten Tipps beim Tab-Wechsel erhalten bleiben, sonst gehen sie verloren). Onblur und Unmount sind die natürlichen Flush-Punkte: der User hat Fokus weggegeben oder die Komponente verlässt das Tree. Beforeunload ist die letzte Chance vor dem Renderer-Tod — best-effort, weil der invoke-Promise oft nicht mehr aufgelöst wird, aber better-sqlite3 ist im Main synchron und kann die Patches in der Praxis noch durchführen.

**Konsequenz:** Pure-Logik-Trennung: `createNotesSaver` ist driver-injected (saveFn-Callback), Tests fahren mit `vi.useFakeTimers()` ohne React und ohne IPC. Worst-Case-Verlust ist 0–500 ms Tipps bei Hard-Quit (Strom weg, OOM), kein Verlust bei normalem Tab-Wechsel oder geordnetem App-Quit. Falls sich später herausstellt, dass auch Hard-Quit-Verlust schmerzt, kann ein synchroner sendSync-Channel im Preload nachgerüstet werden — das ist eine eigenständige Erweiterung, die nicht jetzt nötig ist.

**Implementierungsdetail:** Idempotenz: `createNotesSaver` cached den zuletzt gespeicherten Wert und unterdrückt erneute Saves desselben Inhalts. Damit kostet ein onBlur direkt nach einem 500-ms-Debounce-Save keinen zweiten IPC-Call.

---

## App-Quit-Race: synchrone Status-Patches vor killAll

**Entscheidung:** `before-quit` setzt zuerst das `lifecycle.shuttingDown`-Flag, patcht dann alle running-Sessions synchron auf `interrupted` (über `lifecycle.transition`), erst danach läuft `ptyManager.killAll()` und `db.close()`. Der `pty:exit`-Handler prüft das Flag und überschreibt nicht mehr — die Sprint-2-Default-Transition zu `completed` ist in dieser Phase abgeschaltet.

**Varianten:**

- **A** Synchrone DB-Patches im before-quit, vor killAll (gewählt)
- **B** `will-quit`-Event mit `event.preventDefault()`, asynchroner Patch, dann erneutes `app.quit()`
- **C** Beim Quit nichts tun, beim *nächsten* App-Start orphane running-Sessions retroaktiv auf interrupted setzen
- **A+C** A im Normalfall + C als Reconciliation-Pass beim Start (für Hard-Crashes)

**Grund:** Variante A ist trivial und korrekt für den geordneten Quit-Fall. better-sqlite3 ist synchron und schnell — keine realistische Hänge-Gefahr im before-quit. Variante B ist das doppel-quit-Pattern, das in der Electron-Praxis als anfällig gilt (User-Eindruck „App hängt", weil das zweite quit nicht ausgelöst wird). Variante C wurde vom User explizit als Sprint-8-Aufgabe markiert und ist in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md) festgehalten — Robustheit gegen Hard-Crash kommt mit dem Polish-Sprint, nicht jetzt.

**Konsequenz:** Hard-Crash (Strom weg, Task-Manager-Kill, OOM) lässt orphane running-Sessions in der DB — sichtbar wird das erst, wenn Sprint 6 das Verlauf-Panel baut. Bis Sprint 8 sieht der User das nicht, weil Sprint 3 nur Live-Tabs anzeigt.

**Implementierungsdetail:** Das `shuttingDown`-Flag schützt zusätzlich gegen die Race „lifecycle hat schon transitioniert, pty:exit feuert noch einmal" — die State-Machine selbst lehnt den Übergang `interrupted → completed` ohnehin ab, das Flag ist die saubere Zwei-Linien-Verteidigung (Logging-Lärm + State-Machine-Reject statt nur State-Machine-Reject).

---

## PTY-Backend: @lydell/node-pty (NAPI)

**Entscheidung:** TakumiDeck verwendet `@lydell/node-pty` als PTY-Bibliothek; der ursprünglich in der Sprint-2-Briefing genannte `@homebridge/node-pty-prebuilt-multiarch`-Fork ist explizit *nicht* in Verwendung.

**Varianten:**

- **A** `@lydell/node-pty` mit NAPI-Binaries via optionale Plattform-Subpakete (gewählt)
- **B** `@homebridge/node-pty-prebuilt-multiarch` behalten und Electron auf Major 30 zurückrudern (höchste ABI mit Win32-Prebuilts in dem Fork)
- **C** Visual Studio Build Tools auf der Dev-Maschine installieren und `@homebridge` aus Source kompilieren

**Grund:** Der @homebridge-Fork hat seit ~Monaten keine Win32-Prebuilds für Electron 33+ (höchste ABI v121 = Electron 30). Variante B würde uns ohne tieferen Grund auf eine ältere Electron-Major-Version festhalten — eine Schuld, die später beim ersten Sicherheits-Update fällig wird. Variante C bricht das Memory-Setting „kein VS-Compiler nötig" und kostet 4–8 GB Build-Tools-Setup für ein gelöstes Problem. lydell verteilt **NAPI**-Binaries (ABI-stabil über Node/Electron-Versionen) als optionale npm-Subpakete (`@lydell/node-pty-win32-x64` etc., wie es esbuild macht); kein `electron-rebuild` mehr nötig. Die API ist 1:1 zu Microsofts node-pty.

**Konsequenz:** Native-Module-Workflow für PTY ist trivial geworden — `npm install` + `--ignore-scripts` reicht, kein Rebuild. `electron-rebuild` bleibt für `better-sqlite3` weiterhin Pflicht. Wenn Microsoft selbst eine NAPI-fähige `node-pty`-Version mit Prebuilts herausgibt, kann ein späterer Migrate trivial folgen — die API ist ohnehin identisch.

**Implementierungsdetail:** `realPtySpawn` in `src/main/pty/spawn.ts` wraps `nodePty.spawn` in das schmale `IPtyLike`-Interface, damit die `PtyManager`-Klasse keine Direktabhängigkeit zum Paket hat (Tests fahren mit Fake-Driver, vgl. Sprint-1-Migration-Pattern).

---

## xterm.js auf v5.5 gepinnt (kein v6)

**Entscheidung:** Die App benutzt `@xterm/xterm@^5.5` zusammen mit `@xterm/addon-canvas@^0.7`. Die aktuelle Major v6 ist explizit *nicht* in Verwendung.

**Varianten:**

- **A** v5.5 + addon-canvas (gewählt)
- **B** v6 mit dem eingebauten DOM-Renderer
- **C** v6 mit `@xterm/addon-webgl`

**Grund:** Architektur-K2 verlangt explizit Canvas-Renderer („Kein WebGL-Renderer (Canvas reicht für 2-5 Tabs realistisch)"). xterm.js v6 hat den Canvas-Renderer entfernt — die Wahl wäre dort nur noch DOM (Variante B) oder WebGL (C). DOM-Renderer ist auf größeren Buffern erkennbar langsamer und hat schlechteres Glyph-Rendering; WebGL widerspricht der Architektur-Entscheidung. v5.5 ist weiterhin gewartet (xterm.js bekommt Patches), und addon-canvas 0.7 ist genau dafür gebaut.

**Konsequenz:** Major-Updates auf v6+ sind blockiert, bis entweder ein offizieller Canvas-Renderer-Wiederbeleb von xterm.js kommt oder Architektur-K2 explizit auf WebGL umgestellt wird. Beim nächsten Renderer-Refactor (Phase 2: Heatmap, mehr Tabs) wieder hinterfragen.

---

## claude-Binary-Auflösung: Setting + PATH-Default

**Entscheidung:** Der Pfad zur `claude`-Binary kommt aus `settings.json` als `claude_binary_path` mit Default `'claude'` (= PATH-Lookup). Das Main-Process-Pre-Check-Modul (`src/main/pty/binary.ts`) löst Bare-Names per `where`/`which` auf und bevorzugt auf Windows `.exe` > `.cmd` > `.bat` über das endungslose Unix-Shell-Script.

**Varianten:**

- **A** Setting `claude_binary_path` mit Default `'claude'` + PATH-Lookup mit Extension-Bevorzugung (gewählt)
- **B** Reines PATH ohne Setting — User kann nicht überschreiben
- **C** Auto-Detection beim ersten Start (`where claude` → cachen → bei Fehler User-Prompt)

**Grund:** Variante B scheitert exakt am Sprint-2-Realfall: npm-installiertes Claude Code legt zwei Files an (`claude` ohne Endung als Unix-Shell-Script und `claude.cmd` als Windows-Wrapper). ConPTY kann das endungslose Script nicht starten — wir brauchen die Extension-Bevorzugung sowieso. Variante C addiert magisches Verhalten ohne klaren Mehrwert: wenn Auto-Detection scheitert, landen wir wieder bei einem Setting; und solange sie funktioniert, ist sie kaum von A unterscheidbar. Variante A ist explizit, debugbar (User sieht in `settings.json`, was tatsächlich aufgelöst wird) und sauber überschreibbar für Spezialfälle (Portable-Installs, Multi-Version-Setups).

**Konsequenz:** Der Pre-Check (`resolveExecutable`) gehört zum normalen Spawn-Path und liefert bei Fehlern ein klares `IpcResult.err` mit Code `PTY_BINARY_NOT_FOUND`. Sprint 8 (Settings-Dialog) bekommt die UI dafür; bis dahin editiert der User direkt `settings.json`.

**Implementierungsdetail:** Auf Windows ist die Extension-Reihenfolge `.exe` > `.cmd` > `.bat` > `.com`, damit echte Executables vor Batch-Wrappern bevorzugt werden — sonst würde z.B. ein hypothetisches `claude.exe` im PATH übersehen, weil `where` den `.cmd` zuerst listet. Reicht für npm-CLIs in der Praxis.

---

## Settings-Backend: eigene JSON-Operationen

**Entscheidung:** TakumiDeck verwaltet `settings.json` mit eigenen `fs`-Aufrufen plus atomic write (`.tmp` + rename) statt einer Library wie `electron-store` oder `conf`.

**Varianten:**

- **A** Eigene JSON-Operationen mit zod-Validierung beim Lesen (gewählt)
- **B** `electron-store` mit JSON-Schema-Validation und dot-paths
- **C** `conf` als minimalere electron-store-Alternative

**Grund:** Settings sind das Herzstück der App-Konfiguration und werden mit der Zeit komplexer (Limit-Bars, Custom-Filter). `electron-store` zwingt seine Konventionen auf (Pfad-Auto-Wahl, magische Keys), die bei Migrations zwischen Settings-Schema-Versionen im Weg stehen würden. Eigene Operationen sind 30 Zeilen, vollständig nachvollziehbar, und passen exakt zur Architektur-Entscheidung „Master-Config in JSON-Dateien, App rendert nur" (TAKUMIDECK_ARCHITEKTUR Kapitel 10 Punkt 6).

**Konsequenz:** Wenn das Settings-Schema wächst, müssen wir Migrations selbst schreiben — kein Auto-Migration-Path. Dafür haben wir volle Kontrolle, atomic writes (kein halb-geschriebenes JSON bei Crash) und können jederzeit zu einem Schema-Versions-Feld erweitern, ohne Library-Quirks zu umgehen.

---

## zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1

**Entscheidung:** Jeder IPC-Channel mit Eingangs-Payload bekommt ein zod-Schema, das im Main-Handler vor der Logik per `.parse()` greift.

**Varianten:**

- **A** zod-Validation überall ab Sprint 1 (gewählt)
- **B** Nur an externen Daten-Boundaries (settings.json, JSONL-Files), IPC vertraut TS-Compile-Time
- **C** Komplett später nachrüsten

**Grund:** TypeScript-Types existieren nur zur Compile-Zeit; das Renderer-Bundle könnte theoretisch beliebige Payloads schicken (Bug, Memory-Corruption, Browser-Devtools-Eingriff). Bei einer wachsenden Channel-Liste (Sessions, PTY, Git, Usage in Sprints 2–7) wäre B die ständige Versuchung, den nächsten Channel „mal eben ohne Schema" einzuführen, bis der erste Bug eskaliert. Mit der zod-Convention ab Tag 1 ist das Schema Pflichtbestandteil jedes Handlers — und gleichzeitig die laufende Doku, was ein Channel akzeptiert.

**Konsequenz:** Jeder neue Channel kostet zusätzlich ein Schema in `src/shared/schemas.ts`. Im Gegenzug bekommen wir eindeutige Fehlermeldungen (zod sagt genau, welches Feld kaputt ist), nicht „TypeError: Cannot read property X of undefined" tief im Handler.

**Implementierungsdetail:** Das Patch-Schema (`AppSettingsPatchSchema`) ist mit `.partial()` auf das volle Settings-Schema aufgesetzt — kein Drift möglich.

---

## Logging via electron-log

**Entscheidung:** Main-Prozess loggt über `electron-log` nach `<userData>/logs/main.log`.

**Varianten:**

- **A** electron-log (gewählt)
- **B** `console.log` + eigener Helper, kein Datei-Output
- **C** Erst in Sprint 8 (Polish) einrichten

**Grund:** Production-Builds haben keine offene Konsole, in der `console.log` sichtbar wäre. Sobald das erste Mal jemand schreibt „bei mir geht's nicht" ohne Reproduktion, hilft nur ein File-Log. electron-log handhabt Datei-Rotation, Levels und Multi-Prozess-Logging out-of-the-box; selbst zu schreiben wäre 100+ Zeilen für ein gelöstes Problem.

**Konsequenz:** Settings-Dialog in Sprint 8 bekommt einen „Open Data Folder"-Button, und das Log liegt direkt daneben — kein zusätzlicher UX-Pfad nötig.

---

## Vitest-Setup direkt mit Foundation-Smoke-Tests

**Entscheidung:** Ab Sprint 1 ist Vitest konfiguriert, und vier Test-Dateien (Result-Helper, zod-Schemas, SettingsStore, Migration-Runner) laufen grün.

**Varianten:**

- **A** Setup jetzt + Smoke-Tests für Foundation (gewählt)
- **B** Setup jetzt, Tests folgen mit Sprint 2
- **C** Komplett später

**Grund:** Working Rule 4 verlangt „Test scope per season — Tests cover only the newly added or changed feature". Ohne Tests in Sprint 1 wäre die erste Test-Datei in Sprint 2 entstanden — und die Versuchung wäre groß, „kurz noch die Settings-Tests mitzunehmen". Damit wäre die Per-Season-Disziplin schon im zweiten Sprint hinüber. Tests jetzt zu schreiben verankert die Regel, solange der Scope klein und überschaubar ist.

**Konsequenz:** Migration-Runner ist gegen ein schmales `MigrationDriver`-Interface getestet (Fake-Driver, kein echtes SQLite). Das ist auch die Voraussetzung dafür, dass `npx vitest run` läuft, nachdem `electron-rebuild` die better-sqlite3-ABI auf Electron umgestellt hat — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

**Entscheidung:** TakumiDeck wählt Variante A / B / C – kurz benennen, was sich dadurch konkret unterscheidet.

**Varianten:**

- **A** <Kurzbeschreibung> (gewählt)
- **B** <Kurzbeschreibung>
- **C** <Kurzbeschreibung>

**Grund:** Hier steht, warum A gewinnt. Dieser Abschnitt ist der eigentliche Mehrwert der Datei — nicht abkürzen. Idealerweise ein konkretes Szenario, das B / C schmerzhaft macht, und ein Szenario, das A trivial macht.

**Konsequenz:** Was bedeutet diese Entscheidung für spätere Arbeit? („Wir müssen ab jetzt bei jeder neuen Spalte …", „Ein späteres Feature X lässt sich hier …").

**Implementierungsdetail:** *(optional)* kurze Notiz zu einer Umsetzungs-Wahl, die der Grund-Abschnitt nicht mitbehandelt.
