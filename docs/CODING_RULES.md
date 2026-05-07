# Coding Rules (TakumiDeck)

All mandatory coding rules in one place — core principles and project-specific conventions.

**Conflict hierarchy:** `CLAUDE.md` > `CODING_RULES.md` > stack standard (e.g. PEP 8 / Prettier / rustfmt).

This file is read **only on demand** (for implementation or refactor tasks), not loaded by default.

---

## Core Principles (mandatory)

### Think First, Then Code

**No assumptions. Raise confusion. Name tradeoffs.**

Before implementing:

- State assumptions explicitly — when in doubt, ask.
- If the task has multiple valid interpretations, present both — don't silently pick one.
- If there is a simpler approach, say so. Push back when it makes sense.
- If something is unclear: stop. Name exactly what is unclear. Ask.

### Simplicity First

**Minimal code that solves the problem. Nothing speculative.**

- No features that were not asked for.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios.
- If 200 lines emerged that could be 50 → rewrite.

Self-check: "Would an experienced developer call this over-engineered?" → Yes = simplify.

### Surgical Changes

**Only touch what is necessary. Only clean up your own mess.**

When editing existing code:

- Don't improve, reformat, or refactor "adjacent" code.
- Don't touch working code.
- Adopt the existing style, even if you'd do it differently.
- Found unused code? Mention it – don't delete it.

Clean up your own changes:

- Remove imports / variables / functions that became orphaned *due to your own changes*.
- Leave previously existing dead code alone, unless explicitly asked.

Test: Every changed line must be directly traceable to the task.

### Goal-Oriented Implementation

**Define success criteria. Loop until verified.**

Translate tasks into verifiable goals:

- "Add validation" → "What is the exact input error case that needs to be caught?"
- "Fix the bug" → "How do I reproduce it, and how do I know it's gone?"

For multi-step tasks, present a short plan upfront:

```
1. [Step] → Verification: [check]
2. [Step] → Verification: [check]
```

Strong success criteria allow autonomous iteration. Weak criteria ("make it work") force clarification questions after failures.

---

## 1. Naming

- Modules / functions / variables: `<stack style: snake_case | camelCase | …>`.
- Classes / types: `<style: PascalCase | …>`.
- Constants: `<style: UPPER_SNAKE_CASE | …>`.
- Private symbols: `<convention: leading underscore | #-prefix | private keyword | …>`.
- Boolean names: prefix `is_`, `has_`, `should_`.

## 2. Imports / Modules

- Block order: 1) stdlib · 2) third-party · 3) project-local (each separated by blank line).
- Within each block: alphabetical.
- **No wildcard imports.**
- Remove unused imports — but only if they became orphaned due to your own changes (→ Surgical Changes).
- Relative imports only within a package, otherwise absolute.

## 3. Type Hints / Typing

- If supported by the stack: public API always annotated, internal helpers as needed.
- Consistency within a function: all parameters **and** return type, or none at all.
- `Any` / `unknown` / `object` only when unavoidable, with a comment explaining why.

## 4. Docstrings & Comments

- Language: **Deutsch** (from CLAUDE.md). Applies to docstrings and inline comments.
- Docstrings only where they add real value:
  - Public functions with non-trivial behavior
  - Complex algorithms
  - Stack/framework specifics beyond the standard
- Simple getters / setters / trivial wrappers need **no** docstring.
- Inline comments: **why**, not **what**. Leave out redundant comments.

## 5. Function & Method Design

- Guideline: ~50 lines per function. No hard limit — if something genuinely needs 80 lines, that's OK. Above 100 lines: consider extracting sub-steps.
- One function does **one thing**. Handlers doing five independent things → split up.
- Parameter count: guideline ≤ 5. Beyond that: consider a data object (but not schematically — → Simplicity First).
- No mutable defaults (language-specific pitfall — check if your stack has this problem).

## 6. Error Handling

- **Only for real scenarios** (→ Simplicity First). No speculative try/catch.
- Catch as specifically as possible. Generic top-level catches only at application boundaries (request handler, worker), then with logging/user feedback.
- Never silent `catch (_) {}` / `except: pass` blocks. If something truly should be ignored, add a comment explaining why.
- Resources (connections, files, locks) via the stack's idiomatic auto-cleanup construct (`with`, `using`, `defer`, RAII …).

## 7. Persistence / Data Access

- For SQL: parameter binding, **never** string concatenation (SQL injection — even in single-user projects, as a habit).
- Transactions explicitly where multiple writes belong together.
- Schema migrations idempotent.
- For network IO: set timeouts, retry logic only where business logic requires it.

## 8. Framework / Stack Specifics

Add specifics of the chosen stack here — e.g. Qt signals/slots, React hook rules, async/await conventions.

- *(Placeholder — fill in per project)*

### 8.1 Accessibility (WCAG 2.1 / EN 301 549 baseline)

Apply to every new interactive widget or component, regardless of stack:

- **Keyboard focus:** Interactive elements (buttons, inputs, custom clickable components) must be reachable via keyboard. Standard framework widgets usually have a sensible default; custom subclasses need an explicit focus policy — otherwise they are keyboard-inaccessible.
- **Decorative elements:** Labels or visuals that carry no interaction need no focus — explicitly set them to no-focus to keep tab order clean.
- **Accessible names:** Every widget relevant to screen readers gets a descriptive accessible name set at creation time (human-readable, not a technical object name). Add an accessible description for role/status information where needed.
- **Focus styles:** A global focus style covers standard widgets automatically. Custom widget classes that bypass the framework's focus rendering must draw their own focus indicator — but this is part of the feature that introduces keyboard support, not a requirement at initial creation.
- **No silent omissions:** If a widget intentionally skips one of the above rules, add a short comment explaining why.

## 9. File Size & Module Boundaries

- Guideline: ≤ 500 lines per file. Beyond that: consider splitting (but respect → Simplicity First — splitting must add real value).
- One file = one clearly defined responsibility (see `ARCHITEKTUR.md`).
- No import cycles between modules.

## 10. What NOT to Do

- No speculative configurability (→ Simplicity First).
- No premature abstraction: only extract a helper when the second call site exists.
- No prefix comment blocks like `# === SECTION === #` — code should speak through structure.
- No `TODO:` comments without context. Either with reference to `code-review/OFFEN_<BEREICH>.md` or not at all.
- No performance optimizations without measurement.
