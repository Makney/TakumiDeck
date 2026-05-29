---
workbench:
  project_name: TakumiDeck
  default_model: claude-opus-4-8
  current_phase_file: docs/roadmap/PHASE2.md
  current_version: "0.3.2"
  trigger_phrases:
    docs_update: "ist korrekt umgesetzt"
    commit: "commit"
    release: "release"
    fix: "fix it"
    release_artifacts: "release artifacts"
    tag_push: "tag & push"
  on_demand_files:
    - path: docs/CODING_RULES.md
      trigger: "Read for every implementation or refactoring task"
      auto_inject: false
    - path: docs/MARKDOWN_RULES.md
      trigger: "Read whenever creating or editing any .md file"
      auto_inject: false
    - path: docs/roadmap/PHASE1.md
      trigger: "Read for Phase 1 features only"
      auto_inject: false
    - path: docs/roadmap/PHASE2.md
      trigger: "Read for Phase 2 features only"
      auto_inject: false
    - path: docs/roadmap/PHASE3.md
      trigger: "Read for Phase 3 features only"
      auto_inject: false
    - path: docs/GLOSSAR.md
      trigger: "Read when a domain term is unclear"
      auto_inject: false
    - path: docs/TECH_SCHULDEN.md
      trigger: "Read when refactoring or touching known-debt areas"
      auto_inject: false
    - path: docs/DEV_SETUP.md
      trigger: "Read when setting up the environment or debugging installation issues"
      auto_inject: false
    - path: docs/SEASON_LOG.md
      trigger: "Read at the start of a new season"
      auto_inject: false
    - path: docs/TAKUMIDECK_ARCHITEKTUR.md
      trigger: "Read when designing or implementing core architecture features"
      auto_inject: false
    - path: docs/release/VERSIONIERUNG.md
      trigger: "Read before any release-related work (versioning, release-review, tagging)"
      auto_inject: false
    - path: docs/release/RELEASES.md
      trigger: "Read when the user asks about released versions or release history"
      auto_inject: false
    - path: docs/release/REVIEW_TEMPLATE.md
      trigger: "Read when preparing a release code-review across all files changed since the last version"
      auto_inject: false
    - path: docs/COMMANDS.md
      trigger: "Read before running any shell command, npm script, or CLI tool in this project"
      auto_inject: false
---

# TakumiDeck – Agent Context

You are a Senior TypeScript Developer mit Schwerpunkt Electron-Desktop-Apps und Terminal-UI.

Persönliches Multi-Session-Management-Tool für Claude Code mit Token-Dashboard, Templates und Season-Tracker.
Stack: TypeScript · Electron · React · SQLite (better-sqlite3) · xterm.js · CodeMirror 6. Target platform: Windows 11.
Git repo: https://github.com/Makney/TakumiDeck.git

## Working Rules (mandatory)

1. **Comment language: Deutsch** – Applies to code comments, docstrings, and commit messages.
2. **Variants before architecture decisions** – For non-trivial scope, first present variants A/B/C with effort table + clear recommendation. User decides.
   - Describe variants in **plain language** — no variable names, function signatures, or code snippets in the proposal.
   - Explain *what* each approach does differently and what the tradeoff is.
   - Code details only after the user picks a variant.
3. **Doc updates only on explicit signal** – Only when the user says the configured trigger phrase (see `workbench.trigger_phrases.docs_update` in frontmatter), then immediately and without prompting:
   - `docs/CHANGELOG.md` – New section at the top (date · title · what works now). No "changed files" lists – git history provides that.
   - `docs/FEATURES.md` – ⛔/🟡 → ✅
   - `docs/roadmap/PHASE<N>.md` – Mark completed feature as ✅ only, do not modify the roadmap
   - `docs/ENTSCHEIDUNGEN.md` – For architecture decisions, add the *why*
   - `docs/TECH_SCHULDEN.md` – If a conscious shortcut was taken: add entry with risk + resolution.
   - `docs/SEASON_LOG.md` – Only at **end of season**: add retrospective entry (goal · result · what went well · blockers · hints for next season).
4. **Test scope per season** – Tests cover only the **newly added or changed feature**. No full-application regression runs unless explicitly requested.
   - Write targeted tests that verify the specific behavior introduced in this season.
   - If an existing test breaks due to the change, fix it — but don't expand coverage to unrelated areas.
5. **GitHub commit on explicit signal** – Only when the user says the configured trigger phrase (see `workbench.trigger_phrases.commit` in frontmatter), then immediately and without prompting:
   1. Stage only changed project files — never `.env`, secrets, or unrelated files.
   2. Commit with message format: `TakumiDeck: <short description in Deutsch>`.
   3. `git push`.
6. **Pre-commit hook must be green** – Before committing, ensure linting and tests pass locally. If any check fails: fix the problem first, then commit.

## Current Status

Phase 1 (v0.1) abgeschlossen. Phase 2 (v1.0) aktiv in Entwicklung.
```
→ [docs/roadmap/PHASE2.md](./docs/roadmap/PHASE2.md) — Offene Features der aktuellen Phase
→ [docs/FEATURES.md](./docs/FEATURES.md)        — Feature status matrix (✅/🟡/⛔)
→ [docs/CHANGELOG.md](./docs/CHANGELOG.md)      — Recently built features
→ [docs/TAKUMIDECK_ARCHITEKTUR.md](./docs/TAKUMIDECK_ARCHITEKTUR.md) — Master architecture reference
```