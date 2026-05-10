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
