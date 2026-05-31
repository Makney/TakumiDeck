# Code-Review · Main-Services · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_MAIN_SERVICES.md`](../OFFEN_MAIN_SERVICES.md) — Status **Behoben** oder **Gegenstandslos**.

---

## ESLint-Vor-Pass-Befunde (2026-05-10)

### ✅ parser.ts catch-Variable `e` ungenutzt — BEHOBEN 2026-05-11

- `src/main/jsonl/parser.ts:69` · Kategorie: **Warnung**
- **Beschreibung:** Catch-Block deklarierte `e`, nutzte es aber nicht. ESLint `@typescript-eslint/no-unused-vars` warnte, weil das Pattern `^_` für bewusst-ignoriert nicht erfüllt war.
- **Auflösung (2026-05-11):** Bereich-3-Review hat verifiziert, dass die Fail-Soft-Strategie korrekt ist (Warnings werden zum Watcher propagiert und geloggt), die Error-Detail-Message ging aber verloren. Fix: `e instanceof Error ? e.message : String(e)` wird jetzt in den Warning-Text aufgenommen; `eslint-disable`-Zeile + FIXME-Kommentar entfernt.
