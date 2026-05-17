# Markdown Rules (TakumiDeck)

Mandatory formatting rules for **all** `.md` files in the project.
Goal: consistent appearance, clean git diffs, fast parsing by the agent.

When creating or editing a markdown file: work through these rules as a checklist.

---

## 1. File Names

- `SCREAMING_SNAKE_CASE.md` for documentation files (e.g. `FEATURES.md`, `roadmap/PHASE2.md`).
- Exceptions: `README.md`, `CLAUDE.md` (convention).
- Code review files: `code-review/OFFEN_<BEREICH>.md` – area instead of sequential number. Append sub-area with another `_` if needed.

## 2. Headings

- **ATX style only** (`#`, `##`, `###`). No setext (underline style).
- Exactly one blank line **before** and **after** every heading.
- `#` = file title, **once per file** at the very top.
- Don't skip hierarchy levels (`##` → `###`, not `##` → `####`).

## 3. Lists

- Unordered lists: **`-`** (hyphen). Never `*` or `+`.
- Ordered lists: `1.`, `2.`, `3.` …
- Sub-list indentation: **2 spaces** (not 4, no tabs).
- One blank line before the first list item; don't attach lists directly to a heading.

## 4. Code

- Fenced code blocks **always** with a language tag: ` ```python `, ` ```sql `, ` ```bash `, ` ```ts `.
- ASCII art / tree diagrams / plain text examples: use ` ```text ` (kein leeres Fence — fängt MD040 sonst).
- Inline code with backticks for: file names, paths, function names, classes, variables, CLI commands, column names.

## 5. Tables

- Standard pipe syntax: `| Column | Column |`, separator line `| --- | --- |`.
- Left-alignment (default) — no `:---:` / `---:` variants.
- One blank line before and after the table.

## 6. Emphasis

- `**bold**` for **important items**, feature names, UI menu items.
- `*italic*` **sparingly** for emphasis on individual terms.
- No `__bold__`, no `_italic_` (underscore variants).
- Never bold entire paragraphs.

## 7. Emojis (closed set)

**Only these five emojis are allowed. No extension without discussion.**

| Emoji | Meaning                       | Usage                        |
| ----- | ----------------------------- | ---------------------------- |
| ✅     | done / active                 | FEATURES, ROADMAP, CHANGELOG |
| 🟡    | partial / in development      | FEATURES, ROADMAP            |
| ⛔     | open / planned                | FEATURES, ROADMAP            |
| ⚠️    | warning / important note      | ROADMAP, CODE_REVIEW         |
| 💡    | idea / improvement suggestion | CODE_REVIEW                  |

- **No further decorative emoji usage** (no 🚀, 🎉, 📝 etc.).
- Primarily in status/roadmap/changelog/review files. README, ARCHITEKTUR, ENTSCHEIDUNGEN stay emoji-free, except for status markers.

## 8. Special Characters

- **Arrow `→`** (U+2192) for cross-references and directions:
  - `→ docs/FEATURES.md` (file reference)
  - `⛔ → ✅` (status change)
- **Em-dash `—`** (U+2014) as separator in headings/CHANGELOG entries:
  - `## 2026-04-19 — Entry title`
- **No `->"`**, no `--`, no `=>`.

## 9. Separators

- `---` (three hyphens) as horizontal rule between major sections.
- One blank line before and after.
- Use sparingly — not after every heading.

## 10. Links

- Markdown syntax: `[Display text](./docs/FILE.md)`.
- **Always relative**, never absolute paths:
  - **Sibling or child** (same directory or below): with `./` prefix.
    - ✅ `[Features](./docs/FEATURES.md)`
    - ⛔ `[Features](docs/FEATURES.md)`
    - ⛔ `[Features](/docs/FEATURES.md)`
  - **Parent directory** (going up): `../` without leading `./`.
    - ✅ `[CLAUDE.md](../CLAUDE.md)` from inside `docs/`
    - ✅ `[CLAUDE.md](../../CLAUDE.md)` from inside `docs/release/`
- External links: full URL `https://…`.
- Code line references: `[file.ext:42](./module/file.ext)` (no line anchor – not rendered, but keep the convention).

## 11. Frontmatter

- **No** YAML frontmatter (`---\n...\n---` at file start) for documentation files.
- **Exception**: `CLAUDE.md` uses YAML frontmatter for tool configuration (TakumiDeck app reads `workbench:`-namespace). This is the only allowed frontmatter location.
- **Exception**: `.claude/rules/*.md` files use YAML frontmatter for path-glob configuration (Claude Code internal).
- Metadata in regular doc files goes in flowing text or tables.

## 12. Line Length

- **No hard wrap.** Write paragraphs as one flowing line.
- Reason: git diffs stay clean on word changes, renderers wrap automatically.
- Exception: lists, tables, code — natural line break per entry there.

## 13. CHANGELOG Format

- New entry **at the top** of `docs/CHANGELOG.md`.
- Heading: `## YYYY-MM-DD — Title` (em-dash `—`, no hyphens or dashes).
- Sub-sections when needed as `###`.
- **No** "changed files" lists (git history provides that).

## 14. Blockquotes / Callouts

- Standard blockquote `> …` only for actual quotes.
- **No** GitHub callout syntax (`> [!NOTE]`, `> [!WARNING]`) — use ⚠️ emoji + bold text instead.

## 15. Blank Lines & Whitespace

- File ends with **exactly one** blank line (newline at end).
- No double blank lines between sections (one is enough).
- No trailing spaces at line end.

---

## Quick Checklist Before Saving

1. File name in `SCREAMING_SNAKE_CASE.md`?
2. Only one `#` H1 at the top, hierarchy clean?
3. Lists with `-`, 2-space indentation?
4. Code fences with language tag?
5. Only emojis from the closed set (✅ 🟡 ⛔ ⚠️ 💡)?
6. Internal links with `./` prefix?
7. No frontmatter, no hard wrap?
8. Em-dash `—` instead of `-` in date headings?
9. File ends with exactly one newline?
