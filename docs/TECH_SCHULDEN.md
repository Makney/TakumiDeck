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

## CI-Release-Build bricht: electron-forge resolved 0 Maker auf dem neuen GitHub-Runner (2026-05-29)

**Bereich:** CI-Release-Pipeline `.github/workflows/release.yml` (Step „Build Windows installer + portable zip" → `npm run make`). Die Maker-Definition in `forge.config.ts:107-115` (`MakerSquirrel` + `MakerZIP({}, ['win32'])`) ist korrekt und unveraendert. Spiegelt den OFFEN_BUILD.md-Eintrag „Release-Review v0.4.0".

**Was:** Beim v0.4.0-Tag-Push-Release (CI-Run `26624542066`) lief `npm run make` mit Exit 0, gab aber `Making for the following targets: ,` aus — electron-forge loeste **null Maker** auf, also entstand kein Setup.exe/ZIP in `out/make/squirrel.windows/x64`. Folge: der Step `generate-latest-yml.mjs` bricht („Squirrel-Output-Ordner fehlt") und der Asset-Upload findet nichts. **Lokal** (identischer Commit `b954635`) baut `npm run make` beide Distributables korrekt — also kein Code-/Config-Defekt. v0.4.0 wurde deshalb ueber den manuellen Fallback (VERSIONIERUNG.md Schritt 10: lokaler Build + `gh release create`/`upload`) veroeffentlicht. Verwandter Runner-Drift desselben Releases, bereits gefixt und damit **nicht** mehr offen: Electrons npm-ci-Postinstall schrieb `node_modules/electron/path.txt` nicht mehr, wodurch drei Test-Suites beim Laden via `require('electron')` (transitiv ueber `electron-log`) brachen — umgangen mit `test.env.ELECTRON_OVERRIDE_DIST_PATH` in `vitest.config.ts` (Commit `b954635`).

**Warum so:** Der manuelle Fallback war im Release-Moment der schnellste Weg zu einem fertigen v0.4.0 — der lokale Build funktioniert, der Tag zeigt auf einen voll gruenen Commit (1038/1038 Tests). Die CI-Reparatur ist eine eigene Iterationsrunde, die **nur gegen die CI verifizierbar** ist (lokal nicht reproduzierbar, weil lokal beide Maker auflosen). Sie wurde bewusst aus dem Release-Moment herausgehalten, statt das Release weiter zu blockieren. Verdacht-Ursache durchgaengig: Runner-Drift (npm 11.13.0, `windows-latest` → `windows-2025-vs2026`-Transition laut Runner-Annotation), nicht TakumiDeck-Code — der letzte erfolgreiche CI-Release (v0.3.2, 2026-05-20) lief mit identischem Workflow gruen.

**Risiko:** Mittel. Jeder kuenftige Release ueber die CI scheitert identisch, solange nicht gefixt — der manuelle Fallback ist dann jedes Mal Pflicht (lokaler `npm run make` + `generate-latest-yml.mjs` + `gh release create`/`upload`). Das hebt die in Season 27 gewonnene Release-Automatisierung wieder auf und ist fehleranfaelliger (vergessene `latest.yml`, falsche Asset-Pfade, Asset-Namens-Drift). Kein Datenverlust, kein Runtime-Effekt — rein Release-Prozess.

**Auflösung:** **Trigger:** **vor** dem naechsten Release-Tag-Push (v0.4.1/v0.5.0) — sonst ist der manuelle Fallback jedes Mal Pflicht. Drei Pfade (Detail-Abwaegung der Varianten in OFFEN_BUILD.md, Abschnitt „Release-Review v0.4.0"): **(A)** Runner-Image im Workflow auf den zuletzt gruenen Windows-Stand fixieren — Sofort-Stabilisierung, aber temporaer (Image wird irgendwann abgekuendigt); **(B)** electron-forge-Toolchain von der 7.5-Linie auf den neuesten stabilen Stand heben — nachhaltig, aber Risiko Folgebrueche (insb. Kopplung MakerSquirrel ↔ `electron-winstaller`-Pin, siehe eigener OFFEN_BUILD-Eintrag) und nur gegen CI verifizierbar; **(C)** npm-Version im Workflow festnageln — punktuell, Ursache aber unbestaetigt. Empfehlung: erst **A** (Sofort), dann **B** (nachhaltig), **C** nur als Rueckfall. Verifikation per Wegwerf-Tag oder `workflow_dispatch`, bevor der echte Release-Tag gesetzt wird.

---

## Modell-Auto-Refresh: nur env-API-Key, keine Pagination, kein OAuth-Pfad (2026-05-29)

**Bereich:** `src/main/models/fetchAvailableModels.ts`, `src/main/ipc/models.ts` (Phase-2-Season-34, Variante D).

**Was:** Der Auto-Refresh gegen `GET /v1/models` (1) liest den API-Key ausschliesslich aus `process.env.ANTHROPIC_API_KEY`, (2) fragt mit `?limit=100` eine einzige Seite ab und ignoriert das `has_more`/`last_id`-Pagination-Feld, (3) hat keinen Pfad, der den Claude-Code-OAuth-Token (Abo-Login) verwendet.

**Warum so:** Der User nutzt Claude per Abo und hat heute keinen API-Key — der Refresh ist bewusst ein optionaler Komfort-Aufsatz, nicht der Hauptpfad (manuelle `custom_models`-Pflege deckt den Bedarf ab). Pagination ist heute irrelevant: Anthropic hat eine knappe zweistellige Modell-Zahl, die locker in eine 100er-Seite passt. Den OAuth-Token am Models-Endpoint zu verwenden ist undokumentiert/nicht unterstützt und damit fragiler als der Mehrwert rechtfertigt.

**Risiko:** Niedrig. (1)/(3): Solange kein Key gesetzt ist, zeigt die UI sauber „kein Key, bitte manuell pflegen" — kein Fehler, kein Datenverlust. (2): Erst wenn Anthropic dauerhaft > 100 Modelle gleichzeitig listet, würden Einträge jenseits der ersten Seite fehlen — sehr unwahrscheinlich und ohne Funktionsbruch (die fehlenden ließen sich weiterhin manuell anlegen).

**Auflösung:** (1)/(3) zusammen lösen, sobald der User auf API-Key-Nutzung wechselt: zusätzlich `CLAUDE_API_KEY` o.ä. lesen bzw. — falls Anthropic einen offiziellen OAuth-Pfad für `/v1/models` dokumentiert — den Token-Pfad ergänzen. (2): `has_more`-Schleife mit `after_id`-Cursor in `fetchAvailableModels` nachrüsten (der Pure-Parser ist bereits pro-Seite-stabil), Trigger ist eine real auftauchende zweite Seite.

---

## Terminal-Buffer-Persistierung: App-Crash zwischen Tab-Sessions verliert den Snapshot (2026-05-25)

**Bereich:** `src/renderer/panels/TerminalTab.tsx` (Phase-2 Season-33). Konkret: der `terminal:save-buffer`-IPC wird ausschliesslich im React-Cleanup-Pfad gefeuert (`useEffect`-Return-Funktion beim sessionId-Effekt). Cleanup laeuft bei `closeTab` aus dem Sessions-Store (× auf der Tab-Pille, Projekt-Wechsel mit Tab-Cleanup, Sidebar-Project-Switch), aber NICHT bei einem App-Crash oder einem Windows-Force-Quit. In dem Fall bleibt der zuletzt persistierte Snapshot stehen (oder es gibt keinen, wenn die Session brandneu war) — der naechste Resume zeigt entweder den vorletzten Stand oder leeres Terminal.

**Was:** Heutiges Verhalten — Save-Trigger ist Tab-Close (× / Project-Switch / Sidebar-Remove). Live-Output zwischen Snapshot und Crash geht verloren. Erst der naechste „saubere" Tab-Close (z.B. der User schliesst den Tab via × bevor er die App quittiert) commitet den Snapshot. Bei einer langen Terminal-Session mit viel Output ohne zwischendurch zu schliessen ist der Snapshot also potentiell deutlich aelter als der aktuelle Buffer.

**Warum so:** Bewusste Wahl der Achse J (im ENTSCHEIDUNGEN-Eintrag „Season-33 Terminal-Buffer-Persistierung", Persist-Trigger). K (debounced `serialize()` alle 5 s) loest ein Problem, das im Daily-Use empirisch nicht belegt ist — App-Crashes sind selten, und der Crash-Verlust trifft nur den laufenden Terminal-Tab (claude-Sessions sind nicht betroffen, weil sie ihren Verlauf aus der JSONL re-rendern). Crash-Schutz-Aufwand waere eine Timer-Loop pro N Tabs plus pause-bei-inaktiv-Logik analog zum TUI-Poll — Code-Wachstum und Renderer-CPU-Last fuer einen Modus, der vielleicht zweimal im Jahr passiert.

**Risiko:** Niedrig. Konkretes Worst-Case: User laesst eine PowerShell-Session 30 Minuten laufen mit vielen `git log`-Ausgaben und Build-Outputs, App stuerzt (oder Windows-Force-Quit / Stromausfall) — beim Restart-Resume sieht der User nur den Snapshot vor der 30-Minuten-Session-Eroeffnung (oder leeres Terminal, wenn die Session frisch war). Mitigation aktuell: User kann den Tab bewusst per × schliessen vor jedem Mittagspause-Lock, dann ist der Snapshot frisch. App-Crashes in der Daily-Use-Empirie waren bisher selten genug, um das Risiko zu rechtfertigen — der Live-Save-Pfad wartet auf empirischen Bedarf.

**Aufloesung:** **Trigger:** wenn der Schmerz „mein Terminal-Buffer war beim Crash weg" zweimal im Daily-Use auftaucht oder wenn ein anderes Crash-Recovery-Feature (z.B. Session-State-Recovery) ohnehin eine Live-Save-Infrastruktur einfuehrt. Zwei Aufloesungs-Pfade: (a) Debounced `serialize()` alle 5 s waehrend der Session laeuft (Achse K aus dem ENTSCHEIDUNGEN-Eintrag) mit Pause-bei-inaktiv-Logik analog zum TUI-Poll-Loop aus Season 28 — der Poll-Code-Pfad ist schon da, das Save-Pendant wuerde analog daneben sitzen. (b) Save zusaetzlich beim `pty:exit`-Renderer-Push (vor der Lifecycle-Transition auf `completed`/`interrupted`/`error`) — kein Live-Schutz, aber faengt die Mehrzahl der „Session beendet sich von selbst"-Faelle ab, die heute nur ueber den Cleanup laufen. Variante (a) ist die robuste Loesung, (b) waere ein billiger Zwischenschritt falls (a) im Daily-Use vorerst nicht noetig ist.

---

## Datei-Browser-Tree refresht nicht bei Struktur-Aenderungen (2026-05-24)

**Bereich:** `src/renderer/panels/RightPaneFilesPanel.tsx` (Phase-2 Season-29.5). Konkret: der `fs:changed`-Push aus `ProjectFilesWatcher` (Season 29) bumpt zwar den `gitRefreshKey` fuer den Git-Status-Pull, triggert aber bewusst KEINEN Tree-Reload via `fs:list-tree`. Wenn extern (durch ein Claude-Pty, einen externen Editor oder ein git checkout) eine neue Datei angelegt, eine bestehende geloescht oder ein Ordner umbenannt wird, faellt das im Datei-Browser erst beim naechsten Projekt-Wechsel auf.

**Was:** Heutiges Verhalten — Tree wird nur einmal beim Projekt-Wechsel geladen. Git-Status pro File wird live ueber `fs:changed` aktualisiert (eine neue, geloeschte oder umbenannte Datei kriegt den passenden Marker — falls die Datei im Tree existiert). Eine neu erzeugte Datei zeigt aber gar keinen Tree-Knoten, also auch keinen Marker — sie ist im Browser unsichtbar, bis der User das Projekt umschaltet und wieder zurueck.

**Warum so:** Im Season-29-Variants-Brief war das die Default-Wahl, weil ein automatischer Tree-Reload bei jedem `fs:changed`-Push den User-Scroll-Zustand und die `expanded`-Set-Wahl resetten oder mit hohem Aufwand erhalten muesste — beides ein UX-Pain, der den marginalen Mehrwert (neue Files erscheinen automatisch) nicht aufwiegt. Im Daily-Use entstehen neue Files entweder beim Claude-Lauf (User merkt es ohnehin) oder bei expliziten User-Aktionen im Editor (User weiss, dass es jetzt da ist).

**Risiko:** Niedrig. Im Daily-Use spuerbar nur, wenn ein externer Prozess (z.B. ein Claude-Tab in einem anderen Projekt, ein Git-Checkout eines Feature-Branches mit anderen Files) den Tree-Bestand veraendert und der User direkt danach den Datei-Browser konsultiert. Mitigation: Projekt-Wechsel + zurueck triggert immer einen frischen Tree.

**Aufloesung:** **Trigger:** wenn die Klage „warum sehe ich die neue Datei nicht im Browser" zweimal im Daily-Use auftaucht. Drei Aufloesungs-Pfade: (a) `fs:changed`-Push enthaelt `add`/`unlink`-Events bereits in `ProjectFilesWatcher` (chokidar liefert die Diff-Events); Tree-Reload nur dann triggern, wenn ein Event tatsaechlich `add`/`unlink`/`addDir`/`unlinkDir` ist. `expanded`-Set ist Pfad-basiert, ueberlebt einen Tree-Re-Render. Scroll-Position ueber `ref.scrollTop` snapshotten und nach dem Re-Render zurueckschreiben. (b) Manueller Refresh-Button rechts oben im Datei-Browser-Header — explizit, ohne Auto-Magie. (c) `expand_changed_paths`-Aufloesung: nur die spezifischen Eltern-Ordner des `add`/`unlink`-Events neu laden, statt den ganzen Tree (komplizierter, aber stoert den User-State minimal). Variante (a) ist der wahrscheinlich gewaehlte Pfad, weil chokidar die Events ohnehin liefert und der Implementations-Aufwand klein bleibt.

---

## Brand-Logo-Quell-PNGs leben extern auf dem Desktop, nicht im Repo (2026-05-24)

**Bereich:** Asset-Pipeline. Konkret: `build/icon.ico` lebt im Repo (committet), aber die Quell-PNGs (`16.png`, `24.png`, ..., `1024.png`, `1254.png`) leben unter `C:\Users\makne\Desktop\Logos\TakumiDeck\ICOs2\`. Build-Skript: `D:\Projekte\Scripts\build-icon.py` (auch nicht im TakumiDeck-Repo, sondern projekt-uebergreifend abgelegt).

**Was:** Die fertige `build/icon.ico` ist im Repo und wird vom Forge-Build verwendet — Releases sind reproduzierbar. Aber: wenn das Logo nochmal ueberarbeitet werden muss, braucht es die Quell-PNGs vom Desktop, und das externe Build-Skript aus `D:\Projekte\Scripts\`. Geht der Desktop-Ordner verloren (Geraete-Wechsel, Reset, versehentliches Loeschen), kann das Icon nur noch dekomprimiert aus der `.ico` selbst rekonstruiert werden — was wiederum bedeutet, dass die Master-Aufloesungen 1024 und 1254 (die NICHT in der `.ico` landen, weil ICO-Container max. 256 px haelt) endgueltig weg sind.

**Warum so:** Bewusster Trade-off zugunsten kleiner Repo-Groesse und einfachem Update-Workflow. Quell-PNGs summieren sich auf ~50–200 KB (1254er allein ist der dickste Brocken), Build-Skript nochmal ~3 KB. Im aktuellen Lebenszyklus passiert ein Logo-Update vielleicht zwei- bis dreimal vor Phase-1.0 und dann nie wieder — die im-Repo-Variante (Variante F im ENTSCHEIDUNGEN-Eintrag „App-Icon und Brand-Logo") haette einen CI-Build-Step mit Python-Pillow-Setup erforderlich gemacht, der nur fuer einen Re-Run-pro-Jahr-Workflow uebertrieben ist. Der zentrale Scripts-Ordner-Ansatz (Variante D) hat das Skript-Problem geloest, das Quell-PNG-Problem aber explizit nicht angefasst.

**Risiko:** Niedrig–mittel. Konkretes Worst-Case-Szenario: Festplatte stirbt oder OneDrive-Sync verliert den `Desktop/Logos/TakumiDeck/`-Ordner — die `.ico` selbst lebt weiter (im Git), aber jede kuenftige Logo-Variante muss aus den Container-Frames neu extrahiert werden (256 px Max-Aufloesung) plus die Master-PNGs sind weg. Mittlere Schwere, weil die Quellen rekonstruierbar waeren (1024er aus dem aktuellen Logo neu zeichnen lassen), aber Aufwand und Drift-Risiko sind real. Mitigation aktuell: OneDrive synct den Desktop ohnehin, also Drift nur bei aktivem Loeschen.

**Aufloesung:** **Trigger:** wenn das Logo zum dritten Mal in Folge regeneriert wird (Indikator: aktive Iteration-Phase, dann ist die Reibung mit dem externen Pfad spuerbar). Variante F aus dem ENTSCHEIDUNGEN-Eintrag nachziehen: Quell-PNGs als `build/icon-src/<size>.png` ins Repo committen (alle 7 ICO-Groessen plus 1024er als Master, die 1254er bewusst rauslassen — die ist nur Tippfehler-Fallback). `.gitignore` mit `!build/icon-src/` durchlassen. Build-Skript bleibt zentral unter `D:\Projekte\Scripts\` — der Aufruf wandert in ein Repo-lokales Wrapper-Skript (`scripts/rebuild-icon.bat`) oder einen npm-Script-Eintrag (`"icon:rebuild": "python ../Scripts/build-icon.py --src build/icon-src --out build/icon.ico"`), damit der Pfad zur Quelle im Repo lebt. CI-Hook explizit weiter nicht — der Pre-Build-Pass bleibt schnell, das Icon-Rebuild ist manueller One-Shot.

---

## @xterm/addon-webgl@0.19.0 Dispose-Bug — Symptom abgefangen, Upstream-Fix offen (Bugfix 2026-05-19)

**Bereich:** `@xterm/addon-webgl@^0.19.0` (third-party Runtime-Dependency, seit Season 28 im Stack). Symptom-Abfang sitzt in `src/renderer/panels/TerminalTab.tsx` (Cleanup-Pfad) plus `src/renderer/components/safeDispose.ts` (Pure-Helper) plus `src/renderer/components/ErrorBoundary.tsx` (Defense-in-Depth).

**Was:** Beim Tab-Close einer aktiven Session wirft `@xterm/addon-webgl@0.19.0` in seinem internen `dispose`-Pfad eine `TypeError: Cannot read properties of undefined (reading '_isDisposed')`, wenn der WebGL-Renderer noch nicht voll initialisiert ist (Shader-Compile + Char-Atlas-Setup sind async). Reproduktion: frische Claude-Session spawnen, sofort × klicken — der `requestAnimationFrame` fuer `loadRendererAddonWithFallback` hat noch nicht durchgelaufen oder der GL-Init ist mitten in der Shader-Compile-Phase. Bei laenger laufenden Sessions ist der Renderer fertig und Dispose laeuft sauber. Unser Code fangt die Exception via `safeDisposeAddon`-Helper plus `try/catch` um `terminal.dispose()` — der React-Tree bleibt am Leben, der User sieht nur ein `[safeDispose] renderer-addon dispose warf:`-Warn in den DevTools. Funktional ist der Bug damit weg, aber die zugrundeliegende Library-Logik bleibt fehlerhaft.

**Warum so:** Drei Aufloesungspfade hat der Fix-Brief diskutiert: (a) `@xterm/addon-webgl` auf eine neuere Version bumpen, die den Bug fixt — kein Hinweis im Upstream-Repo, dass v0.20+ existiert oder den Fix enthaelt; (b) WebGL-Init synchron erzwingen statt im `requestAnimationFrame`, damit der Close-vor-Init-Race verschwindet — riskiert aber, den Sprint-5-Bug („Cannot read properties of undefined (reading 'dimensions')") wieder einzufuehren, der genau das umgekehrte Race-Symptom war; (c) auf den `CanvasAddon` zuruecksetzen und den Season-28-Scroll-Fluiditaets-Gain aufgeben — zu hoch der Preis fuer einen Symptom-Fix, wo unser eigener Wrapper bereits sauber abfaengt. Symptom-Abfang plus globale `ErrorBoundary` als Defense-in-Depth ist der pragmatische Default. Der Bug ist im Daily-Use unsichtbar (kein User-facing Symptom mehr, nur Diagnose-Warn).

**Risiko:** Niedrig. Der Symptom-Abfang ist mit zwei Schichten redundant (expliziter Pre-Dispose plus `try/catch` um `terminal.dispose()` selbst, plus die `ErrorBoundary` als dritter Sicherheits-Ring). Konkretes Worst-Case-Szenario: `@xterm/addon-webgl` aendert in einer kuenftigen Minor-Version die Dispose-Signatur so, dass unsere Wrapper-Helper nicht mehr greifen — extrem unwahrscheinlich, weil `dispose()` Teil des `IDisposable`-Vertrags aus xterm-core ist. Pattern-Risiko: das `[safeDispose]`-Warn-Log kann im Daily-Use als Rauschen wahrgenommen werden und uns bei der naechsten Diagnose ablenken — Warns sind aber bewusst nicht stumm geschaltet, weil sie der Trigger fuer den Library-Bump sind (wenn sie verschwinden, ist Upstream gefixt).

**Aufloesung:** **Trigger:** beim naechsten `npm outdated`-Pass nach `@xterm/addon-webgl@^0.20.0` (oder neuer) schauen. Falls der Bump im Changelog einen `dispose`-related Fix nennt: testen via „frische Session sofort schliessen"-Smoke-Test, ob das `[safeDispose] renderer-addon dispose warf:`-Warn verschwindet. Wenn ja, Library bumpen und Trigger als erfuellt markieren — Wrapper-Helper koennten bleiben als billiger Defense-in-Depth, oder zurueckgebaut werden falls das Pattern nirgendwo sonst noetig ist. Alternative Trigger: wenn die Warns sich im Daily-Use als stoerendes Rauschen erweisen (z.B. weil sie bei jedem normalen Tab-Close kommen statt nur beim seltenen Race) — dann auf Pfad (b) WebGL-Init-Synchronisierung schwenken mit zusaetzlichem Schutz gegen den Sprint-5-Dimensions-Race (z.B. Layout-Polling via ResizeObserver vor dem `loadAddon`).

---

## Auto-Refresh ueberschreibt Dirty-Tabs nicht — aber zeigt auch keinen Warn-Marker (Season 29)

**Bereich:** `src/renderer/panels/EditorPane.tsx` (`fs:changed`-Subscription) plus `MarkdownEditor.tsx`. Die fileTabs-Store-API hat heute keinen Slot fuer „externe Aenderung verfuegbar, lokal aber dirty".

**Was:** Wenn eine Datei im Working-Tree extern geaendert wird (z.B. Claude-Lauf, zweites Editor-Fenster) waehrend in TakumiDeck ein File-Tab dieser Datei dirty ist, ueberschreibt der Auto-Refresh den Editor-Buffer NICHT — soweit korrekt. Aber: der User sieht nichts davon. Beim naechsten manuellen Save in TakumiDeck wird die externe Aenderung leise ueberschrieben, weil TakumiDeck den lokalen Buffer-Stand (mit aelterem Disk-Inhalt als Basis) auf die Platte schreibt. Kein Konflikt-Dialog, kein Warn-Marker, kein Re-Read-Hint.

**Warum so:** Der „External-Change-Marker bei Dirty-Tab"-Flow waere ein eigener kleiner Sub-Pfad mit drei Sub-Entscheidungen (Marker-Position: Tab-Pille vs. Editor-Toolbar vs. modaler Banner · Action: nur Hinweis vs. Reload-Button vs. Diff-Button · Re-Sync-Strategie wenn der User den Save trotzdem ausloest). Mid-Season-Scope und Variants-First-Pflicht haetten den Auto-Refresh-Scope um eine ganze Diskussion verbreitert. Im Daily-Use ist der Fall „externe Aenderung + lokal dirty im selben File" empirisch selten, weil der User typischerweise entweder im Terminal oder im Editor arbeitet, nicht in beidem parallel an derselben Datei. Risiko ist tolerabel, Auto-Refresh ohne Marker schon ein grosser Sprung gegenueber dem Phase-1-Stand (manuelle Tab-Close-und-Open).

**Risiko:** Mittel. Konkretes Szenario: User hat `docs/CHANGELOG.md` in TakumiDeck geoeffnet und drei Zeilen ergaenzt (dirty). Parallel laesst er Claude im Terminal einen anderen Absatz im CHANGELOG ergaenzen — Claude schreibt die Datei, TakumiDeck refetcht den Inhalt im fs:changed-Handler aber laesst den Dirty-Tab in Ruhe (korrekt). User druckt Ctrl+S in TakumiDeck: der Claude-Absatz ist weg, ueberschrieben durch den TakumiDeck-Buffer-Stand. Datenverlust-Schwere ist niedrig (Git-History rettet bei committed Files), aber Surprise-Wert hoch.

**Aufloesung:** Drei Sub-Entscheidungen zu klaeren, sobald die Inzidenz im Daily-Use auftaucht: (a) Marker-Position — Tab-Pille mit zusaetzlichem Symbol (z.B. `⚠ M`-Doppel-Marker fuer „externe Aenderung + lokal dirty"); (b) Action — passive Anzeige + manuelles Reload via Button, ODER aktiver Conflict-Dialog beim naechsten Save-Versuch; (c) Re-Sync-Pfad bei aktiver Reload-Action — externer Inhalt ueberschreibt lokale Edits (User akzeptiert Verlust), ODER 3-Way-Merge ueber `@codemirror/merge` mit dem letzten gespeicherten Stand als Basis. Pragmatischer Default fuer V1: (a) Tab-Pille mit „⚠"-Marker, (b) passiver Hinweis, (c) optionaler Reload-Button im Editor-Toolbar. Storage: neuer `externalChanged: boolean`-Flag im FileTab-State, gesetzt im `fs:changed`-Handler bei dirty Match, gecleart bei `setSaved` oder explizitem Reload-Klick.

---

## Per-Tab-Font-Zoom nicht persistiert, nur Session-lokal (Season 28)

**Bereich:** `src/renderer/panels/TerminalTab.tsx` (`fontSizeOverride`-useState) + `src/renderer/components/terminalFontZoom.ts`. Settings-Feld `terminal_font_size` bleibt globale Default-Quelle.

**Was:** Ctrl+Mausrad zoomt die Schriftgroesse pro Tab zwischen 8 und 32 px, aber der Override lebt nur in einem React-useState. Beim Tab-Close oder App-Restart ist der Wert weg. Settings-Hot-Update (User aendert `terminal_font_size` im Modal) setzt den Override explizit zurueck — Settings gewinnen, sobald der User sie anfasst.

**Warum so:** Persistierung-Frage hatte drei sinnvolle Optionen (global im Settings ueberschreiben · per-Project in CLAUDE.md · per-Tab via Sessions-Tabelle), keine davon eindeutig richtig fuer Phase 2. Im Daily-Use ist „Quick-Zoom fuer dieses eine Pair-Coding-Beispiel" der haeufige Pfad — der Ziel-Wert haftet nicht, der User skippt die naechste Session wieder zu seiner Standard-Groesse. Die Settings-Default-Variante wuerde bei jedem Wheel-Tick eine Settings-Persist-Round-Trip ausloesen, was UX-seitig laggy ist. Eine Schema-Erweiterung (`sessions.font_size_override`) waere ein eigener Migrations-Pass — Phase-3-Material, falls Persistierung sich als echter Bedarf herausstellt.

**Risiko:** Niedrig. Im Worst-Case zoomt der User pro Tab-Start neu — der Mausrad-Aufwand ist klein (5-10 Wheel-Ticks bis zur Wunsch-Groesse). Settings-Modal-Aenderung zieht weiterhin alle neuen Tabs sauber mit. Pattern-Risiko: wer in Settings die globale Groesse aendert, denkt vielleicht dass das auch fuer aktive gezoomte Tabs gilt — der explizite Reset des Overrides bei Settings-Aenderung adressiert das, aber der Lerneffekt fehlt im UI.

**Aufloesung:** Bei der ersten echten User-Inzidenz „mein Zoom haelt nicht". Drei Aufholpfade: (a) Global-Override im `AppSettings`-Schema (debounced auf 500 ms wie der Schrift-Setter heute) — billigster, schreibt die letzte Wheel-Position als neuen Default; (b) Per-Project in CLAUDE.md-Frontmatter (`workbench.terminal_font_size_override`) — passt zum Per-Project-Pattern aus Sprint 4; (c) Per-Session in der `sessions`-Tabelle plus Migration — fragil, weil die Tab-Identitaet beim Resume rekonstruiert wird. (a) ist der pragmatische Default.

---

## latest.yml-Generierung als manuelles Post-Make-Script statt Forge-Publish-Hook (Season 26) ✅ 2026-05-18 (Season 27)

**Aufgeloest durch:** Die GitHub-Actions-Build-Pipeline (`.github/workflows/release.yml`, Season 27) ruft `node scripts/generate-latest-yml.mjs` zwischen `npm run make` und `gh release upload` automatisch auf. Damit ist der ursprueglich genannte zweite Aufloesungs-Trigger („die GitHub-Actions-Build-Pipeline laeuft an") erfuellt — der Aufruf kann beim Release nicht mehr vergessen werden, weil der Workflow ihn pflicht-orchestriert. Der zugrunde liegende Code (`scripts/generate-latest-yml.mjs` als Build-Adapter + `src/main/updater/latest-yml.ts` als Pure-Logik) bleibt unveraendert; nur die Ausfuehrung wandert vom Maintainer-Disziplin-Step in den CI-Workflow. Lokales Release ohne CI bleibt theoretisch moeglich (User kann `npm run make && node scripts/generate-latest-yml.mjs && gh release upload ...` weiterhin von Hand fahren), ist aber nicht mehr der Default-Pfad — die Doku in `docs/release/VERSIONIERUNG.md` wird auf den CI-Pfad umgestellt, sobald der erste echte Tag-Push (voraussichtlich v0.2.2) den Workflow validiert hat. Originaltext der Schuld bleibt zur Nachvollziehbarkeit erhalten:

---

**Original-Schuld (vor Aufloesung):**

**Bereich:** `scripts/generate-latest-yml.mjs` (Build-Adapter) plus der `gh release upload`-Aufruf in `docs/release/VERSIONIERUNG.md` Schritt 10, der das generierte `out/make/latest.yml` mit hochlaedt. Pure-Logik liegt in `src/main/updater/latest-yml.ts` und ist davon entkoppelt.

**Was:** `electron-updater`'s GitHub-Provider liest beim Check eine `latest.yml`-Datei neben den Release-Assets (sha512 + size + version + releaseDate). Forge schreibt diese Datei nicht selbst — das ist eine electron-builder-Konvention. Wir schliessen die Luecke mit einem Post-Make-Script, das nach `npm run make` laufen muss und das YAML schreibt; der Release-Workflow nimmt es dann via `gh release upload` mit. Wer den Script-Schritt vergisst, pushed eine neue Version, aber der Auto-Updater im Daily-Driver findet sie nicht — `electron-updater` meldet stumm „kein Update", weil das Feed-File auf dem Stand der Vorgaenger-Version bleibt.

**Warum so:** Variante A („electron-updater + bestehende Forge/Squirrel-Pipeline") aus dem Season-26-Variants-Brief verlangt explizit, am Build-Stack nichts zu drehen — der memory-dokumentierte „Forge-Vite + Externals = leeres ASAR"-Workaround sitzt in `forge.config.ts` und hat in Phase 1 einen vollen Sprint-Tag gekostet, ein Wechsel auf electron-builder (Variante B, die das Feed-File automatisch schreibt) wuerde dasselbe Tail-Risiko in der anderen Richtung neu freilegen. Forge selbst hat zwar `PublisherGithub`, der `latest.yml` schreiben *koennte* — aber das wuerde `electron-forge publish` als Release-Pfad voraussetzen statt des aktuellen manuellen `gh release create` + `gh release upload`-Flows. Der manuelle Flow ist mit Absicht so dokumentiert (eigener Memory-Eintrag „Release-Pipeline: gh release + Asset-Upload manuell"), weil der User-Trigger pro Release bewusst einzeln laeuft.

**Risiko:** Mittel. Das Vergessen des Script-Schritts ist symptomlos — kein Build-Fehler, kein UI-Hinweis, kein Test, der das faengt. Erst wenn ein User im Daily-Use beim naechsten Release keinen Update-Banner sieht und manuell „Jetzt nach Update suchen" klickt, wird der Drift sichtbar. Pre-Check-Test-Lauf faengt das nicht ab, weil die Pipeline lokal trocken laeuft. Bei Single-Maintainer-Setup beherrschbar (Doku-Step 10 lesen reicht), bei Verteilung der App auf Mitautoren oder bei spaetem-Nacht-Release wird das Risiko hoeher.

**Aufloesung:** Bei der ersten echten „Update nicht aufgetaucht weil latest.yml vergessen"-Inzidenz: Forge-Publisher als Hook bauen, der nach dem Make-Lauf automatisch `latest.yml` schreibt — entweder via eigenem `PublisherBase`-Subclass oder via Forge-Hook `postMake`. Alternative: GitHub-Actions-Build-Pipeline (naechste Phase-2-Roadmap-Zeile) macht den Schritt sowieso automatisiert. **Trigger:** zweite Inzidenz „Release ohne latest.yml gepushed" *oder* die GitHub-Actions-Build-Pipeline laeuft an. Bis dahin reicht der Doku-Step im `VERSIONIERUNG.md`.

---

## Spawn-Tracking als TabContainer-lokales State-Paar statt am Tab (v0.2.0 Bugfix) ✅ 2026-05-20 (v0.3.2 Hotfix)

**Bereich:** `src/renderer/panels/TabContainer.tsx` (`spawnedIds: Set<string>` + `initialPrompts: Map<string,string>`); Cleanup in `handleClose` plus Pure-Helper in `src/renderer/components/spawnTrackingState.ts`.

**Was:** Ob ein frisch gemounteter `TerminalTab` ein `pty:create` feuern soll (NewSessionModal-Pfad) oder die PTY ueber `session:resume` schon laeuft (Resume-Pfad), entscheidet die `needsSpawn`-Prop. Diese kommt aus zwei TabContainer-lokalen Containern: einem Set fuer den Spawn-Bedarf und einer Map fuer den optionalen Docs-Sync-Auto-Prompt. Beide werden ausschliesslich von `handleClose` in TabContainer aufgeraeumt — andere Close-Pfade (z.B. `LeftSidebar.handleCloseTab` aus dem Sidebar-X-Icon oder `handleConfirmRemove` beim Projekt-Entfernen) wissen nichts von dem State und leaken die Eintraege. Variante A des Fix-Plans hat das fuer den User-relevanten TabContainer-Pfad sauber abgedichtet; die anderen Pfade sind theoretische Edge-Cases (Resume nach Project-Remove plus zufaelliger UUID-Kollision = praktisch unmoeglich), aber das Pattern ist fragil.

**Warum so:** Variante B (Spawn-Flag und Initial-Prompt als Felder im `SessionTab`-Schema im `useSessionStore` heben) war im Bug-Brief als „cleanere Architektur" markiert, aber fuer den Bugfix overkill — der eigentliche Bug saß im fehlenden Cleanup, nicht in der Architektur. Variante A reicht 5 Zeilen + Pure-Helper + Test; Variante B braucht Store-Schema-Erweiterung, addTab-Signatur-Erweiterung, TabContainer-Umverdrahtung plus Migration aller Aufrufstellen (HistoryActionModal, HistoryPane, LeftSidebar). Zeitlich nicht im Fix-Scope.

**Risiko:** Niedrig. Der Bug, den Variante A direkt loest, war der einzige produktive Crash-Pfad. Die theoretischen Edge-Cases (Projekt entfernen → Session-UUID kollidiert spaeter zufaellig mit neuer Session) sind UUID-statistisch nicht erreichbar. Pattern-Risiko: jede neue Close-Aufrufstelle muss daran denken, das TabContainer-State mit zu sauberen. Ohne Lint-Regel oder Konvention wird das beim naechsten Refactor wieder uebersehen — siehe historisch die Sprint-2/3-Tab-Lifecycle-Bugs.

**Aufloesung:** ✅ 2026-05-20 mit v0.3.2-Hotfix eingeloest, weil der Trigger „erste echte Inzidenz" eingetreten ist: User-Reproduktion „× in der LeftSidebar-Aktive-Sessions-Pille → Resume aus History → rote `UNIQUE constraint failed: sessions.id`-Box im Terminal-Tab". `SessionTab` traegt jetzt `needsSpawn: boolean` (Default `false`; nur NewSessionModal-Pfad setzt `true`) und `initialPrompt: string | null` (Default `null`; nur Docs-Sync-Pfad setzt einen Prompt). `AddTabInput` nimmt sie optional an. `addTab` initialisiert beide Felder aus dem Input, `closeTab` raeumt sie implizit mit — die ganze Tab-Row fliegt aus dem Store, egal von welchem `×`-Pfad geschlossen wird. Neue Store-Action `consumeInitialPrompt(sessionId)` ersetzt den `handleInitialPromptSent`-Callback aus dem TabContainer-State-Pfad mit Referenz-Gleichheits-Bailout fuer Idempotenz. `TabContainer` streicht `spawnedIds`/`initialPrompts`/`removeFromIdSet`/`removeFromIdMap` komplett; `TerminalTab` liest `needsSpawn` und `initialPrompt` direkt aus dem Tab-Objekt. `src/renderer/components/spawnTrackingState.ts` und `tests/renderer/spawn-tracking-state.test.ts` gelöscht. 7 neue Tests im neuen `useSessionStore Spawn-Tracking`-Block in `tests/renderer/sessions-store.test.ts`, inkl. der Kern-Regression „Close → Resume mit gleicher sessionId liefert needsSpawn=false".

---

## Markdown-Editor-Split-Layout: 50/50 fix, kein Resize-Handle (Season 24)

**Bereich:** `src/renderer/components/MarkdownEditor.tsx` Split-Modus, CSS-Klassen `.td-md-body-split > .td-md-cm` und `> .td-md-preview` (beide `flex: 1 1 50%`).

**Was:** Im Split-Modus teilen sich Editor und Preview die Body-Breite hart 50/50. Es gibt keinen draggable Splitter zwischen den Panes, keine Persistenz der gewaehlten Aufteilung, keine Tastatur-Shortcuts zum Verschieben der Grenze. Pane-Groesse ist eine reine CSS-Konstante.

**Warum so:** Das Roadmap-Wortlaut fuer „Markdown-Preview Side-by-Side" verlangt nur „Zwei-Panel-Layout, in Settings konfigurierbar" — die Layout-Auswahl ist da (split/editor/preview), die Groessen-Konfigurierbarkeit nicht. Der Resize-Handle waere ein eigenes Phase-2.5-Sub-Feature (Mouse-Drag-Logik, persistierter Anteilswert pro User, Touch-Support); das ist nicht das Daily-Use-Schmerzpunkt-Feature, sondern ein Polish-Add-On. 50/50 ist die neutrale Default-Aufteilung, mit der die meisten Dokumente lesbar sind. Wer wirklich Pane-Breite braucht, schaltet auf „Nur Editor" oder „Nur Preview" — der gleiche Toolbar-Button loest das ohne Splitter.

**Risiko:** Bei sehr breitem oder sehr schmalem Right-Pane (Right-Pane sitzt in einer 1fr-Spalte der 4-Spalten-Grid) ist 50/50 nicht immer optimal — schmale Editor-Spalten erzwingen viele Soft-Wrap-Brueche, breite Vorschauen verschwenden Platz bei kurzen Files. User koennen das nur ueber die Modus-Buttons kompensieren („nur eine Seite voll sehen"), nicht ueber einen Mittelpunkt-Shift. Empirisch eher Komfort-Tradeoff als Bug.

**Aufloesung:** Beim ersten echten User-Schmerz (Feedback „der Preview-Anteil ist mir zu schmal" oder umgekehrt). Drei Aufholpfade: (a) draggable Splitter via Maus-Drag-Listener auf einem 4-px-Trennstrich, persistiert pro File-Tab oder global in Settings; (b) Settings-Slot `markdown_editor_split_ratio: number` (0.3..0.7) — keine UI-Drag, aber globale Wahl; (c) Per-Datei-Memory im `useFileTabsStore`, sodass die Aufteilung pro Datei klebt. (b) ist der billigste Zwischenschritt, falls (a) noch zu viel Engineering ist.

---

## Easter-Egg-Werk-Liste hartcodiert (Season 19)

**Bereich:** `src/shared/easter-egg-works.ts` — `DEFAULT_EASTER_EGG_WORKS`-Konstante mit fuenf Default-Werken (Der Hobbit, The Lord of the Rings, Krieg und Frieden, Die Bibel, Harry-Potter-Reihe).

**Was:** PHASE2.md-Roadmap-Wortlaut spricht von „konfigurierbaren Vergleichs-Werken in Settings". Season 19 hat das auf den Toggle `easter_egg_enabled` reduziert — die Werk-Liste selbst ist nicht im Settings-Schema, sondern als Pure-Konstante im Shared-Modul. Wer eigene Werke (z.B. Stephen-King-Bibliographie, Tolkien-Komplett-Werk, Asterix-Band-Stack) sehen will, muesste den Code editieren und neu builden.

**Warum so:** Easter-Eggs leben vom Ueberraschungs-Moment; sobald der User eine Werk-Liste pflegen muss, ist es kein Easter-Egg mehr, sondern ein Setting. Die K2-Variante (voll editierbare Liste im Settings-Modal) wurde im Variants-Brief der Season 19 explizit gegen K1 abgewogen und disqualifiziert — Configuration-Surface fuer eine Spielerei lohnt sich nicht, solange noch kein User-Wunsch nach Custom-Werken existiert. Pure-Logik akzeptiert bereits eine optionale `works`-Liste als Parameter, sodass der K2-Aufholpfad nur Settings-Schema + UI-Block braucht — die Compute-Logik bleibt unveraendert.

**Risiko:** Sehr niedrig. Werk-Liste ist statisch und altert kaum (Bibel und LotR existieren seit Jahrzehnten). Edge-Case: User mit extrem hohem Token-Verbrauch (>50× alle Default-Werke) sieht permanent dieselben Top-3 mit gigantischen Faktoren — der Storytelling-Effekt nutzt sich ab. Aufloesung dafuer waere eine groessere Default-Liste (10+ Werke mit mehr Spreizung), nicht zwingend Konfigurierbarkeit.

**Aufloesung:** Wenn der erste User-Wunsch nach eigenem Werk auftaucht: neues Schema-Feld `easter_egg_works: Array<{ name, tokens, enabled }>` in `AppSettings`, Settings-UI-Block im „Allgemein"-Tab mit Add/Remove und Reset-auf-Default-Button, `easterEggEnabled`-Prop in `StatsPane` durch `easterEggWorks` ersetzen oder ergaenzen. `computeEasterEggComparisons` braucht keine Aenderung — der `works`-Parameter ist bereits da. **Trigger:** erster User-Wunsch nach eigenem Werk *oder* zweiter „der Streifen zeigt immer dieselben drei Werke"-Kommentar (= Spreizungs-Problem statt Konfigurierbarkeits-Problem, andere Aufloesung).

---

## AppSettings-Test-Fixture in zwei Test-Dateien dupliziert ✅ 2026-05-16 (Season 20 Pre-Pass)

**Bereich:** `tests/main/reset-schedule.test.ts`, `tests/main/usage-aggregation.test.ts` (beide mit eigenem `buildSettings(overrides)`-Helper, der das `AppSettings`-Vollschema inline aufbaut). **Vierter Touch-Point in drei Seasons in Folge:** Season 19 hat dieselben zwei Files erneut manuell um `easter_egg_enabled: true` ergaenzt, weil das Vollschema dort inline gebaut wird statt aus `buildDefaultSettings()` zu mergen. Der in Season 18 als Trigger gesetzte „vierter Touch-Point"-Schwellwert ist damit erreicht — der Refactor ist jetzt explizit ueberfaellig.

**Was:** Beide Test-Files definieren oben eine `buildSettings(overrides)`-Funktion, die das komplette `AppSettings`-Objekt mit Test-Default-Werten zusammenstellt. Bei jedem Schema-Add muss in beiden Files das neue Feld manuell nachgezogen werden. Season 17 hat `screenshot_retention` ergaenzt (Touch-Points #1 und #2), Season 18 `workspace_wizard_completed` (#3), Season 19 jetzt `easter_egg_enabled` (#4).

**Warum so:** Bei der initialen Test-Anlage (Sprint 5 / Season Flacsh) gab es keinen Grund, das Vollschema aus `buildDefaultSettings()` zu mergen — die Tests sollten unabhaengig von Produktiv-Defaults laufen. Der Refactor wurde in Season 17/18/19 jeweils als nicht-kritisch zurueckgestellt (zwei Zeilen Fix pro File, sofort sichtbar via Typecheck), aber der Schmerz akkumuliert: drei Seasons in Folge dieselben zwei Files anfassen ist ein klares Signal.

**Risiko:** Bei jedem kuenftigen Settings-Schema-Add bleibt der zwei-Datei-Touch in den Tests. Typecheck faengt die Drift sofort, aber das Pattern verleitet zu „Test-Defaults driften vom Produktiv-Default", weil die Inline-Werte irgendwann nicht mehr dasselbe Bedeuten wie `buildDefaultSettings()` zurueckgibt (z.B. wenn ein Produktiv-Default geaendert wird, ohne dass die Test-Fixture mitgezogen wird).

**Aufloesung:** ✅ Erledigt im Season-20-Pre-Pass. `tests/_helpers/settings-fixture.ts` mit `buildTestSettings(overrides: Partial<AppSettings> = {})` extrahiert. Bewusst NICHT auf `buildDefaultSettings()` aufgesetzt — `buildDefaultSettings()` ruft `pickDefaultWorkspacePath()` mit `fs.existsSync`, was die Tests an die Maschine binden wuerde; die Fixture haelt feste, deterministische Werte. Beide Test-Files (`reset-schedule.test.ts`, `usage-aggregation.test.ts`) auf den Helper umgestellt — Inline-Helper raus, Import als `buildTestSettings as buildSettings` (nicht-disruptiver Re-Wire). Kuenftige Schema-Adds (Season-20-`template_top_n` direkt mitgenommen) brauchen nur noch *eine* Stelle, nicht mehr drei. Schema-Tests in `tests/main/schemas.test.ts` nutzen weiterhin `buildDefaultSettings()` direkt — das ist korrekt, weil dort genau das Produktiv-Default-Verhalten gepruft wird.

---

## Statement-Cache-Pattern in vier Repos dupliziert (Zwischen-Review v0.1.2)

**Bereich:** `src/main/db/repos/stats.ts`, `src/main/db/repos/model-stats.ts`, `src/main/db/repos/heatmap.ts`, `src/main/db/repos/meta-kv.ts`

**Was:** Fallow-Befund „Clone group 5" — 109 Zeilen Code-Duplikat zwischen `stats.ts:109-217` und `model-stats.ts:132-186`. Beide Repos fuehren einen Statement-Cache `Map<StatementKey, Statement>` mit identischem Key-Schema (`'p'|'g' + 'r'|'a'` als Scope×Range-Achsen), identischer `keyFor`-Funktion, identischen `whereClause`/`paramsFor`-Helpern und identischem „if (!stmt) compile + cache.set"-Plumbing pro Query. `heatmap.ts:189` traegt das Pattern in einer reduzierten Variante (nur Scope-Achse, kein Range). `meta-kv.ts` traegt das Pattern nicht, weil dort kein Filter-Variantenraum existiert.

**Warum so:** Drei Repos im Verlauf der Seasons 12/13/14 entstanden, jedes hat das Pattern kopiert und an die eigene Filter-Achse angepasst. Beim Schreiben war die Achsen-Konfiguration jeweils klein genug (zwei bzw. eine Achse), dass eine generische Helper-Komponente uebertrieben wirkte. Der Drift-Effekt sieht man erst nach drei Iterationen.

**Risiko:** Funktional korrekt, aber Drift-Gefahr bei kuenftigen Filtern: wenn ein Repo eine vierte Filter-Achse dazu nimmt (z.B. `model_family`) und der Code im anderen Repo nicht synchron mitgezogen wird, divergieren die Statement-Cache-Keys und die Ergebnisse pro Filter-Set werden inkonsistent. Plus: jede neue Variante erfordert ein eigenes prepared Statement, was die Cache-Groesse mit der Achsen-Anzahl multipliziert.

**Aufloesung:** Generischer `StatementCache<K extends string>`-Helper mit `compile: () => Statement`-Factory und `keyFor(...axes): K`-Builder, plus `MessageWhereClauseBuilder`-Funktion fuer die gemeinsame `WHERE project_id = ? AND ts >= ?`-Logik. ~60 LOC neuer Helper, drei Driver werden umverdrahtet (`stats.ts`, `model-stats.ts`, `heatmap.ts`). Lohnt sich erst, wenn eine vierte Filter-Achse oder ein viertes Repo dazu kommt — der eigentliche Refactor ist erst dann gegen einen klaren Anwendungs-Druck statt gegen eine Befuerchtung.

---

## DoubleConfirmButton-Pattern dupliziert in drei Stellen (Zwischen-Review v0.1.2, Update Season 17)

**Bereich:** `src/renderer/modals/HistoryActionModal.tsx:201-220`, `src/renderer/modals/RemoveProjectModal.tsx:104-131`, `src/renderer/modals/SettingsModal.tsx` (ScreenshotRetentionBlock, Season 17)

**Was:** Fallow-Befund „Clone group 11" — urspruenglich 53 Zeilen Code-Duplikat zwischen `HistoryActionModal` und `RemoveProjectModal`. **Season 17** hat den dritten Aufrufer hinzugefuegt: der Manual-Clear-Button im `ScreenshotRetentionBlock` (Settings-Modal, „Allgemein"-Tab) nutzt dasselbe Pattern (`confirmStage`-State `idle`/`confirm`/`busy`, Inline-`style={confirmStage === 'confirm' ? { borderColor: 'var(--td-red)', color: 'var(--td-red)' } : undefined}`, Title-Tooltip-Wechsel, Label-Switch „⌧ Alle loeschen" ↔ „⚠ Wirklich alle loeschen?"). Der dritte Block hat zusaetzlich eine `busy`-Zwischenstufe waehrend des async IPC-Calls, die die zwei Modale aktuell nicht haben (dort kommt das `busy`-Flag als Prop von aussen).

**Warum so:** Beim dritten Aufrufer (Season 17) wurde die Extraktion bewusst NICHT mitgezogen, um die Season-Scope-Grenze einzuhalten (Retention-Modul + Schema + zwei IPCs + UI-Block + Tests waren bereits ein voller Pass). Drei inline-Aufrufer mit identischem Pattern-Body sind noch handhabbar; der Pflege-Schmerz wird erst akut, wenn ein vierter Aufrufer dazukommt oder der Inline-Style-Switch um zusaetzliche States erweitert wird.

**Risiko:** Bei UI-Polish-Changes (z.B. neue Farb-Konvention fuer destruktive Aktionen, andere Icon-Konvention, Keyboard-Shortcut-Hinweis) muss das Pattern an *drei* Stellen synchron gepflegt werden. Zusaetzliches Drift-Risiko aus der Season-17-Variante mit eigener `busy`-Stufe — wenn die zwei aelteren Modale ihre `busy`-State-Quelle anders modellieren (Prop von aussen vs. lokaler State), divergiert die Doppel-Confirm-Logik weiter, statt zu konvergieren.

**Aufloesung:** Neue `<DoubleConfirmButton>`-Komponente in `src/renderer/components/`. Props: `onConfirm`, `initialLabel`, `confirmLabel`, `initialTitle`, `confirmTitle`, optional `busy` (von aussen) ODER intern verwaltete `busy`-Stufe. Lokaler `confirmStage`-State + Style-Switch wandern in die Komponente. ~40 LOC neue Komponente + drei Aufrufer-Refactors auf je ~5 Zeilen. **Trigger:** beim vierten Aufrufer, oder wenn die `busy`-Achse aus Season 17 in eines der aelteren Modale rueckwirkend gezogen werden muss.

---

## Session-Action-Pattern Cross-Panel dupliziert (Zwischen-Review v0.1.2)

**Bereich:** `src/renderer/panels/LeftSidebar.tsx:171-201`, `src/renderer/panels/TabContainer.tsx:144-184`

**Was:** Fallow-Befund „Clone group 14" — 41 Zeilen Code-Duplikat. Beide Panels haben jeweils `handleCloseTab`/`handleClose` und `handleResumeFromTabs`/`handleResume`-Aktionen, die identisch `useFileTabsStore.setActiveTab`, `estimateTerminalCols(settings.terminal_font_size)`, das Spawn-Result-Pattern und die `console.warn`-Fehlerbehandlung umsetzen. Sidebar feuert die Aktionen aus dem Projekt-Tree, TabContainer aus den Tab-Pillen — gleiche Semantik, doppelter Implementierungs-Pfad.

**Warum so:** Die Aktionen sind nicht reine Store-Mutationen, sondern haengen am IPC-Call (`pty:create`/`session:close`) plus Settings-Lookup plus Tab-Store-Update plus Lifecycle-Side-Effect. Eine generische Funktion haette Argumente fuer alle drei Stores oder eine Closure ueber die Component-Props gebraucht — und beide Panels haben unterschiedliche Tab-Sources (Sidebar: Tabs aus dem aktiven Projekt, TabContainer: alle offenen Tabs).

**Risiko:** Pflegekosten doppelt: jede Aenderung am Resume-Pfad (z.B. neue Modell-Override-Logik beim Resume) muss synchron in beiden Panels. Das ist in Season 11 (`templates:allocate-season-for-session`-Call beim Resume mit `NEXT_SEASON_NR`-Variable) bereits einmal passiert — beide Stellen brauchten den IPC-Aufruf, wurden nur einmal eingebaut, der zweite blieb unbeachtet.

**Aufloesung:** Custom Hook `useSessionActions(settings)` in `src/renderer/components/`. Liefert `{ closeTab, resumeTab }` mit der gleichen Signatur wie die zwei aktuellen Inline-Funktionen — alle State-/IPC-Touchpoints wandern in den Hook. ~50 LOC neuer Hook + zwei Panel-Refactors auf je ~5 Zeilen. Schwelle: lohnt sich, wenn ein dritter Aufrufer (z.B. eine neue Pane mit Session-Actions) entsteht — oder bei der naechsten echten Aenderung am Resume-Pfad, weil dort der Pflegeschmerz akut wird.

---

## TemplatesModal-Komplexitaets-Regression (Zwischen-Review v0.1.2)

**Bereich:** `src/renderer/modals/TemplatesModal.tsx`

**Was:** Fallow-Health-Befund: TemplatesModal Cyclo 17 → **21**, CRAP 306 → **462** seit dem 2026-05-10-Snapshot. 553 Zeilen jetzt. Sechs separate useEffects (Esc, Mount-Pos, Drag-Listener, Templates-Load, AutoVars-Load, Frontmatter-Load), zwei lokale Drag-States, zwei Store-Konsumenten plus die Season-11-Allocate-Logic. Die Komponente ist zur Sammelstelle fuer alle Side-Effects rund um das Templates-Picking geworden — Drag-V2 (Sprint 9.5), Season-4-AutoVar-Pipeline, Season-11-Allocate-IPC + Frontmatter-Cache-Bust uebereinander.

**Warum so:** Jede Erweiterung war individuell klein und passte „gerade noch" in den bestehenden Komponenten-Rumpf — Drag-Logic 30 Zeilen, AutoVars 40 Zeilen, Allocate-IPC 20 Zeilen. Der Refactor-Druck war je einzeln zu klein fuer eine eigene Extraktion; im Aggregat ergibt sich aber eine Komponente, die schwer zu lesen und zu testen ist.

**Risiko:** Naechste Aenderung am Modal — egal welche — wird teurer als sie sein muesste, weil der Code-Body alle Pfade vermischt. Test-Lesen wird schwierig, weil ein Render-Pass durch sechs Effekte gleichzeitig laeuft. Bei Mehr-User-Use (oder mehr Templates) koennte das Effekt-Chaos Renderer-Stalls verursachen.

**Aufloesung:** Drei Sub-Hooks extrahieren — `useTemplatesModalDrag` (Drag-State + Mount-Position + Drag-Listener, ~50 LOC), `useTemplatesAutoVars` (AutoVars-Load + Frontmatter-Load + User-Var-Reset, ~60 LOC), `useTemplatesAllocateSeason` (Season-11-IPC-Call + Toast, ~30 LOC). Das Modal-Body wird auf JSX + die drei Hook-Returns reduziert (~250 LOC). Lohnt sich vor der naechsten Funktional-Aenderung am Modal — z.B. wenn eine neue AutoVar-Quelle (Phase 3) angedockt werden soll.

---

## `listHistoryForProject` Cyclomatic-Regression durch Modell-Filter (Zwischen-Review v0.1.2)

**Bereich:** `src/main/db/repos/sessions.ts:392-477` (SqliteSessionDriver), `:580-665` (InMemorySessionDriver)

**Was:** Fallow-Health-Befund: Sqlite-`listHistoryForProject` Cyclo 20 → **25** (CRAP 106 → 160) seit dem 2026-05-10-Snapshot, durch den Season-10-Modell-Filter (`input.models?: string[]`) verursacht. Die Funktion verzweigt jetzt drei optionale IN-Listen (Typ/Status/Modell) + optionale Volltext-Suche durch eine Statement-Cache-Permutation `t{n}_s{n}_m{n}_q{n}` mit max ~560 prepared Statements und vier verschachtelten Param-Bind-Schleifen. Der InMemory-Driver (zweite Implementation der gleichen Logik im selben File) zog mit Cyclo 22.

**Warum so:** Der Filter-Stack ist eine bewusste Domain-Anforderung des Verlauf-Panels — alle vier Achsen sind in der UI vorhanden und muessen kombinierbar sein. Eine sauberere Architektur (Filter-Stack-als-Daten, Pure-Functional-Composition) waere moeglich, war in Season 10 aber out-of-scope.

**Risiko:** Bei jeder weiteren Filter-Achse (z.B. „Mit Notizen" / „Mit Custom-Type-Label" / Datum-Range) wird die Cyclo weiter steigen und die Statement-Cache-Grosse multiplizieren — irgendwann ist die Permutation nicht mehr handhabbar (>1000 Cache-Eintraege bei 5 Achsen) und der Hot-Pfad muss zu dynamischer Statement-Komposition wechseln. Die zweite Driver-Implementation (InMemory) muss synchron gepflegt werden.

**Aufloesung:** Filter-Stack-als-Daten-Refactor: `FilterSpec = { kind: 'type'|'status'|'model'|'query', values: ... }[]`, Builder-Funktion komposiert SQL-WHERE-Klausel + Param-Liste pro Spec. Statement-Cache-Key wird Hash der Spec-Struktur. ~80 LOC fuer den Builder + Tests, beide Driver werden umverdrahtet. Lohnt sich, wenn eine fuenfte Filter-Achse kommt — oder wenn die Statement-Cache-Memory-Spitze im Production-Run auffaellt.

---

## state-detection-loop `tick` Cog 31 (Zwischen-Review v0.1.2)

**Bereich:** `src/main/sessions/state-detection-loop.ts:61-128`

**Was:** Fallow-Health-Befund: `tick`-Funktion 68 Zeilen, Cyclo 17 / **Cog 31** / CRAP 79.4. Anstieg seit 2026-05-10-Snapshot durch Phase-2 Season-1 (volle State-Detection): zusaetzliche Branches fuer `permission-prompt`-Skip, `running`-Status mit stale JSONL, nested `lastRole`-Lookup pro Pfad, zwei try/catch-Ebenen. Jede einzelne Verzweigung ist domain-essentiell (Renderer-vs-Loop-Hierarchie fuer Status-Quellen, dokumentiert in den Inline-Kommentaren Zeile 24-26), aber im Aggregat ist die Funktion an der Grenze des Verstaendlichen.

**Warum so:** Die State-Detection ist die kritischste Loop im Main-Process — sie laeuft alle 2 s und entscheidet ueber den Tab-Status (running/waiting/permission-prompt/idle), den die UI als Badge zeigt. Bei jeder Status-Erweiterung war der instinktive Pfad „eine weitere if-Branche im bestehenden tick-Body", weil Refactor mit Tests-Re-Schreiben teurer wirkte als ein neuer Zweig.

**Risiko:** Bei der naechsten Status-Erweiterung (z.B. „session-finished" als eigener Status, oder Detection von Permission-Granted-Folge-Prompts) wird die Cog weiter steigen, und der Diff wird schwerer zu reviewen. Plus: bei Bug-Hunt in der State-Machine („Warum kippt mein Tab von waiting auf idle, obwohl Claude noch arbeitet?") ist die 68-Zeilen-Logik schwer mental zu durchwandern.

**Aufloesung:** Pure-Helper `classifyNextStatus(session, activityState, lastRole, now)` extrahieren, der den Status-Vorschlag als Return-Wert liefert — der `tick`-Body wird auf „pro Session: lese State, ruf classifyNextStatus, vergleiche mit aktuellem Status, persistiere bei Aenderung" reduziert. Tests laufen dann gegen `classifyNextStatus` als Pure-Function statt gegen die Loop-Mechanik. ~40 LOC Refactor + Tests-Re-Schreiben. **Trigger:** bei der naechsten Status-Erweiterung — die soll nicht ohne den Refactor durchgehen. Selbst-Reminder als TECH_SCHULDEN-Eintrag.

---

## Boot-Backfill-Flag setzt auch bei `readdir`-EACCES (Zwischen-Review v0.1.2)

**Bereich:** `src/main/jsonl/backfill.ts:138-149, 187`

**Was:** `runJsonlPathBackfill` iteriert ueber alle `cwd`-Buckets mit Sessions ohne `claude_session_id`. Pro Bucket ruft es `listJsonlFilesWithMtime(cwd)`, was bei `EACCES` (Per-cwd-Folder ohne Read-Rechte) den Fehler loggt und die Iteration mit `continue` fortsetzt. Am Ende der gesamten Iteration setzt das Modul aber unconditional das Flag `backfill_jsonl_link_v1=done` im MetaKvRepository — auch wenn ein oder mehrere Buckets durch EACCES gar nicht gepaart wurden.

**Warum so:** Pragmatisches Best-Effort-Pattern: der Backfill ist ein einmaliger Boot-Pass fuer historische Daten, kein laufender Aufraeum-Job. Pro-cwd-Erfolg zu tracken haette zusaetzlich einen Per-cwd-Flag im MetaKV erfordert (`backfill_jsonl_link_v1_done_cwds: string[]`), plus Diff-Logik beim naechsten Boot. Im Daily-Use sind EACCES-Faelle quasi nicht-existent (User-eigener Folder).

**Risiko:** Wenn der User vor dem ersten Update auf v0.1.2 einen temporaeren Permission-Bug auf einem Folder hatte (z.B. Antivirus haelt eine Datei kurz fest), wuerde der Backfill diesen Bucket beim ersten Boot ueberspringen und beim zweiten Boot (Permissions wieder OK) nicht mehr nachholen, weil das Flag bereits `done` ist. Praktischer Effekt: ein bis zwei resume-tote Sessions bleiben ungepaart. Kein Daten-Verlust, nur fehlende Watcher-Trigger fuer diese Sessions.

**Aufloesung:** Zwei Pfade moeglich. (a) MetaKvRepository um `setJson<T>(key, value)`-Methode erweitern, Backfill speichert eine `{ doneCwds: string[], pendingCwds: string[] }`-Struktur und re-runt nur die pending beim naechsten Boot. ~30 LOC + Tests. (b) Schlankere Variante: Flag bleibt boolean, aber bei `EACCES`-Befund wird das Setzen verschoben (`done = false`) und stattdessen ein `console.warn` mit Hinweis „beim naechsten Boot wird erneut versucht" geloggt. Variante (b) ist die Drei-Zeilen-Loesung mit Defensiv-Charakter; (a) ist die saubere Loesung, wenn der Backfill kuenftig komplexer wird. Aktuell: niedrige Prioritaet, weil EACCES im Daily-Use kein realistischer Pfad ist.

---

## Modul-Zyklen-Risiko bei Helper-Re-Export aus Panels (Zwischen-Review v0.1.2)

**Bereich:** Renderer-Komponenten-Architektur (Lessons learned vom `prettyModelId`-Vorfall)

**Was:** Im Zwischen-Review v0.1.2 ist aufgefallen, dass `prettyModelId` als `export function` im `StatsPane.tsx` lag und von der Schwester-Komponente `ModelsView.tsx` (die selbst in `StatsPane` als Child gerendert wird) importiert wurde. Das ergab einen klassischen Modul-Zyklus, den Vite/ESBuild im Dev-Mode immer aufloeste, aber in Production-Builds undefiniertes Verhalten zeigen kann. Fix war 9 Zeilen — Helper in eigene Datei `src/renderer/components/prettyModelId.ts`, beide Konsumenten importieren von dort. Lessons: Panel-Components sind nicht-zyklus-sicher als Helper-Quelle, wenn ihre Childen die Helper konsumieren.

**Warum so:** Beim Schreiben von `prettyModelId` (Season 12) war ModelsView noch nicht in der Architektur. Als Season 14 ModelsView in StatsPane einhing, war der Helper bereits dort — und „dort lassen" wirkte einfacher als „in eine eigene Datei umziehen". Modul-Zyklen sind in TypeScript/Vite ein Soft-Failure-Mode, sodass der Bug erst beim Production-Smoke aufgefallen waere.

**Risiko:** Latent fuer alle Helper, die heute oder kuenftig in Panels mit Child-Komponenten exportiert werden. Beispiele aus dem Code-Review: `formatFavoriteModel` (lokal in StatsPane, derzeit ohne Konsument ausserhalb — geht in Ordnung), `prettyModelId` (war drin, ist jetzt extrahiert), `ContextSlot`-Helpers (computeTone/computeMarker/buildTitle — heute Inline in TabContainer, kein Konsument ausserhalb).

**Aufloesung:** Pattern-Etablierung: Pure-Helper, die _potenziell_ von mehreren Components konsumiert werden koennten, leben in `src/renderer/components/*.ts` (keine `.tsx`-Endung, kein JSX), nicht in einer Panel-Datei. Beim naechsten Review-Pass (Phase 3-Eintritt oder bei Code-Review-Routine) gezielt nach `export function`-Pattern in `panels/*.tsx` greppen, die nicht-trivial sind — Kandidaten in Schwester-Komponenten-Verzeichnis verschieben. Aufwand pro Kandidat: 5–10 LOC. Aktuell kein anderer akuter Fall identifiziert.

---

## Pre-Hotfix-Sessions ohne JSONL verlieren Token-Aggregate (Phase-2 Season 16)

**Bereich:** `src/main/db/migrations/0008_messages_cache_split.sql`

**Was:** Migration 0008 leert `messages`, `usage_buckets` und `jsonl_offsets` als Voraussetzung fuer den Full-Rescan, der die neuen `tokens_cache_creation` + `tokens_cache_read`-Spalten retroaktiv befuellt. Sessions, deren JSONL-Datei nicht mehr existiert (dauerhaft resume-tote Pre-Hotfix-Sessions aus Sprint 2/3 + pre-fix Sprint 6, siehe Season-15-SEASON_LOG-Eintrag), verlieren dadurch ihre `tokens_in`/`tokens_out`-Aggregate in der `messages`-Tabelle — der Watcher kann sie nicht aus einer JSONL neu lesen. Die Sessions selbst bleiben mit Titel, Status, Notizen und Modell-Info in der `sessions`-Tabelle erhalten, aber ihre Token-Counts im Verlauf-Panel zeigen ab dem ersten Start nach Update einen `tokens_in=0, tokens_out=0`.

**Warum so:** Wir haben drei Backfill-Strategien verglichen (Full-Rescan, Lazy-on-touch, Kein-Backfill, siehe ENTSCHEIDUNGEN-Eintrag „Cache-Hit-Statistik"). B1 Full-Rescan ist der Roadmap-konforme Pfad und liefert die historische Cache-Hit-Rate ab Tag 1 — die anderen Varianten haetten entweder eine verzerrte Uebergangs-Phase (B2) oder die ersten Wochen nach Update unbrauchbar gemacht (B3). Pre-Hotfix-Sessions ohne JSONL sind ohnehin nicht resume-faehig (Sprint-8-UX-Hint `SESSION_NO_CLAUDE_UUID` deckt das ab); ihre Token-Aggregate sind also fuer den Daily-Use bereits irrelevant. Der pragmatische Tradeoff war: lieber einen klar abgrenzbaren Teilbestand verlieren, als die Mehrwert-Logik fuer alle aktiven Sessions zu verkompliziert machen.

**Risiko:** Niedrig. Realistisch sind ein bis fuenf solcher Sessions pro Daily-User; sie tauchen im Verlauf-Panel mit korrektem Titel + Status auf, nur die Token-Counts in der Detail-Pane stehen auf 0. Keine UI-Komponente kollabiert auf den Null-Werten (Verlauf-Pane formatiert `0 Tokens` sauber). Niemand referenziert die historischen Token-Counts fuer Limit-Berechnungen — `usage_buckets` wird ebenfalls neu aufgebaut, und dort gibt es keinen Anchor zu den Pre-Hotfix-Sessions. Wer den Verlauf-Bestand visuell exakt erhalten will, ist betroffen; wer Daily-Use macht, merkt nichts.

**Aufloesung:** Nicht reparabel ohne die Original-JSONL-Dateien. Wenn ein User vor Update eine Backup-Kopie seiner `~/.claude/projects/`-Files hat, koennte man eine einmalige Restore-Migration schreiben, die diese Files in das aktive Verzeichnis kopiert und dann den naechsten App-Start den Watcher draufgehen laesst — aber das ist Aufwand fuer einen Edge-Case, der niemanden im Daily-Use ernsthaft betrifft. Die Eintraege bleiben mit `0/0`-Token-Counts im Verlauf-Panel; wer sie nicht mehr sehen will, archiviert sie ueber den Verlauf-Detail-Pane.

---

## Heatmap-Cells leicht rechteckig auf breiten Panes (Phase-2 Season 13)

**Bereich:** `src/renderer/styles/app.css` (`.td-heatmap-grid`)

**Was:** Die Heatmap-Grid verzichtet auf `aspect-ratio: var(--weeks) / 7`. Cells stretchen via `grid-template-columns: repeat(weeks, 1fr); grid-template-rows: repeat(7, 1fr); width:100%; height:100%`. Auf breiten Panes (typisch >1000 px Pane-Breite bei 30W) werden die Cells dadurch breiter als hoch — auf einem 1500-px-Pane sind sie etwa 40×20 px statt 20×20 px.

**Warum so:** Mit `aspect-ratio` wuchs die Heatmap-Höhe linear mit der Pane-Breite und überlief die fixe 300-px-Bottom-Row (LAYOUT.ROW_BOTTOM_HEIGHT). Cards + Heatmap clippten unten weg. `aspect-ratio` raus + Cells stretchen → kein Clipping mehr, aber visuelle Cell-Form ist Pane-Breiten-abhängig.

**Risiko:** Niedrig. Die Lesbarkeit des Kalenders bleibt erhalten (Spalten = Wochen, Reihen = Wochentage, Quartil-Farbskala unverändert), nur die Cell-Quadratur ist nicht garantiert. Auf schmalen Panes (~500 px) sind Cells fast quadratisch.

**Auflösung:** Heatmap-Grid mit `max-width: calc(weeks × max-cell-size)` kappen und im Container linksbündig anordnen — dann bleiben Cells quadratisch, und überschüssige Pane-Breite wird zu Whitespace rechts. Lohnt sich, wenn die Cell-Form im Daily-Use stört.

---

## Dead-Code-Spalte `projects.next_season_number` (Phase-2 Season 11)

**Bereich:** `src/main/db/migrations/0001_init.sql` (Schema-Definition), `src/main/db/repos/projects.ts` (Insert-Pfad)

**Was:** Die Spalte `projects.next_season_number` existiert seit Sprint 6 und wurde damals als atomarer Counter (SELECT-und-bump in einer Transaction) für die Season-Vergabe genutzt. Mit Season 11 wurde die Logik umgestellt: der Counter wird zur Lesezeit als korrelierte Subquery (`MAX(sessions.season_number) + 1`) im `PROJECT_SELECT_WITH_COUNT` berechnet, und `allocateSeasonNumber` ist eine reine SELECT-Operation ohne Schreib-Pfad. Die Spalte bleibt im Schema bestehen, wird beim `INSERT INTO projects` weiter mit Default `1` befüllt, aber an keiner Stelle des Codes mehr ausgelesen.

**Warum so:** Drop-Migration (0007) wäre ein eigener Schema-Brüch mit `ALTER TABLE ... DROP COLUMN`, das SQLite erst ab 3.35 unterstützt (better-sqlite3 v12 bündelt 3.45+, also technisch möglich). Die Migration ist aber rückwirkungslos auf das Verhalten — das System läuft mit der toten Spalte exakt gleich — und ein Drop birgt das Risiko, dass externe Tools (z.B. `scripts/inspect-db.py`) auf den Spaltennamen zugreifen und nach dem Drop kommentarlos ausfallen. Aufschieben war der pragmatische Pfad: Code ist schon konsistent, die Spalte verbraucht ein paar Byte pro Project-Row, mehr nicht.

**Risiko:** Praktisch null. Ein zukünftiger Programmierer könnte den Default `1` im Insert-Pfad sehen und versehentlich darauf bauen — der Code-Kommentar in `projects.ts` und der Hinweis in dieser Datei sind die einzigen Anker, dass die Spalte tot ist. Wenn ein Code-Review-Pass die Spalte ohne Doku-Lookup findet, könnte er sie fälschlich als "noch verwendet" einschätzen und eine Drop-PR ablehnen.

**Auflösung:** Eigene Mini-Migration in einer späteren Phase: `ALTER TABLE projects DROP COLUMN next_season_number;` plus Update des `ProjectInsert`-Interfaces (`next_season_number`-Property raus), Anpassung des `INSERT INTO projects`-Statements und des `ensureDefaultProject`-Pfads. ~30 LOC + Test-Anpassung in `projects-repo.test.ts` (das `seedProject`-Default kann dann raus). Auch das `scripts/inspect-db.py` muss schauen, ob es die Spalte irgendwo zeigt — aktuell tut es das nicht (es liest nur `id, status, current_model, cwd, started_at` aus `sessions` und die Counts der `projects`-Tabelle).

---

## Backfill-Approximation für `messages.model` bei Pre-Migration-Daten (Phase-2 Season 10)

**Bereich:** `src/main/db/migrations/0006_messages_model.sql` (Backfill-UPDATE), `src/main/db/repos/messages.ts` (Aggregat-Konsumenten)

**Was:** Migration 0006 ergänzt `messages.model` als nullable Spalte und backfillt bestehende Rows mit dem `current_model` der jeweiligen Session. Das ist ein einzelner Hint-Wert pro Session — bei Sessions, die im Lauf der Zeit das Modell gewechselt haben (z.B. via `/model`-Slash-Befehl oder Resume mit anderem Modell), bekommen alle historischen Messages denselben Modell-String, obwohl in Wirklichkeit ein Mix vorlag. Das Detail-Pane-Aggregat („Modelle · Opus 4.7 · 12 · Sonnet 4.6 · 5") spiegelt diese Verzerrung: für eine Pre-Migration-Session zeigt es nur ein Modell mit voller Message-Anzahl.

**Warum so:** Die exakte Pre-Migration-Information ist nicht rekonstruierbar — die JSONL-Files würden zwar die per-Message-Modelle enthalten, aber ein Re-Read aller historischen JSONLs würde den `jsonl_offsets`-Mechanismus aushebeln (Idempotenz-Verlust) und einen mehrere-MB-langen Migration-Job triggern. Der gewählte Backfill ist eine pragmatische Approximation, die für Sessions ohne Modell-Wechsel exakt richtig ist (die Mehrheit aller Sessions im Daily-Use) und nur bei der kleineren Teilmenge der Wechsel-Sessions verzerrt. Ab dem Watcher-Patch in derselben Season schreiben alle neuen Messages das per-Message-Modell exakt, sodass die Verzerrung sich von selbst aus den aktiven Sessions herauswächst.

**Risiko:** Detail-Pane für historische Sessions kann irreführend sein — eine Session, die laut Aggregat „nur Opus" hatte, könnte real auch Sonnet-Messages enthalten haben. Tabellen-Spalte (`current_model`) ist unberührt; Filter funktioniert weiter korrekt, weil er ohnehin auf `sessions.current_model` filtert (nicht auf das Aggregat). Kein Datenverlust, keine falschen Schreib-Operationen.

**Auflösung:** Löst sich von selbst über die Zeit. Sobald Pre-Migration-Sessions archiviert sind und neue Messages mit exaktem per-Message-Modell die Daten dominieren, ist die Verzerrung weg. Falls vorher eine Session-spezifische Korrektheit nötig wird (z.B. Stats-Section in einer späteren Phase will pro Modell exakte Token-Counts), wäre ein Re-Scan-Job über die JSONL-Files denkbar, der den `jsonl_offsets`-Reset für diese Sessions explizit macht. Aktuell kein Bedarf.

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
