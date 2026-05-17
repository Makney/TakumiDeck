# Versionierungs-Schema

Definiert, **wie Versionsnummern für {{PROJEKT_NAME}} vergeben werden** und **wann eine Versionsnummer überhaupt hochzählt**.

Diese Datei ist die Quelle der Wahrheit für das Schema. Die *Liste* aller Releases steht in [RELEASES.md](./RELEASES.md), die *aktuelle Version* zusätzlich im Frontmatter von [CLAUDE.md](../../CLAUDE.md) (`workbench.current_version`).

---

## Kernprinzipien

1. **Es gibt zwei Welten: DEV und Release.**
   - DEV = `main` (oder `dev`) — hier landet jedes neue Feature laufend.
   - Release = ein eingefrorener, code-review-geprüfter Stand, der nach außen geht (Tag + ggf. Build).
2. **Versionsnummer zählt NUR bei Release hoch — nicht bei jedem DEV-Feature.**
   In DEV gibt es keine Versionsnummer. Erst wenn ein Stand zum Release freigegeben wird, bekommt er eine.
3. **Vor jedem Release: gezielter Code-Review** der Dateien, die sich **seit der vorherigen Version** geändert haben. Dazu → [REVIEW_TEMPLATE.md](./REVIEW_TEMPLATE.md).
4. **Pro Release: ein eigener Release-Notes-Eintrag** als Datei `v<MAJOR>.<MINOR>.<PATCH>.md` im Ordner `docs/release/`. Vorlage → [TEMPLATE.md](./TEMPLATE.md).

---

## Schema: `MAJOR.MINOR.PATCH`

| Stelle | Wann sie hochzählt | Beispiel |
| ------ | ------------------ | -------- |
| `MAJOR` | **Phasenwechsel der Roadmap.** Eine Phase ist abgeschlossen, die nächste startet mit qualitativ neuem Funktionsumfang. Vor `1.0.0` ist das der einzige Auslöser; ab `1.0.0` zusätzlich jeder Breaking Change (siehe unten). | `0.x.x → 1.0.0` |
| `MINOR` | **Ein vom Nutzer wahrnehmbares Feature.** Neues sichtbares Verhalten, neuer Befehl, neues Template, neue Doku-Sektion mit eigener Funktion. Reine Bugfixes oder interne Umbauten zählen nicht. *Faustregel:* würde dieser Release einen eigenen „Neu"-Eintrag in `CHANGELOG.md` rechtfertigen? Dann Minor. | `0.1.x → 0.2.0` |
| `PATCH` | **Reparatur, Politur, internes Aufräumen.** Bugfix an bestehendem Feature, Doku-Korrektur, CI-/Tooling-Update, Refactoring ohne sichtbares Verhalten. *Faustregel:* wenn der Nutzer es nur merkt, weil vorher Kaputtes jetzt geht — Patch. | `0.1.0 → 0.1.1` |

### Zuordnung zu Roadmap-Phasen

Standard-Zuordnung der Vorlage. Pro Projekt anpassbar — Schema bleibt gleich.

| Roadmap-Phase                                | Ziel-Version am Phasen-Ende | Zwischen-Releases während der Phase |
| -------------------------------------------- | --------------------------- | ----------------------------------- |
| [Phase 1](../roadmap/PHASE1.md)              | `0.1.0`                     | keine — Phase 1 mündet direkt in `0.1.0` |
| [Phase 2](../roadmap/PHASE2.md)              | `1.0.0`                     | `0.1.1`, `0.1.2`, `0.1.3`, …        |
| [Phase 3](../roadmap/PHASE3.md)              | offen                       | `1.0.1`, `1.0.2`, …                 |

Wichtig: Die Patch-Stelle zählt **nur** hoch, wenn auch wirklich released wird — nicht bei jedem in DEV hinzugefügten Feature. Ein Patch-Release bündelt typischerweise mehrere DEV-Features, die zusammen einen stabilen Funktionsblock ergeben.

### Breaking Changes vor 1.0.0

Solange `MAJOR=0`, dürfen Minor-Sprünge brechen (klassischer SemVer-Pre-1.0). Voraussetzung: jeder Breaking Change steht in den Release-Notes im Header mit dem Tag `⚠ Breaking`. Damit ist es ehrlich kommuniziert, ohne den Major künstlich hochzudrehen.

Ab `1.0.0` gilt strenges SemVer — Breaking Changes erzwingen dann einen Major-Sprung, auch innerhalb einer Phase.

---

## Ablauf: vom DEV-Stand zum Release

```text
DEV (main) ──► Code-Review der geänderten Dateien ──► Fixes ──► Release-Notes ──► Git-Tag ──► RELEASES.md / CLAUDE.md aktualisieren
```

### Schritt für Schritt

1. **Stand stabil?** — Die User entscheidet, dass der aktuelle DEV-Stand reif für ein Release ist.
2. **Versionsnummer festlegen** — anhand der Schema-Tabelle oben (Patch / Minor / Major).
3. **Diff gegen letzte Version ermitteln:**

   ```bash
   git diff --name-only v<vorherige-version>..HEAD
   ```

   Diese Datei-Liste ist der Scope des Release-Reviews.
4. **Release-Code-Review starten** — Prompt aus [REVIEW_TEMPLATE.md](./REVIEW_TEMPLATE.md) bauen, Dateien aus Schritt 3 als Lese-Liste eintragen.
5. **Befunde abarbeiten** — Bugs und kritische Punkte fixen, bewusst offen gelassene Punkte in passende `code-review/OFFEN_<BEREICH>.md` eintragen.
6. **Release-Notes anlegen** — neue Datei `docs/release/v<MAJOR>.<MINOR>.<PATCH>.md` aus [TEMPLATE.md](./TEMPLATE.md).
7. **Indizes aktualisieren:**
   - [RELEASES.md](./RELEASES.md) — neuer Tabellen-Eintrag oben.
   - [CLAUDE.md](../../CLAUDE.md) — `workbench.current_version` im Frontmatter setzen.
   - [docs/CHANGELOG.md](../CHANGELOG.md) — Header über dem zugehörigen Eintrag um Versions-Tag ergänzen: `## YYYY-MM-DD — v0.1.1 — <Titel>`.
8. **Git-Tag setzen + pushen:**

   ```bash
   git tag -a v<MAJOR>.<MINOR>.<PATCH> -m "{{PROJEKT_NAME}} v<MAJOR>.<MINOR>.<PATCH>"
   git push origin v<MAJOR>.<MINOR>.<PATCH>
   ```

9. **GitHub-Release-Objekt anlegen** — der Tag aus Schritt 8 ist nur unter `/tags` sichtbar, nicht im `/releases`-Bereich. Das Release ist ein separates Objekt mit Title + Body, das aus den Release-Notes gespeist wird:

   ```bash
   gh release create v<MAJOR>.<MINOR>.<PATCH> \
     --title "{{PROJEKT_NAME}} v<MAJOR>.<MINOR>.<PATCH> - <Titel aus Release-Notes>" \
     --notes-file docs/release/v<MAJOR>.<MINOR>.<PATCH>.md
   ```

   Erfordert die `gh` CLI (mindestens authentifiziert auf das Repo). Bei Pre-Release-Charakter (Alpha/Beta-Tag, RC-Stand) `--prerelease` ergänzen — sonst läuft das Release als reguläre, publizierte Version.

10. **Windows-Build erzeugen und als Release-Asset anhängen** — sonst hat das `/releases`-Fenster keine herunterladbare `.exe`/`.zip`:

    ```bash
    npm run make                                    # Electron-Forge: Squirrel-Setup.exe + win32-zip nach out/make/
    gh release upload v<MAJOR>.<MINOR>.<PATCH> \
      "out/make/squirrel.windows/x64/{{PROJEKT_NAME}}-<MAJOR>.<MINOR>.<PATCH> Setup.exe" \
      "out/make/zip/win32/x64/{{PROJEKT_NAME}}-win32-x64-<MAJOR>.<MINOR>.<PATCH>.zip"
    ```

    Die Pfade folgen aus `forge.config.ts` (Maker: `MakerSquirrel` + `MakerZIP(['win32'])`); bei abweichenden Makern entsprechend anpassen. Pre-Check: `npm run lint && npm run typecheck && npm test` muss bereits aus Schritt 8 grün sein — keine extra Test-Runde fürs Packaging.

---

## Was ein Release-Review NICHT ist

- **Kein normaler Bereichs-Review** wie in `docs/code-review/TEMPLATE.md`. Der Bereichs-Review prüft *einen Bereich* (DB, Core, UI …) — der Release-Review prüft *alle Änderungen seit der letzten Version*, querbeet.
- **Kein Refactoring-Anlass.** Befunde, die nicht release-blockierend sind, gehen in die jeweilige `code-review/OFFEN_<BEREICH>.md` und werden in einer späteren Season behandelt.
- **Kein Feature-Review.** „Ist dieses Feature sinnvoll?" gehört in die Roadmap-Diskussion vor der Implementierung, nicht ins Release-Review.

---

## Hot-Fix außerhalb der Reihe

Wenn ein bereits releaster Stand einen kritischen Bug zeigt:

1. Branch `hotfix/v<vorherige-version>` von dem Tag, der gefixt werden soll.
2. Fix einbauen, gezielter Mini-Review (nur die Hotfix-Dateien).
3. Patch-Version hochzählen (z.B. `0.1.1 → 0.1.2`), normaler Release-Ablauf ab Schritt 6.
4. Den Hotfix-Commit zurück nach `main` mergen.
