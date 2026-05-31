# Code-Review · Build- und Konfig-Layer · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_BUILD.md`](../OFFEN_BUILD.md) — Status **Behoben** oder **Gegenstandslos**.

---

## Fallow-Findings verifiziert: bereits aufgelöst oder Design-by-Choice (Bereichs-Review 2026-05-12)

Die in der Build-Bereichs-Sitzung mitgelaufenen Fallow-Hypothesen sind im Code bereits adressiert — dokumentarisch festgehalten, damit der nächste Review-Durchgang das nicht erneut nachzieht:

- `codemirror` (Umbrella-Package) aus den `dependencies` entfernt — alle `@codemirror/*`-Sub-Pakete sind weiter direkt deklariert (Commit `5dc33d0`).
- `@electron-forge/shared-types` als explizite devDep ergänzt (war nur transitiv) — Type-Import in `forge.config.ts:1` jetzt sauber aufgelöst (Commit `5dc33d0`).
- `electron-winstaller` als unused devDep gemeldet — siehe Eintrag „`electron-winstaller` als devDependency ohne Forge-Konsument" in [`OFFEN_BUILD.md`](../OFFEN_BUILD.md) (gewollter Pin-Anker, bleibt offen/Design-by-Choice).
