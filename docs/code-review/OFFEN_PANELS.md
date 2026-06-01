# Code-Review — Bekannte offene Punkte (Panels)

Befunde für `src/renderer/panels/...` und `src/renderer/{App,main}.tsx`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

> **Behobene Befunde** sind ins Archiv ausgelagert: [`archiv/ARCHIV_PANELS.md`](./archiv/ARCHIV_PANELS.md). Diese Datei führt nur noch die **offenen** Punkte.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md).

---

## Release-Review v0.2.0 (2026-05-17)

Befunde aus dem Release-Review von v0.1.2 → v0.2.0, die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `TerminalTab` Auto-Send-Timer kapselt `isActive` als Closure-Snapshot

- `src/renderer/panels/TerminalTab.tsx:300-315` · Kategorie: **Verbesserung**
- **Beschreibung:** Der Season-21-Auto-Send-Pfad (Docs-Sync / On-Demand-Kontext-Präambel) sitzt in `doSpawn`, der `isActive` aus dem useEffect-Scope kennt. useEffect läuft nur auf `[sessionId]`, also wird `isActive` zum Mount-Zeitpunkt eingefroren. Wenn der User in den 2,5 s Warmup zwischen Spawn-Success und Auto-Send einen anderen Tab fokussiert, läuft `if (isActive) { terminal.focus(); }` mit dem alten Wert. Praktisch egal, weil `terminal.focus()` keinen globalen Side-Effect hat — es fokussiert nur den gemounteten xterm, der nicht aktiv sichtbar ist. Der Auto-Send selbst (`terminal.paste(prompt)` + `pty.write('\r')`) läuft korrekt auf der richtigen Session-PTY.
- **Begründung:** Saubere Fix-Variante wäre `isActiveRef.current` analog zu `initialPromptRef` (bereits via `useRef` umgesetzt im selben Block). Aber: der einzige sichtbare Effekt wäre, dass `terminal.focus()` korrekt unterdrückt würde — null sichtbarer Nutzen, weil der inaktive xterm gar nicht im DOM-Fokus-Pfad liegt.
- **Trigger:** wenn jemals eine zweite Side-Effect-Aktion in den Auto-Send-Branch wandert, die echte Stale-Closure-Bugs zeigen würde (z.B. UI-Toast mit Tab-Name).

---

## Release-Review v0.2.1 (2026-05-17)

Befunde aus dem Release-Review von v0.2.0 → v0.2.1 (Hotfix Resume-UNIQUE-Constraint + Markdown-Preview Side-by-Side), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Markdown-Preview-Layout-Switch wirkt tab-/mount-lokal

- `src/renderer/components/MarkdownEditor.tsx:75-85` · Kategorie: **Verbesserung-Doku** (bewusste Designwahl)
- **Beschreibung:** Der Drei-Modi-Switch (Beide/Editor/Preview) in der Markdown-Editor-Toolbar setzt nur einen tab-lokalen `useState`. Beim Schließen und Wieder-Öffnen derselben Datei greift wieder `initialLayout` aus den Settings — der User-Switch persistiert nicht. Code-Kommentar an Zeile 84-85 dokumentiert das als bewusste Entscheidung („danach lokal pro Datei wechselbar").
- **Begründung:** Die User-Erwartung könnte abweichen („mein Switch wirkt permanent für diese Datei"). Keine konkrete UX-Beschwerde, aber der Punkt sollte als bewusste Designwahl im Code-Review-Gedächtnis stehen, damit künftige Reviews nicht erneut darüber stolpern.
- **Trigger:** wenn die UX-Beschwerde tatsächlich auftaucht — dann Per-Datei-Persistierung als eigene Mini-Season (z.B. via `lastUsedLayout`-Map in den Settings oder als Per-File-Frontmatter-Hint).

### Markdown-Preview reagiert nicht live auf Default-Layout-Wechsel im Settings-Modal

- `src/renderer/panels/EditorPane.tsx:34` ↔ `src/renderer/components/MarkdownEditor.tsx:75-85` · Kategorie: **Verbesserung**
- **Beschreibung:** Ändert der User den `markdown_editor_layout`-Default im Settings-Modal, während ein Markdown-Tab offen ist, bekommt die offene Editor-Instanz den neuen Default NICHT — `initialLayout` ist nur State-Init beim Mount. Erst beim Schließen + Neu-Öffnen einer Datei wirkt der neue Wert.
- **Begründung:** Konsistent mit dem dokumentierten Verhalten („nur den Startwert beim Mount"). Keine Datenverlust-Gefahr, reines UX-Detail. Eine Live-Reaktion wäre ein Effekt in `MarkdownEditor` mit `[initialLayout]` als Dep, der `setLayout(initialLayout)` setzt — würde aber die tab-lokale Switch-Entscheidung des Users überschreiben, sobald er das Settings-Modal öffnet/schließt. Reine Designwahl, kein Bug.
- **Trigger:** wenn der UX-Pfad „User stellt Default um, wundert sich, dass offene Tabs nicht mit umschalten" empirisch wehtut — dann Per-Default-Live-Refresh mit klarer Semantik (nur Tabs ohne lokalen Switch?) als eigene Mini-Season.

---

## Release-Review v0.3.0 (2026-05-19)

Befunde aus dem Release-Review von v0.2.1 → v0.3.0 (Terminal-Polish + Multi-Tab-Diff + Auto-Update + Session-Block-Bugfix), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden. Der einzige release-blockierende Befund (Auto-Open-Loop des Diff-Tabs in `EditorPane.tsx:118-123`) wurde vor dem Tag gefixt — siehe `docs/CHANGELOG.md` v0.3.0.

### `attachCustomKeyEventHandler` capturet stale `searchVisible` als Closure-Snapshot

- `src/renderer/panels/TerminalTab.tsx:209-233` (Closure in der `[sessionId]`-useEffect ab Zeile 153) · Kategorie: **Bug** (latent)
- **Beschreibung:** Der CustomKeyEventHandler wird einmal pro Tab-Mount gebunden und captured `searchVisible` als `false`. Der Escape-Branch in Zeile 224-231 (`if (... searchVisible)`) feuert deshalb nie. Heute irrelevant, weil der Such-Input ein eigenes `onKeyDown` an Zeile 876-885 hat und beim Anzeigen den Fokus zieht — Escape-Verhalten läuft über den Input-Pfad. Sobald der Fokus aus dem Such-Input wandert (z.B. wenn künftige Pfeil-Buttons der Search-Bar Tab-Fokus bekommen) und der User Escape im Terminal-Bereich drückt, wäre die Lücke aktiv.
- **Begründung:** Saubere Fix-Variante wäre `searchVisible` als `useRef` spiegeln (analog zu `isActiveRef`) und in der Handler-Funktion `searchVisibleRef.current` lesen — gleicher Trick wie bei `isActiveRef`. Heute kein sichtbarer Defekt.
- **Trigger:** wenn die Search-Bar um Tab-fokussierbare Elemente erweitert wird (z.B. „nächster Treffer"-Button) — dann die Ref-Spiegelung nachziehen.

### `fs.setWatchedProject`-useEffect ohne Cleanup-Return

- `src/renderer/panels/EditorPane.tsx:109-111` · Kategorie: **Verbesserung**
- **Beschreibung:** Der Effect setzt das aktive Projekt beim Datei-Watcher im Main, hat aber kein Cleanup-Return, das beim Unmount `setWatchedProject({ projectId: null })` ruft. In der Praxis vom `before-quit`-Pfad im Main abgefangen (Watcher wird beim App-Quit gestoppt), kein Live-Problem.
- **Begründung:** Wird zur echten Lücke, sobald EditorPane jemals dynamisch ent-mountet (z.B. wenn ein zukünftiger Refactor den Editor in ein modales Panel verschiebt). Heute ist EditorPane permanent gemountet, solange die App lebt.
- **Trigger:** wenn EditorPane unmount-fähig wird (Layout-Refactor) — dann Cleanup-Return ergänzen.

---

## Release-Review v0.3.1 (2026-05-19)

Befunde aus dem Release-Review von v0.3.0 → v0.3.1 (Hotfix Renderer-Crash beim Schließen aktiver Sessions + Auto-Update-404 + Klarnamen-Cleanup), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Context-Loss-Canvas-Fallback schluckt Load-Fehler stillschweigend

- `src/renderer/panels/TerminalTab.tsx:1053-1070` (Context-Loss-Handler in `loadRendererAddonWithFallback`) · Kategorie: **Warnung**
- **Beschreibung:** Beim WebGL-Context-Loss ruft der Handler erst `onAddonReplaced(null)` und versucht dann `new CanvasAddon()` + `terminal.loadAddon(canvas)`. Wirft der `loadAddon`-Call (z.B. weil das Terminal im selben Tick disposed wird), schluckt der innere `catch (canvasErr)` stillschweigend ohne ein zweites `onAddonReplaced(...)` zu rufen. Die Ref im TerminalTab bleibt dann dauerhaft `null` — der Cleanup-Pfad ist davon korrekt (No-op bei null), aber der Renderer verliert die Möglichkeit, im laufenden Tab noch zu rendern.
- **Begründung:** Sehr seltener Treiber-Reset-während-Tab-Unmount-Pfad. Cleanup ist sicher (Hauptzweck des v0.3.1-Fix). Eine Recovery-Verbesserung wäre ein zweiter Canvas-Versuch oder ein Fail-Fast in den ErrorBoundary-Fallback — beides nicht heute nötig.
- **Trigger:** wenn Context-Loss-Treiber-Resets in Telemetrie/Bug-Reports häufiger auftauchen — dann Recovery-Pfad robuster machen.

### Init-RAF-Cleanup: Schutz hängt am Guard im RAF-Callback statt synchronem Vornullen

- `src/renderer/panels/TerminalTab.tsx:292-304` (Init-RAF-Schedule) + `:543-581` (Cleanup) · Kategorie: **Verbesserung**
- **Beschreibung:** Schließt der User den Tab im 16-ms-Fenster zwischen RAF-Schedule und RAF-Fire, läuft Cleanup zuerst (`cancelAnimationFrame(initRafHandle)`). Heute korrekt, weil im RAF-Callback der Guard `if (terminalRef.current !== terminal) return` aktiv ist und `terminalRef.current` am Ende des Cleanups auf null gesetzt wird. Fällt der Guard jemals weg oder wird die Cleanup-Reihenfolge umgebaut, könnte das RAF-Callback `rendererAddonRef.current` setzen, nachdem das Cleanup bereits gelaufen ist.
- **Begründung:** Synchrones Vornullen von `terminalRef.current` direkt nach `cancelAnimationFrame(initRafHandle)` wäre robuster, weil der Schutz dann nicht an einer Reihenfolge-Annahme hängt. Heute keine konkrete Lücke.
- **Trigger:** wenn die Cleanup-Reihenfolge in einem Refactor angefasst wird oder der Guard im RAF-Callback gestrichen wird — dann das synchrone Vornullen einziehen.

### Test-Lücke: dispose-twice + onAddonReplaced-Vertrag in `safe-dispose.test.ts`

- `tests/renderer/safe-dispose.test.ts` · Kategorie: **Verbesserung**
- **Beschreibung:** Die fünf Tests decken die im Commit erwähnten Verträge (Addon-Normal-Dispose, null-No-op, Addon-Exception-Schluck mit Label, Terminal-Normal-Dispose, Terminal-Exception-Schluck mit Label). Es fehlen Tests für (a) dispose-twice-No-op (Aufrufer disposed zweimal nach Refactor-Versehen — sollte stumm laufen), (b) Non-Error-Thrown wie `throw 'string'` / `throw null` (durch catch-all eh abgedeckt, aber als Vertrags-Anker hilfreich), (c) die `onAddonReplaced`-Callback-Semantik (Context-Loss-Tausch nullt die Ref korrekt).
- **Begründung:** Die Verhaltens-Verträge sind durch das catch-all eh abgedeckt; die Sentinel-Eigenschaft „Ref nach Context-Loss korrekt nachgezogen" hängt aber nur am Code-Review, nicht an einem Test.
- **Trigger:** wenn der `onAddonReplaced`-Pfad oder die `safeDispose`-Helper in einem Refactor angefasst werden — dann die fehlenden Test-Anker mit einziehen.

### Bestätigung: `attachCustomKeyEventHandler`-stale-`searchVisible` aus v0.3.0-Block weiter offen

- `src/renderer/panels/TerminalTab.tsx:209-233` (Closure aus dem v0.3.0-Block, hier nur Bestätigung) · Kategorie: **Verbesserung-Doku**
- **Beschreibung:** Der v0.3.1-Hotfix hat den im v0.3.0-Release-Review gemeldeten stale-`searchVisible`-Closure nicht angefasst — konsistent mit dem reinen Bugfix-Scope (Renderer-Crash + Auto-Update-404 + Klarnamen-Cleanup). Der Eintrag aus dem v0.3.0-Block bleibt unverändert gültig.
- **Begründung:** Im v0.3.0-Block dokumentiert, kein neuer Befund. Eintrag hier nur als Audit-Spur, dass die v0.3.1-Reviewer-Runde die Lücke aktiv gegengeprüft hat.
- **Trigger:** siehe v0.3.0-Block-Eintrag.

### ErrorBoundary sitzt innerhalb `<StrictMode>` (Stilanmerkung)

- `src/renderer/main.tsx:15-21` · Kategorie: **Verbesserung-Doku** (Stilanmerkung)
- **Beschreibung:** Die ErrorBoundary wickelt `<App>` innerhalb `<StrictMode>`. Im Dev-Build rendert StrictMode Komponenten und Effects doppelt — wirft ein Effect-Cleanup eine sync-Exception, wird die Boundary im Dev-Lauf mehrfach getriggert. Kein Defekt (Fallback ist idempotent, `getDerivedStateFromError` ist pure), aber React-Doku empfiehlt die Boundary außerhalb von `<StrictMode>`, damit Boundary-Render-Fehler nicht selbst vom StrictMode-Doppellauf betroffen sind.
- **Begründung:** Heute ohne sichtbaren Defekt, reine Stilanmerkung.
- **Trigger:** wenn eine zukünftige Boundary-Erweiterung Side-Effects im Boundary-Render-Pfad einführt — dann Boundary nach außen ziehen.

### ErrorBoundary fängt keine async Promise-Rejects (React-Vertrag)

- `src/renderer/components/ErrorBoundary.tsx:30-34` (`componentDidCatch`) · Kategorie: **Verbesserung-Doku** (bewusste Designwahl)
- **Beschreibung:** Die ErrorBoundary fängt nur sync-Throws aus Render und Effect-Cleanup. Async-Promise-Rejects aus Effects laufen an der Boundary vorbei und landen als Unhandled-Rejection in der DevTools-Konsole. Das ist React-API-Vertrag, kein Code-Defekt. Der aktuelle Bug (sync-Throw aus Effect-Cleanup) ist durch v0.3.1 abgedeckt; async-Rejects bleiben ein Loch, das aber kein neuer Defekt ist.
- **Begründung:** React-API-Vertrag. Eine ergänzende Lösung wäre ein globaler `window.addEventListener('unhandledrejection', ...)`-Handler, der eine ähnliche Reload-Surface zeigt — separate Mini-Season-Karte.
- **Trigger:** wenn ein async-Reject-Crash in Production beobachtet wird, der heute stumm landet — dann globalen Unhandled-Rejection-Handler ergänzen.

### `handleReload` verliert Dirty-Editor-Tab-State stillschweigend

- `src/renderer/components/ErrorBoundary.tsx:36-40` · Kategorie: **Verbesserung**
- **Beschreibung:** `window.location.reload()` reloaded den Renderer komplett und verwirft dabei alle Dirty-Editor-Tabs (uncommittete Bearbeitungen im EditorPane). Der Main-Prozess (PTYs, DB-Connections, Watcher) bleibt sauber, weil nur der Renderer-Tree neu lädt — aber Editor-Dirty-State lebt nur im Renderer.
- **Begründung:** Heute akzeptabler Trade-off, weil der Reload-Button ein Notausgang im Fallback ist und nicht der Hauptpfad. Eine Warn-Confirm vor dem Reload („Du hast nicht gespeicherte Änderungen, fortfahren?") wäre der saubere Pfad.
- **Trigger:** wenn ein User in Praxis durch den ErrorBoundary-Fallback eine längere Edit-Session verliert — dann Dirty-Check-Confirm einbauen.

---

## Release-Review v0.4.0 (2026-05-29)

Befunde aus dem Release-Review von v0.3.2 → v0.4.0 (Terminal-Buffer-Restore/Persist in TerminalTab, Aufmerksamkeits-Marker + Rechtsklick-Kontextmenu in der LeftSidebar), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Zwei ContextMenu-Implementierungen mit divergierender Listener-Strategie

- `src/renderer/components/ProjectContextMenu.tsx:29-49` ↔ `src/renderer/panels/TerminalTab.tsx:1068-1083` · Kategorie: **Verbesserung**
- **Beschreibung:** `ProjectContextMenu` nutzt `setTimeout(0)` + bubble-phase `mousedown`; das `TerminalContextMenu` nutzt capture-phase `mousedown` ohne Delay. Beide funktionieren korrekt (der auslösende `mousedown` feuert vor dem `contextmenu`-Event, daher keine Selbstschließ-Falle), aber die divergierenden Muster sind eine Wartungs-Inkonsistenz.
- **Begründung:** Bei nächstem Touch auf ein gemeinsames Pattern (oder eine geteilte `useDismissableMenu`-Hook) vereinheitlichen. Heute kein Defekt.
- **Trigger:** dritter ContextMenu-Anwender oder wenn eines der Menüs ohnehin angefasst wird.

### Inline-Arrow-Callbacks als Listener-Effekt-Dependency (Re-Register-Churn)

- `src/renderer/panels/LeftSidebar.tsx:443`, `src/renderer/panels/TerminalTab.tsx:959` · Kategorie: **Verbesserung**
- **Beschreibung:** `onClose={() => setMenu(null)}` bzw. `onDismiss={() => setContextMenu(null)}` sind pro Render neue Funktionsreferenzen → der Listener-Effekt in beiden Menüs (`[onClose]`/`[onDismiss]`) re-registriert document-Listener bei jedem Parent-Render. Kein Leak (Cleanup greift), nur unnötige Churn.
- **Begründung:** `useCallback` an der Aufrufstelle. Reine Mikro-Optimierung ohne Funktionsänderung.
- **Trigger:** zusammen mit der ContextMenu-Vereinheitlichung oben.

---

## Code-Review PANELS (2026-05-31)

Befunde aus dem Bereichs-Review der Renderer-Panels (alle 13 Dateien). Bugs/Warnungen/Verbesserungen wurden gefixt (siehe git-History desselben Tages); die folgenden **Design-by-Choice**-Befunde bleiben bewusst offen.

### `flushPendingFrames` nur im `.finally` des Restore-IPC gerufen

- `src/renderer/panels/TerminalTab.tsx` (Restore-Queue im `[sessionId]`-Effect) · Kategorie: **Design-by-Choice**
- **Beschreibung:** Die Pre-Frame-Queue (`pendingFrames`) wird nur im `.finally` des `loadBuffer`-IPC geleert. Geprüft und sicher: `.finally` läuft bei einem Promise garantiert (auch nach `.catch`), die Queue bleibt also nie stehen. Mit dem 1.1-Fix nimmt jetzt auch der `pty:exit`-Pfad dieselbe Queue, und der Cleanup-Save (1.2/1.4) überspringt den Save, solange `restoreReady` noch `false` ist — der gespeicherte Snapshot wird nicht durch einen Teil-Buffer überschrieben.
- **Begründung:** Keine Änderung nötig — als geprüft-und-sicher dokumentiert, damit der nächste Review den `.finally`-only-Pfad nicht erneut als potenzielle Hängen-bleibt-Lücke meldet.
- **Trigger:** wenn der Restore-/Queue-Pfad in einem Refactor umgebaut wird.

### `handleOpenInEditorFromDiff` setzt auf synchrones `openFile`

- `src/renderer/panels/EditorPane.tsx:98-105` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der Auto-Open-Pairing-Handler ruft `openFile(...)` und direkt danach `setActive(projectId, 'diff')`, damit der User auf der Diff-Pane bleibt. Das funktioniert nur, weil `openFile` synchron in den Store schreibt. Eine künftige Async-Variante von `openFile` würde das `setActive('diff')` davor laufen lassen, und der frisch geöffnete File-Tab würde doch aktiv. Im Code-Kommentar (Z.92-97) dokumentiert.
- **Begründung:** Heute korrekt; reiner Dokumentations-Anker.
- **Trigger:** wenn `openFile` jemals auf async umgestellt wird — dann den `setActive('diff')`-Reset in die `.then`-Kette ziehen.

### Hardcoded P90-Fenster „192 h" in der TitleBar

- `src/renderer/panels/TitleBar.tsx:198` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der System-Status-Slot zeigt fest „P90 192 h", während `PlanPane.tsx:72` denselben Wert korrekt aus `settings.p90_window_hours` zieht. Stellt der User das Fenster in den Settings um, bleibt die TitleBar bei 192 h. Der Inline-Kommentar (Z.198) markiert das bereits als „Phase 2: aus settings.p90_window_hours ziehen".
- **Begründung:** Im Code als Phase-2-TODO markiert; kein funktionaler Defekt, nur eine Anzeige-Inkonsistenz.
- **Trigger:** wenn `settings` ohnehin an die TitleBar durchgereicht wird oder die Inkonsistenz empirisch stört.

### `usage.onUpdate`-Listener ohne `scope`/`range` in den Deps

- `src/renderer/panels/StatsPane.tsx:150-160` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der Push-Listener-Effekt hat nur `[refresh, refreshHeatmap, activeProjectId]` als Deps; `scope`/`range` fehlen. Korrekt, weil `refresh`/`refreshHeatmap` ihre Filter über `get()` store-intern lesen, nicht über Closure-Argumente. Der erste Refresh-Effekt (Z.133-141) listet `scope, range` dagegen explizit (er soll bei jedem Wechsel sofort neu laden). Die Asymmetrie ist gewollt.
- **Begründung:** Funktional korrekt; ein Kommentar zur Asymmetrie wäre nice-to-have, mehr nicht.
- **Trigger:** wenn `refresh`/`refreshHeatmap` jemals ihre Filter als Argument statt via `get()` lesen — dann `scope`/`range` in die Deps nachziehen.
