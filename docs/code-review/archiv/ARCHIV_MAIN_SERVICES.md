# Code-Review · Main-Services · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_MAIN_SERVICES.md`](../OFFEN_MAIN_SERVICES.md) — Status **Behoben** oder **Gegenstandslos**.

---

## ESLint-Vor-Pass-Befunde (2026-05-10)

### ✅ parser.ts catch-Variable `e` ungenutzt — BEHOBEN 2026-05-11

- `src/main/jsonl/parser.ts:69` · Kategorie: **Warnung**
- **Beschreibung:** Catch-Block deklarierte `e`, nutzte es aber nicht. ESLint `@typescript-eslint/no-unused-vars` warnte, weil das Pattern `^_` für bewusst-ignoriert nicht erfüllt war.
- **Auflösung (2026-05-11):** Bereich-3-Review hat verifiziert, dass die Fail-Soft-Strategie korrekt ist (Warnings werden zum Watcher propagiert und geloggt), die Error-Detail-Message ging aber verloren. Fix: `e instanceof Error ? e.message : String(e)` wird jetzt in den Warning-Text aufgenommen; `eslint-disable`-Zeile + FIXME-Kommentar entfernt.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_MAIN_SERVICES.md`](../OFFEN_MAIN_SERVICES.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### `extractTemplateBody` strippt YAML-Frontmatter nicht im Fallback-Pfad

- `src/renderer/components/templateBody.ts:28-77` · Kategorie: **Verbesserung**
- **Beschreibung:** Season-23-Templates haben YAML-Frontmatter (`variables:`-Map) am Datei-Anfang plus einen `## Vorlage`-Heading mit Code-Fence. `extractTemplateBody` findet den `## Vorlage`-Block und gibt nur dessen Fence-Inhalt zurück — das Frontmatter landet *nicht* im Prompt. Wenn ein User aber ein Template *mit* Frontmatter und *ohne* `## Vorlage`-Heading anlegt, fällt der Extraktor auf „voller Content" zurück (Fallback-Path bei Zeile 76) und der YAML-Block fließt in den Prompt mit. Alle in v0.2.0 ausgelieferten Templates (BUG_REPORT/CODE_REVIEW_START/PROJEKT_KICKOFF/RELEASE_START/SEASON_PROMPT plus `createTemplateStub`-Output) haben beides, also nicht in der Praxis exponiert.
- **Begründung:** Fix wäre einzeilig (vor dem Heading-Match einen `stripFrontmatter`-Call aus `src/shared/docs-sync.ts` einbauen — der Helper existiert seit Season 22). Aber: der Body-Extraktor lebt im Renderer und `docs-sync.ts` im Shared-Layer, der Import ist neutral. Bewusst aus Season-23-Scope rausgehalten, damit der Frontmatter-Schema-Pfad fokussiert bleibt.
- **Trigger:** beim nächsten Touch von `templateBody.ts` oder wenn ein User-Template ohne `## Vorlage`-Heading auftaucht und der YAML-Block im Prompt landet — dann `stripFrontmatter` vor dem Heading-Scan einsetzen.
- **Behoben:** 2026-06-01 · Verbesserung · `stripFrontmatter` (aus `@shared/docs-sync`) am Anfang von `extractTemplateBody` eingezogen; Fallback gibt jetzt die gestrippte Variante zurück statt rohen Content. Happy-Path (Fence unter `## Vorlage`) unbeeinflusst. Zwei gezielte Tests in `template-body.test.ts` (Frontmatter-Strip im Fallback + Frontmatter-über-Vorlage-Happy-Path).

---

### `project-watcher.ts`-Kommentar verspricht `depth=5`, Code setzt `depth=8`

- `src/main/fs/project-watcher.ts:106-107` · Kategorie: **Verbesserung-Doku**
- **Beschreibung:** Der Inline-Kommentar sagt „Tiefen-Limit analog zum fs:list-tree-Scanner (default 5)", der konkrete `depth`-Wert ist aber `8`. Irreführend für den nächsten Wartungs-Touch.
- **Begründung:** Wert oder Kommentar angleichen reicht — keine Verhaltensänderung. Heute kein UX-Defekt.
- **Trigger:** nächste Änderung am Watcher (z.B. wenn die Skip-Liste erweitert wird).
- **Behoben:** 2026-06-01 · Verbess.-Doku · Kommentar an den tatsächlichen Wert angeglichen: `depth: 8` ist bewusst tiefer als der list-tree-Default (5), nicht „analog". Kein Verhaltens-Change.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_MAIN_SERVICES.md`](../OFFEN_MAIN_SERVICES.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### Shallow-Merge in SettingsStore.read() übersieht neue Keys in geschachtelten Objects

- `src/main/settings/store.ts:30` · Kategorie: **Warnung**
- **Beschreibung:** `{ ...buildDefaultSettings(), ...parsed }` ist ein flacher Spread. Wenn ein User aus Sprint 1 nur ein Subset von `model_limits` in der `settings.json` hat (z.B. `{ 'claude-sonnet-4-5': 200000 }`), und Sprint 8 hat `claude-opus-4-7` zu den Defaults hinzugefügt, fehlt der neue Key im gemergten Result — das ganze User-Object überschreibt das Default-Object. Gleiches gilt für `shortcuts` und `token_warning_thresholds`.
- **Begründung:** Verhaltensänderung mit Tradeoff (User-Override gewinnt explizit vs. Auto-Migration neuer Default-Keys). Verlangt Variants A/B + Entscheidung; nicht im Review-Scope.
- **Trigger:** wenn ein neues Default-Modell hinzukommt und User-Reports auftauchen, dass die Per-Session-Kontext-Bar nicht das erwartete Limit zeigt.
- **Update Release-Review v0.2.0 (2026-05-17):** Oberfläche ist seit v0.1.2 um drei Sub-Objekte gewachsen (`screenshot_retention`, `context_soft_warning` aus Season 8, `template_top_n` aus Season 20), plus zwei neue flache Felder (`workspace_wizard_completed`, `easter_egg_enabled`). Damit gibt es jetzt fünf Sub-Objekte (inkl. `model_limits`, `shortcuts`, `token_warning_thresholds`) plus zwei nicht-Sub-Felder, bei denen ein partieller User-Override defaults verlieren könnte. Drift-Risiko skaliert; Variants-Pass jetzt überfällig.
- **Behoben:** 2026-06-01 · Variante A (Scoped Deep-Merge) · `read()` mergt die fixen Sub-Objekte (`token_warning_thresholds`, `context_soft_warning`, `screenshot_retention`, `template_top_n`) jetzt tief (Inner-Defaults auffüllen, User-Wert gewinnt pro Feld); die offenen Maps `model_limits`/`shortcuts` bleiben bewusst Shallow. Schema-Befund: die fixen Sub-Objekte haben keine zod-`.default()` auf den Inner-Feldern — ein neues Inner-Feld hätte unter Shallow-Merge `read()` für Bestandsuser zum Crash gebracht (nicht nur Key-Verlust). 2 gezielte Tests in `settings-store.test.ts` (partielles Sub-Objekt aufgefüllt + offene Map bleibt Shallow). User-Entscheidung: A.
