import { EditorView } from '@codemirror/view';

// CodeMirror-Theme-Override (Sprint 7, Q5 Variante B): oneDark als Highlighting-
// Basis bleibt, aber die strukturellen Tokens (Background, Gutter, Selection,
// Cursor, Line-Highlight) werden auf die td-* CSS-Variablen umgemappt, damit der
// Editor visuell zur App-Chrome passt (Sprint-6-Lehre: Design-Handoff verbindlich).
//
// Wir überschreiben gezielt die Tokens, deren oneDark-Default vom td-bg/td-text/
// td-line abweicht. Syntax-Farben (Keywords, Strings, Comments) bleiben oneDark.
//
// Hintergrund-Mapping:
//   - oneDark default bg #282c34 → td-panel #111413 (passt zum td-code-Container)
//   - oneDark gutter bg #282c34   → td-bg-2 (wie td-files-head)
//   - Selection-Layer auf td-accent-soft (gleiche Tönung wie der Rest der App)
//   - Cursor auf td-accent (statt oneDark's #528bff blau)

export const markdownEditorThemeOverride = EditorView.theme(
  {
    '&': {
      // Editor-Container — fließt in den td-panel-Body ein.
      backgroundColor: 'var(--td-panel)',
      color: 'var(--td-text)',
      fontSize: '12.5px',
    },
    '.cm-content': {
      caretColor: 'var(--td-accent)',
      fontFamily: 'var(--td-mono)',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--td-accent)',
    },
    // Selection-Hintergrund — sowohl die aktive als auch die fokuslose Variante.
    // CM6 nutzt zwei Selektoren je nach Fokus-State; wir geben beide identisch.
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--td-accent-soft)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--td-bg-2)',
      color: 'var(--td-text-mute)',
      borderRight: '1px solid var(--td-line)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(74, 222, 128, 0.04)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(74, 222, 128, 0.06)',
    },
    // Lint-Marker: oneDark-Default ist ein knalliges Rot — wir beruhigen es auf
    // unsere td-red-Note, damit YAML-Errors auffallen, ohne die App zu schreien.
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      borderBottom: '2px solid var(--td-red)',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      borderBottom: '2px solid var(--td-warn)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--td-panel-2)',
      border: '1px solid var(--td-line-2)',
      color: 'var(--td-text)',
    },
    '.cm-tooltip.cm-tooltip-lint': {
      maxWidth: '320px',
      fontSize: '11px',
    },
  },
  // dark: true sagt CM6, dass dieses Theme auf dunklem Hintergrund sitzt — wichtig
  // für die korrekte Auswahl-Kontrast-Berechnung.
  { dark: true },
);
