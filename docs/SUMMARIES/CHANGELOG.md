---
source: docs/CHANGELOG.md
source_hash: d68cfc3fe96d48ec4b751b87eee9f4d22dff151d1114a38fa9774dc588291a6e
summarized_at: 2026-05-17T13:33:29Z
---

# CHANGELOG-Kompaktfassung

Verlauf abgeschlossener Sessions, neuster zuerst. Jeder Eintrag listet Nutzer-Mehrwert + gewaehlte Variante, ohne Datei-Listen (uebernimmt git).

## Aktuelle Aktivitaet (Phase 2, v0.2.0)

- **Doku- und Release-Workflow:** Templates aus Vorlage ins Repo eingespielt, `docs/release/`-Block angelegt, CLAUDE.md-Frontmatter um `current_version` und vier Trigger-Phrasen (`fix`/`release_artifacts`/`tag_push`/`release`) erweitert.
- **Season 21–23 (Docs-Sync-Kette):** sechste Session-Art „Docs-Sync" startet Komprimierungs-Prompts mit SHA-256-Stale-Check (`source_hash` im Frontmatter). NewSessionModal bekommt zweiten Block „Kontext laden" fuer On-Demand-Files. Templates deklarieren Tokens im YAML-Frontmatter (`auto`/`input`-Discriminator) — unbekannte Tokens bleiben Literal, kein Warnblock mehr.
- **Stats- und Token-Polish (Season 12–20):** acht Stats-Cards mit Scope/Range-Toggle, GitHub-Heatmap (Quartile, eigener 30W/52W-Toggle), Modelle-View mit Cache-Hit-Spalte, Easter-Egg-Werk-Vergleich, konfigurierbares Top-N pro Auto-Variable.
- **Reset-Schedule und Session-Block (Season 16):** Wochen-Bars rechnen ab letztem Reset statt rolling; 5h-Bar laeuft als echter Anthropic-Session-Block (User-Trigger nach Live-Test).
- **Boot-Robustheit (Season 15/17/18):** JSONL-Polling-Ring + UUID-Pfad-Mapping, Boot-One-Shot-Backfill mit MetaKv-Flag, Screenshot-Retention, First-Start-Workspace-Wizard.

## Wiederkehrende Muster

- **Variants vor Code:** Jeder nicht-triviale Sprint praesentiert A/B/C mit Effort-Tabelle; User-Empfehlungen werden fast immer 1:1 uebernommen.
- **Driver-Injection:** Repos und Pure-Helper (Retention, Streak, Heatmap, Resolver) sind testbar ohne Electron/SQLite — InMemory-Driver parallel zu Sqlite-Driver.
- **Pure-Logik in `src/shared/`:** Status, Format, Prompts wandern in eigene Module mit eigenen Tests; UI bleibt JSX-Layer.
- **Migrationen sparsam:** Schema-Drift wird oft als „Backward-Compat-Summe + neue Spalten" geloest (siehe `tokens_in` + Cache-Anteile), nicht als Drop-and-Rebuild.
- **Side-Effect-Guards:** StrictMode-Doppel-Mount durch `useRef`-Guards in jedem IPC-feuernden Effect.

## Phase 1 (v0.1) abgeschlossen 2026-05-12

Foundation → Sessions → Workspace → Token-Dashboard → Templates/Season-Tracker → Editor+Git → App-Chrome → Polish → Pre-Release-QA → Code-Review-Pass. Electron 33→41 Security-Bump + Vite 5→6, CSP doppelt verankert, default-deny Permission-Handler mit Clipboard-Whitelist.
