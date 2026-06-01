# Übergabe-Prompt — OFFEN-Abarbeiten Charge 3 + 4

Den folgenden Block in eine neue Season / Session kopieren. Er setzt den OFFEN-Abarbeiten-Lauf für die noch offenen Bereiche fort (MODALS, PANELS, MAIN_SERVICES, BUILD). Charge 1+2 (SHARED, DB, IPC) sind in Commit `e12f7c5` erledigt.

---

```text
OFFEN-Abarbeiten — Fortsetzung (Charge 3 + 4)
Bereiche: MODALS, PANELS, MAIN_SERVICES, BUILD

Du bist Implementierer. Du suchst KEINE neuen Befunde.
Du arbeitest ausschließlich die bereits dokumentierten Einträge aus den
OFFEN_<BEREICH>.md-Dateien ab — Eintrag für Eintrag, auf mein „fix it"-Signal.
Ablauf, Pflege-Regeln und Phasen stehen in docs/templates/OFFEN_ABARBEITEN.md —
lies sie zuerst, ich fasse hier nur den Stand und die Lehren aus Charge 1+2 zusammen.

Pflicht-Lektüre vor dem Start
- docs/templates/OFFEN_ABARBEITEN.md       (der Lauf-Ablauf, dem du folgst)
- CLAUDE.md                                (Working Rules, insb. Variants + Trigger)
- docs/CODING_RULES.md                     (Simplicity First, Surgical Changes)
- docs/MARKDOWN_RULES.md                   (für OFFEN-/Archiv-Annotationen)
- docs/code-review/OFFEN_TEMPLATE.md       (Pflege-Regeln + Archive-Skript-Workflow)
- Pro Bereich: docs/code-review/OFFEN_MODALS.md, OFFEN_PANELS.md,
  OFFEN_MAIN_SERVICES.md, OFFEN_BUILD.md

Zu bearbeitende Einträge
Alle (jeder Eintrag ohne „Behoben:"-Trailer)

Reihenfolge (klein/risikoarm zuerst, ein Bereich nach dem anderen)
1. MODALS        (~22 offen)
2. PANELS        (~18 offen)
3. MAIN_SERVICES (~17 offen)
4. BUILD         (9 offen)

Stand aus Charge 1+2 (NICHT erneut anfassen, ist erledigt)
- SHARED: err()-Shape vereinheitlicht, FsSetWatchedProject-Kommentar, GitSessionDiff/
  TemplatesAllocateSeason auf uuid(). 2 DbC-Einträge bewusst offen gelassen.
- DB: K-3, S-6, K-7 behoben/archiviert. Rest (B-3, S-1..S-5, P-2, K-2, K-5, K-6,
  D-3, D-4, K-8) bewusst offen.
- IPC: pty:create sha-Kommentar, fs:set-watched-project-Log, terminal:save-buffer-Log
  behoben. Rest bewusst offen.

Bewährte Lehren aus Charge 1+2 (bitte übernehmen)
- Die MEHRHEIT der Einträge ist bewusst geparkte Design-by-Choice mit NICHT
  gezündetem Trigger — sie wurden gefilt, damit sie NICHT angefasst werden.
  Baue in Phase 1 pro Bereich eine Tabelle mit Spalte „fixbar JETZT / verschieben /
  braucht Entscheidung" und leg sie mir vor. Empfiehl konservativ „verschieben",
  wo der Trigger nicht erreicht ist (Premature-Abstraction-/Surgical-Changes-Verstoß
  sonst).
- Doc-Drift-Einträge, die docs/TAKUMIDECK_ARCHITEKTUR.md ändern (z.B. fehlende
  Schema-Spalten), brauchen den docs_update-Trigger „ist korrekt umgesetzt" —
  NICHT „fix it" (CLAUDE.md Regel 3). Anfassen nur mit diesem Signal.
  Hinweis: In BUILD/MAIN_SERVICES sind mehrere „Verbesserung-Doku"-Punkte reine
  Code-Kommentare (z.B. depth=5-vs-8 in project-watcher.ts) — die sind fix-it-tauglich.
- Architektur-Entscheidungen (FK ja/nein, CHECK-Constraint, Migration-Änderung)
  leg mir als Varianten A/B/C vor, statt selbst zu entscheiden.
- Zeilennummern in den OFFEN-Einträgen sind oft GEDRIFTET. Vor jedem Edit die
  echte Stelle per Grep verifizieren, dann die Zeilen-Refs im Eintrag mit-aktualisieren.
- Pro behobenem Eintrag: „**Behoben:** YYYY-MM-DD · <Variante/Art> · <Notiz>"-Trailer
  setzen (als Bullet bei Bullet-Einträgen, als nackter Absatz sonst). NICHT von Hand
  archivieren.
- Wenn eine OFFEN-Datei eine PROSA-Status-Sektion hat (wie OFFEN_DB.md), die behobene
  Einträge als „Offen" listet: nach dem Archivieren die Status-Sektion mit-aktualisieren
  (von Offen → Behoben), sonst wird sie stale.
- Archive-Skript: `py scripts/archive-resolved.py <BEREICH>` (Trockenlauf), dann
  `--apply <BEREICH>`. ACHTUNG: das Skript crasht auf der Windows-Konsole (cp1252) beim
  Drucken von Titeln mit Sonderzeichen (↔, ·). Immer mit `PYTHONIOENCODING=utf-8`
  davor aufrufen, z.B.:
      PYTHONIOENCODING=utf-8 py scripts/archive-resolved.py MODALS
  (Offener Tooling-Punkt: `sys.stdout.reconfigure(encoding='utf-8')` am Skript-Anfang
  würde das dauerhaft lösen — separat von mir freigeben lassen.)
- Verifikation pro Fix: `npm run typecheck` + gezielt `npx vitest run <betroffene-Tests>`
  + ggf. `npx eslint <geänderte Dateien> --max-warnings=0`. Kommentar-/Log-only-Fixes:
  typecheck + lint genügen.
- Kein Doku-Update jenseits der OFFEN-/Archiv-Pflege ohne „ist korrekt umgesetzt".
- Kein git-Commit ohne „commit". Wenn ich „commit" sage: nur die geänderten
  Projekt-Dateien stagen, Message „TakumiDeck: <kurz, Deutsch>", push.
  Pre-Commit-Hook (typecheck + lint + volle Test-Suite) muss grün sein.

Phase-1-START
Beginne mit Bereich 1 (MODALS): lies OFFEN_MODALS.md vollständig, baue die
Arbeits-Tabelle (Kennung · Datei:Zeile · Kategorie · fixbar/verschieben/Entscheidung),
schlag eine Reihenfolge vor und STOPP — frag mich, ob du mit dem ersten Eintrag
beginnen sollst. Dann Eintrag für Eintrag auf mein „fix it".
```

---

## Kontext zum Stand (für mich, nicht Teil des Prompts)

- **Erledigt:** Commit `e12f7c5` — Charge 1 (SHARED) + Charge 2 (DB/IPC), 9 Fixes, 32 bewusst verschoben.
- **Offen:** MODALS (~22), PANELS (~18), MAIN_SERVICES (~17), BUILD (9) ≈ 66 Einträge — erwartbar sind davon nur ~10–15 echte Fixes, der große Rest bleibt als DbC offen.
- **Erwartete echte Fix-Kandidaten** (aus der Phase-1-Voranalyse, im neuen Lauf zu bestätigen):
  - MODALS: `Number('') → 0`-Guard in Settings-Inputs, `HistoryActionModal` Font-Size-14, `resolveAutoVars` fehlendes `.catch`, Sensitive-File-Default-Liste (`*.pfx`/`.npmrc` etc.), `bulletCount`-Heuristik.
  - PANELS: hardcoded P90 „192 h" in der TitleBar, evtl. `attachCustomKeyEventHandler`-Ref-Spiegelung (latent).
  - MAIN_SERVICES: `project-watcher.ts` depth-Kommentar (5 vs. 8), `changedFilesAgainst`-Log, latenter `electron-updater`-Init-Guard.
  - BUILD: meist Upstream/CI — der CI-Maker-0-Befund ist nur gegen die GitHub-CI verifizierbar (eher Release-Vorlauf als OFFEN-Fix).
