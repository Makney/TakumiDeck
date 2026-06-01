# Code-Review · Build- und Konfig-Layer · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_BUILD.md`](../OFFEN_BUILD.md) — Status **Behoben** oder **Gegenstandslos**.

---

## Fallow-Findings verifiziert: bereits aufgelöst oder Design-by-Choice (Bereichs-Review 2026-05-12)

Die in der Build-Bereichs-Sitzung mitgelaufenen Fallow-Hypothesen sind im Code bereits adressiert — dokumentarisch festgehalten, damit der nächste Review-Durchgang das nicht erneut nachzieht:

- `codemirror` (Umbrella-Package) aus den `dependencies` entfernt — alle `@codemirror/*`-Sub-Pakete sind weiter direkt deklariert (Commit `5dc33d0`).
- `@electron-forge/shared-types` als explizite devDep ergänzt (war nur transitiv) — Type-Import in `forge.config.ts:1` jetzt sauber aufgelöst (Commit `5dc33d0`).
- `electron-winstaller` als unused devDep gemeldet — siehe Eintrag „`electron-winstaller` als devDependency ohne Forge-Konsument" in [`OFFEN_BUILD.md`](../OFFEN_BUILD.md) (gewollter Pin-Anker, bleibt offen/Design-by-Choice).

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_BUILD.md`](../OFFEN_BUILD.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### Husky-Pre-Commit ruft `typecheck` + `lint` aber kein `test`

- `.husky/pre-commit` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Architektur-Review-Soll der Build-Konfig nennt „Husky-Pre-Commit-Hook führt `typecheck` + `test` aus". Aktueller Stand: der Hook ruft `npm run typecheck` und `npm run lint -- --max-warnings=0`, aber nicht `npm run test`. CLAUDE.md Regel 6 fordert, dass Linting und Tests vor dem Commit grün sind — der manuelle Lauf ist Teil des Commit-Triggers, nicht des Hooks.
- **Begründung:** Vitest läuft beim Full-Suite-Pass aktuell ~12-18 s — das ist der Punkt, ab dem ein Pre-Commit-Hook Reibung beim häufigen Commit-Workflow erzeugt (mehrfach pro Stunde während aktiver Sprint-Arbeit). Typecheck (~3 s) und Lint (~2 s) sind akzeptabel, die Test-Suite wäre die teuerste Komponente. Tests werden stattdessen explizit vor dem Commit-Signal manuell ausgeführt — der Workflow ist „typecheck + lint im Hook, test vor dem Commit-Trigger durch den Assistenten" (CLAUDE.md Regel 6 ist kein Hook-Zwang, sondern eine Bedingung an den Commit-Zeitpunkt).
- **Trigger:** wenn die Test-Suite jemals deutlich schneller wird (z.B. nach Sharding auf Vitest-Worker-Threads), oder wenn die Anzahl an „test war rot beim Commit"-Vorfällen zunimmt — dann `npm run test` mit aufnehmen.
- **Behoben:** 2026-06-01 · gegenstandslos · Der Hook ruft inzwischen `npm test` mit — `.husky/pre-commit` lautet `npm run typecheck && npm run lint -- --max-warnings=0 && npm test`. Der Befund „kein test im Hook" trifft nicht mehr zu. Auch die ursprüngliche Reibungs-Begründung (~12-18 s Suite) ist überholt: die volle Suite läuft aktuell ~2,5 s (1066 Tests).
