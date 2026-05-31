# Code-Review · Modals + Components · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_MODALS.md`](../OFFEN_MODALS.md) — Status **Behoben** oder **Gegenstandslos**.

---

## ESLint-Vor-Pass-Befunde (2026-05-10) — behoben 2026-05-11

Aus dem Initial-Lint-Lauf nach ESLint-Setup. **Status: alle drei im Bereich-8-Review aufgelöst** (siehe [CHANGELOG.md](../../CHANGELOG.md) 2026-05-11).

### ✅ PreCommitModal useMemo-Dep `changedFiles` instabil — behoben

- `src/renderer/modals/PreCommitModal.tsx:102` · Kategorie: **Warnung** (potenziell **Bug**)
- **Beschreibung:** `react-hooks/exhaustive-deps` meldete, dass `changedFiles` als Logical-Expression-Initialisierung jede Render-Phase eine neue Referenz hatte. Das `useMemo` an Zeile 105 lief daher bei jedem Render erneut — Memoization wirkungslos.
- **Auflösung 2026-05-11:** `changedFiles` selbst in `useMemo([state.status])` gewrappt, Dep-Array stabil, beide eslint-disable-Kommentare entfernt.

### ✅ PreCommitModal JSX unescapte Quote-Zeichen — behoben

- `src/renderer/modals/PreCommitModal.tsx:159` · Kategorie: **Warnung** (Lint-Error)
- **Beschreibung:** `react/no-unescaped-entities` meldete ein `"` (U+0022, ASCII) im JSX-Text nach der deutschen Öffnungs-Quote `„` (U+201E).
- **Auflösung 2026-05-11:** Schließquote durch `"` (U+201C, deutsche typografische Quote) ersetzt — Mischung beseitigt, Disable-Kommentar entfernt.

### ✅ DiffViewer Import `useMemo` ungenutzt — behoben

- `src/renderer/components/DiffViewer.tsx:1` · Kategorie: **Warnung**
- **Beschreibung:** Import von `useMemo` aus `react`, im File aber nicht verwendet (Refactoring-Rest aus Sprint 7).
- **Auflösung 2026-05-11:** Import bereinigt, FIXME + Disable entfernt.
