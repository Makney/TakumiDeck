# Season-Log

Protokoll aller abgeschlossenen Seasons. Ergänzt [CHANGELOG.md](./CHANGELOG.md) (das den Feature-Mehrwert dokumentiert) mit dem *Prozess-Kontext*: Was lief gut? Was hat gebremst? Was sollte die nächste Season anders machen?

## Unterschied zum CHANGELOG

- **CHANGELOG.md** → Was kann der Nutzer jetzt? (Ergebnis-fokussiert, fachlich)
- **Dieses Dokument** → Wie lief die Season? (Prozess-fokussiert, retrospektiv)

## Format pro Eintrag

- `##`-Überschrift: `Season <N> — <Feature-Name>`
- **Ziel:** Was war der geplante Scope zu Beginn?
- **Ergebnis:** Was wurde tatsächlich fertig? Delta zum Ziel benennen, falls vorhanden.
- **Gut gelaufen:** Konkrete Dinge, die die Season effizient gemacht haben.
- **Gebremst durch:** Konkrete Hindernisse (unklare Anforderungen, technische Überraschungen, Scope-Creep).
- **Für nächste Season:** Maximal 2–3 direkt umsetzbare Hinweise.

Neue Einträge **oben** anfügen (neuste Season zuerst).

---

## Season 1 — Foundation-Skelett

**Ziel:** Sprint-1-Foundation aufsetzen: Electron-Skelett, IPC, SQLite, Settings-System, tokens.css aus Claude-Design-Export.

**Ergebnis:** Alle vier Foundation-Features ✅. Die App startet via `start-dev.bat`, legt `%APPDATA%\TakumiDeck-dev\` mit kompletter Datenstruktur an und zeigt im Smoke-View Version + Default-Settings über die typed IPC-Bridge.

**Gut gelaufen:**

- Variants-Pflicht vor dem Code: vier offene Architektur-Fragen (Settings-Backend, zod-Timing, Logging, Test-Setup) wurden vor dem ersten File-Schreiben mit A/B/C beantwortet — keine Mid-Sprint-Umentscheidungen nötig.
- Fake-Driver-Pattern für den Migration-Runner: ermöglicht Vitest-Läufe unabhängig vom better-sqlite3-ABI-State, der nach `electron-rebuild` ständig kippt.
- Architektur-Doku als Single-Source-of-Truth: SQLite-Schema, Settings-Defaults und IPC-Channels waren zu 100 % vorgegeben, kein Erfinden nebenbei.

**Gebremst durch:**

- `npm install` schlägt mit Node 24 + fehlendem Visual Studio C++ fehl (better-sqlite3 versucht Source-Build). Workaround: `npm install --ignore-scripts` plus manuell `node node_modules/electron/install.js` plus `npx electron-rebuild`. Hat ~20 Minuten Debug gekostet.
- Vite-Forge-Plugin emittet Output-Files nach Entry-Filename. Beide Entries hießen `index.ts` → Output-Kollision in `.vite/build/`. Nach Umbenennen auf `main.ts` / `preload.ts` sauber.
- Electron-Forge im Bash-Background-Spawn detached die Electron-Stderr — Crashes vor `whenReady()` waren unsichtbar. Workaround: temporärer File-Logger via `os.tmpdir()`. In einer echten Terminal-Session unkritisch.

**Für nächste Season:**

- Bei jedem neuen Native-Modul (z.B. `@homebridge/node-pty-prebuilt-multiarch` in Sprint 2) sofort `npx electron-rebuild -f -w <pkg>` einplanen, nicht erst wenn’s knallt.
- IPC-Channels für PTY und Sessions konsequent mit zod-Schema einführen — die Convention aus Sprint 1 nicht aufweichen.
