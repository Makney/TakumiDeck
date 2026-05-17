---
variables:
  PROJEKT_NAME:              { auto: project.name }
  DATUM:                     { auto: today }
  CURRENT_VERSION:           { auto: claude_md.workbench.current_version }
  FIX_TRIGGER:               { auto: claude_md.workbench.trigger_phrases.fix }
  RELEASE_ARTIFACTS_TRIGGER: { auto: claude_md.workbench.trigger_phrases.release_artifacts }
  TAG_PUSH_TRIGGER:          { auto: claude_md.workbench.trigger_phrases.tag_push }
  ZIEL_VERSION:              { input: text,     label: "Ziel-Version (z.B. 0.1.1)",          required: true }
  VORHERIGE_VERSION:         { input: text,     label: "Vorherige Version (Tag ohne v-Prefix)", required: true }
  RELEASE_TYP:               { input: text,     label: "Typ (Patch / Minor / Major / Hotfix)", required: true }
  HINWEISE:                  { input: textarea, label: "Hinweise für diesen Release (optional)" }
---

# Release-Start-Template

Dieses Template startet einen **Release-Lauf** mit dem Sub-Agent-Pattern. TakumiDeck (App) liest es, befüllt die `{{...}}`-Variablen und sendet das Ergebnis ans aktive PTY via Bracketed Paste.

**Konzept:** Der Haupt-Agent (der diesen Prompt empfängt) ist Orchestrator und mir gegenüber berichtspflichtig. Den eigentlichen Release-Code-Review machen Sub-Agents — pro Bereich einer, parallel — gefüttert mit dem Bauplan aus [docs/release/REVIEW_TEMPLATE.md](../release/REVIEW_TEMPLATE.md). Der Haupt-Agent konsolidiert, fragt mich was zu tun ist, schreibt Release-Notes, aktualisiert Indizes und tagt — alles auf explizites Signal.

**Drei Trigger-Phrasen** steuern den Ablauf (konkrete Worte stehen in `CLAUDE.md` `workbench.trigger_phrases`, TakumiDeck setzt sie beim Paste ein):

- `fix` (`{{FIX_TRIGGER}}`) — Fixes für die per Phase 3 freigegebenen Befunde anwenden
- `release_artifacts` (`{{RELEASE_ARTIFACTS_TRIGGER}}`) — Release-Notes-Datei + RELEASES.md + CLAUDE.md-Frontmatter + CHANGELOG-Header schreiben
- `tag_push` (`{{TAG_PUSH_TRIGGER}}`) — `git tag -a` + `git push origin <tag>` ausführen

**Auto-Variablen** (von TakumiDeck befüllt):

- `{{PROJEKT_NAME}}` — aus CLAUDE.md (`workbench.project_name`)
- `{{DATUM}}` — heute (`YYYY-MM-DD`)
- `{{CURRENT_VERSION}}` — aus CLAUDE.md (`workbench.current_version`)
- `{{FIX_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.fix`)
- `{{RELEASE_ARTIFACTS_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.release_artifacts`)
- `{{TAG_PUSH_TRIGGER}}` — aus CLAUDE.md (`workbench.trigger_phrases.tag_push`)

**User-Variablen** (im Formular einzugeben):

- `{{ZIEL_VERSION}}` — Pflicht, neue Version (z.B. `0.1.1`, `1.0.0`)
- `{{VORHERIGE_VERSION}}` — Pflicht, Vorgänger-Tag ohne `v`-Prefix (z.B. `0.1.0`)
- `{{RELEASE_TYP}}` — Pflicht, einer von `Patch` / `Minor` / `Major` / `Hotfix` (Major = Phasen-Milestone oder, ab 1.0, Breaking Change; Schema-Definition → [docs/release/VERSIONIERUNG.md](../release/VERSIONIERUNG.md))
- `{{HINWEISE}}` — Optional, z.B. „nur Doku-Patch", „bekannte Auflage X bleibt offen"

---

## Vorlage (Inhalt)

```text
Release-Lauf — {{PROJEKT_NAME}} v{{ZIEL_VERSION}}
Datum: {{DATUM}} · aktueller Stand: v{{CURRENT_VERSION}} · Vorgänger: v{{VORHERIGE_VERSION}} · Typ: {{RELEASE_TYP}}

Du bist der Orchestrator. Den Code-Review führst du NICHT selbst durch.
Du startest pro Bereich einen Sub-Agent. Du schreibst die Release-Artefakte
selbst, aber jeden veränderlichen Schritt (Fixes, Notes, Tag, Push) erst
nach meinem expliziten Signal.

Pflicht-Lektüre vor dem Start
- docs/release/VERSIONIERUNG.md   (Schema, Ablauf, Hot-Fix-Regeln)
- docs/release/REVIEW_TEMPLATE.md (Bauplan für den Release-Review)
- docs/release/TEMPLATE.md        (Vorlage für die Release-Notes-Datei)

Hinweise für diesen Release (optional)
{{HINWEISE}}

Ablauf, dem du folgst

Phase 1 — Diff ermitteln und gruppieren
1. Lies die drei Pflicht-Dateien oben.
2. Lauf:  git diff --name-only v{{VORHERIGE_VERSION}}..HEAD
   Falls v{{VORHERIGE_VERSION}} kein gültiger Tag ist: melde das und warte auf Korrektur.
3. Gruppiere die geänderten Dateien nach Bereich (z.B. DB, Core, UI, API, Doku).
   Wenn die Gruppierung mehrdeutig ist: zeig sie mir und frag.
4. Liste pro Bereich die zugehörige docs/code-review/OFFEN_<BEREICH>.md auf.
   Wenn eine OFFEN-Datei fehlt: frag mich, ob du sie aus
   docs/code-review/OFFEN_TEMPLATE.md anlegen sollst.

Phase 2 — Bereichs-Reviews durch Sub-Agents
5. Starte pro Bereich EINEN Sub-Agent (general-purpose oder Explore). Sub-Agent-
   Prompt baust du aus dem Template-Prompt in docs/release/REVIEW_TEMPLATE.md,
   gefüllt mit:
   - der Bereichs-Datei-Liste aus Phase 1
   - der zugehörigen docs/code-review/OFFEN_<BEREICH>.md
   - der Vorgänger-Version v{{VORHERIGE_VERSION}}
   Wichtig: Sub-Agents sind read-only. Im Prompt explizit untersagen:
   keine Edits, keine Writes, kein Refactoring.
6. Wenn Bereiche unabhängig sind: Sub-Agents PARALLEL starten (mehrere Agent-
   Aufrufe in einer einzigen Antwort).
7. Sammle die Berichte ein. Konsolidiere zu EINEM Report:
   - gegliedert nach Bereich
   - innerhalb jedes Bereichs nach Schwere (Bug → Sicherheit → Datenverlust →
     Regression → Warnung → Verbesserung → Verbesserung-Doku)
   - jeder Befund mit Datei:Zeile, 1-Satz-Empfehlung und Markierung
     „release-blockierend: ja/nein" gemäß Tabelle in REVIEW_TEMPLATE.md
   - markiere für jeden Befund: NEU vs. (versehentlich) Wiederholung aus OFFEN
   - am Ende: Empfehlung „Release freigeben / mit Auflagen / nicht freigeben"

Phase 3 — Entscheidung einholen
8. Berichte mir den konsolidierten Report.
9. Frag mich pro Befund (oder pro Befund-Gruppe) was passieren soll:
   - „{{FIX_TRIGGER}}" — sofort fixen (typisch für release-blockierende Befunde)
   - „OFFEN"          — in die zugehörige OFFEN_<BEREICH>.md aufnehmen
   - „verschieben"    — in die nächste Roadmap-Phase eintragen
   - „verwerfen"      — kein Befund, ignorieren
10. Erst nach meinen Antworten: Fixes durchführen, OFFEN-Einträge schreiben,
    Roadmap-Einträge ergänzen.

Phase 4 — Release-Artefakte (auf mein „{{RELEASE_ARTIFACTS_TRIGGER}}"-Signal)
11. Lege docs/release/v{{ZIEL_VERSION}}.md aus docs/release/TEMPLATE.md an.
    Fülle: Datum, Typ, Phase, Vorgänger, Was jetzt geht, Enthaltene Features,
    Code-Review-Ergebnis (Zahlen aus Phase 2/3), Bekannte Einschränkungen,
    Upgrade-Hinweise, Architektur-Entscheidungen.
    Bei Pre-1.0-Releases mit Breaking Changes (MAJOR=0 UND nicht abwärtskompatibel):
    den `⚠ Breaking`-Banner über dem H1 stehen lassen und einen Satz zur Auswirkung
    eintragen. Andernfalls: Banner samt HTML-Kommentar entfernen. Schema-Hintergrund
    → docs/release/VERSIONIERUNG.md, Abschnitt „Breaking Changes vor 1.0.0".
12. Aktualisiere docs/release/RELEASES.md (neue Tabellen-Zeile oben).
13. Aktualisiere CLAUDE.md frontmatter:  workbench.current_version: "{{ZIEL_VERSION}}"
14. Ergänze in docs/CHANGELOG.md den Header über dem zugehörigen Eintrag um den
    Versions-Tag:  ## YYYY-MM-DD — v{{ZIEL_VERSION}} — <Titel>
15. Zeig mir den Diff der vier Doku-Änderungen und frag, ob ich einverstanden bin.

Phase 5 — Tag + Push (auf mein „{{TAG_PUSH_TRIGGER}}"-Signal)
16. Pre-Check: linting + targeted tests sind grün (siehe CLAUDE.md Regel 6).
17. Lauf:  git tag -a v{{ZIEL_VERSION}} -m "{{PROJEKT_NAME}} v{{ZIEL_VERSION}}"
18. Lauf:  git push origin v{{ZIEL_VERSION}}
19. Schluss-Bilanz: Tag-URL (falls gh verfügbar), Liste der entstandenen Dateien.

Was du NICHT tust
- Keinen Befund eigenmächtig fixen.
- Keine Doku-Datei ungefragt anlegen oder ändern (außer den unter Phase 4 genannten
  Release-Artefakten — und auch die erst nach „{{RELEASE_ARTIFACTS_TRIGGER}}").
- Keinen git-Tag setzen oder pushen, bevor ich „{{TAG_PUSH_TRIGGER}}" gesagt habe.
- Keine destruktiven git-Operationen (reset --hard, push --force, branch -D).
- Keine .env-/Secret-Dateien stagen.
```

---

## Warum Sub-Agents statt der Haupt-Agent direkt?

- **Kontext-Isolation** — der Haupt-Agent behält Platz für die Konsolidierung, die Release-Notes-Erstellung und die Indizes-Updates. Detail-Lektüre der geänderten Dateien fällt im Sub-Agent an, nicht im Hauptkontext.
- **Parallelität** — unabhängige Bereiche laufen gleichzeitig. Bei großen Diffs (> ~20 Dateien) halbiert das die Wartezeit oft mehr als nur das.
- **Berichtspflicht** — du siehst denselben konsolidierten Report wie der Haupt-Agent und entscheidest pro Befund. Kein automatisches „naja, ich hab das gleich mal gefixt".

## Wann kein Release-Lauf?

- **Hotfix außerhalb der Reihe** ist trotzdem ein Release-Lauf — `{{RELEASE_TYP}} = Hotfix`, `{{VORHERIGE_VERSION}} =` der gefixte Tag. Diff ist klein, Sub-Agent-Anzahl evtl. nur 1.
- **Reines DEV-Feature** → kein Release-Lauf. Nur eine Season aus [SEASON_PROMPT.md](./SEASON_PROMPT.md). Versionsnummer zählt erst hoch, wenn du wirklich released wird (siehe [VERSIONIERUNG.md](../release/VERSIONIERUNG.md) Kernprinzip 2).
- **Doku-Korrektur** → kein Release. CHANGELOG-Eintrag reicht.

## Was wenn der Diff riesig ist?

`docs/release/REVIEW_TEMPLATE.md` empfiehlt ab ~20 Dateien Aufteilung nach Bereichen. Das deckt sich mit dem Sub-Agent-Pattern hier — der Haupt-Agent gruppiert in Phase 1 und startet dann in Phase 2 entsprechend viele Sub-Agents. Bei sehr breitem Diff: vorher mit dem User abstimmen, ob ein Zwischen-Release sinnvoller ist (z.B. erst `0.1.1` für DB-Bereich, dann `0.1.2` für UI-Bereich).
