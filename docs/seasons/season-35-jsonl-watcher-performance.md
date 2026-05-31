# Season 35 — Kickoff: JSONL-Watcher Performance & Single-Instance

> Grundlage für eine separate Season. Format nach `docs/templates/SEASON_PROMPT.md`.
> Status: 📋 geplant · erstellt 2026-05-31 · Basis-Version v0.4.0

## Briefing

**Season-Ziel:** TakumiDeck startet nicht mehr mit 2–3 GB RAM und friert die
Session-UI nicht mehr ein; die JSONL-Verarbeitung belastet den Main-Thread nicht
länger, und eine zweite Instanz startet keinen konkurrierenden Prozess.

**Roadmap-Referenz:** ad-hoc (Performance-/Stabilitäts-Bugfix, kein PHASE-Feature).

**Scope-Grenzen:**
- Keine Änderung am sichtbaren Funktionsumfang (Token-/Usage-Tracking, Stats,
  Resume bleiben verhaltensgleich).
- Kein Umbau der DB-Schicht/Schema außer dem, was für die Worker-Auslagerung
  zwingend nötig ist.
- Kein UI-Redesign.

**Betroffene Bereiche (Vermutung — Agent verifiziert):**
`src/main/main.ts`, `src/main/jsonl/watcher.ts`, `src/main/jsonl/polling-ring.ts`;
Vergleichsmuster `src/main/fs/project-watcher.ts`.

## Kontext

**Symptom (User, 2026-05-31):** App läuft direkt nach dem Start bei 2–3 GB RAM,
obwohl nichts passiert, und die Session-UI ist nicht anklickbar. Eine **zweite**
Instanz läuft normal und reaktionsschnell.

**Befund aus Log & Code:**

- `logs/main.log`: **16.595 von ~20.000 Zeilen** stammen vom `[jsonl-watcher]`.
  `data.sqlite` ist auf **76 MB** gewachsen. `watchedEntries` beim Start: **496**
  (am 2026-05-12 noch 217 — wächst mit jeder Claude-Nutzung).
- `src/main/jsonl/watcher.ts:60` — chokidar watcht den **gesamten**
  `~/.claude/projects`-Baum mit `ignoreInitial: false` und **ohne `depth`-Limit**.
  Beim Start feuert für jede der ~496 Dateien ein `add`-Event → `handleFile()`.
- `src/main/jsonl/watcher.ts:148` — `handleFile` ruft **pro Datei-Event**
  `backfillClaudeSessionId()` auf → `listMissingClaudeSessionId()` macht einen
  **Full-Scan über alle Sessions**. Nach dem einmaligen Backfill reine
  Verschwendung, läuft aber bei jedem `change` weiter.
- DB-Writes (`messages.insert`, `usage.upsertBucket`) laufen **synchron**
  (better-sqlite3) **im Main-Prozess** — derselbe Thread, der die IPC zum Fenster
  bedient. Lange Bursts blockieren den Renderer → „kann nichts anklicken".
- **Rückkopplung:** Aktive Claude-Sessions schreiben permanent in
  `~/.claude/projects/*.jsonl`. Jeder Write triggert Watcher → Parse → Full-Scan →
  synchroner DB-Write. Je aktiver Claude, desto stärker friert die UI ein.
- `src/main/main.ts` hat **kein `app.requestSingleInstanceLock()`**. Eine zweite
  Instanz ist daher ein frischer Prozess mit eigenem, reaktionsfähigem Fenster
  (erklärt „2. Instanz läuft normal") — watcht aber denselben Baum und schreibt in
  dieselbe `data.sqlite` → doppelte Arbeit + SQLite-Contention.

## Lösungsplan (nach Wirkung/Aufwand)

1. **Single-Instance-Lock** (`main.ts`, klein/risikoarm):
   `app.requestSingleInstanceLock()`; bei Fehlschlag `app.quit()`, im
   `second-instance`-Event vorhandenes Fenster `restore()` + `focus()`.
2. **`backfillClaudeSessionId` entschärfen** (`watcher.ts:148`, klein): Full-Scan
   nicht bei jedem `change` — nur bei `add`, oder „alles befüllt"-Kurzschluss,
   oder per-File-`Set` schon verarbeiteter Pfade.
3. **JSONL-Ingestion vom Main-Thread auslagern** (Strukturfix): Parse + DB-Writes
   in `utilityProcess`/Worker. Eigentlicher Fix gegen das Einfrieren; ggf. eigene
   Folge-Season, falls 1+2 schon genug entlasten.
4. **Watch-Umfang begrenzen** (mittel): `depth`-Limit (vgl. `project-watcher.ts`
   `depth: 8`), alte/inaktive Session-Ordner per mtime-Cutoff ignorieren,
   Historie-Backfill einmalig statt `ignoreInitial: false` bei jedem Start.

**Sofort-Mitigation ohne Rebuild:** alte Ordner aus `~/.claude/projects`
archivieren (vorher sichern) — weniger Einträge = weniger Speicher/Events.

## Definition of Done

- [ ] Start-RAM im Leerlauf < ~600 MB (statt 2–3 GB).
- [ ] UI bleibt während aktiver Claude-Sessions klickbar (kein IPC-Stall).
- [ ] Zweite Instanz fokussiert das vorhandene Fenster statt einen zweiten Prozess
      zu starten.
- [ ] Token-/Usage-Tracking unverändert (keine Stats-Regression).
- [ ] Tests für das neue/geänderte Verhalten (Season-Scope): Backfill läuft nicht
      mehr pro `change`; Single-Instance-Verhalten manuell verifiziert.
- [ ] `npm run typecheck` + `npm run lint` grün.
- [ ] Doku-Updates nach Trigger-Phrase (falls zutreffend).

## Hinweise an den Agent

- **Variants vor Architektur:** Schritt 3 (Worker-Auslagerung) als A/B/C mit
  Aufwand-Tabelle vorlegen, bevor implementiert wird.
- Schritte 1+2 sind risikoarm und können vorab als Quick-Win laufen.
- Vergleichsmuster für Watch-Begrenzung: `src/main/fs/project-watcher.ts`
  (`depth: 8`, Skip-Dirs, `ignoreInitial: true`).
- Kommentare/Commits auf Deutsch (Working Rules).
