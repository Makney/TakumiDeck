import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { validateClaudeMdYaml } from './yamlValidator';
import { markdownEditorThemeOverride } from './markdownEditorTheme';
import { isDirty, makeEditorState, markSaved, updateBuffer, type EditorDirtyState } from './editorDirtyState';

// MarkdownEditor (Sprint 7, Phase 3).
//
// Zusammenstellung der Architektur-6.8-Spec + der Sprint-7-Variants:
//   - CodeMirror 6 mit lang-markdown + lang-yaml
//   - oneDark + Custom-Theme-Override (Q5 Variante B; siehe markdownEditorTheme.ts)
//   - Manueller Save Ctrl+S, Dirty-Indikator (Q1 Variante A)
//   - 500ms-Debounce-YAML-Linter für CLAUDE.md (Q4 Variante B; CM6-Linter `delay`)
//   - Preview-Toggle via react-markdown
//
// Die fs:read/write-Kommunikation läuft über die Eltern-Komponente — der Editor
// ist ein „kontrolliertes" Widget: er bekommt initialContent + filePath, und
// liefert per onSaved den persistierten Stand zurück. Die Eltern-Komponente
// (Phase 4: Datei-Tab-Stack) verwaltet, welche Datei geladen ist.

interface Props {
  // Identifikator für den Editor-State. Pfad-Wechsel triggert Re-Init des Buffers.
  // Forward-Slash, projekt-relativ.
  filePath: string;
  // Initial geladener Inhalt vom Server (fs:read). Bei filePath-Wechsel wird der
  // Editor mit diesem Wert neu initialisiert.
  initialContent: string;
  // True = die geöffnete Datei ist eine CLAUDE.md → YAML-Linter aktiv.
  // Architektur 6.8: „Inline-YAML-Validierung für CLAUDE.md".
  isClaudeMd: boolean;
  // Aufgerufen mit dem aktuellen Buffer auf Save-Trigger (Ctrl+S oder Save-Button).
  // Bei { ok: true } setzt der Editor den saved-Stand intern hoch; bei { ok: false }
  // bleibt er dirty und zeigt error-message in der Toolbar.
  onSave: (content: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  // Optional: Callback, sobald sich der dirty-Status ändert. Eltern-Komponente
  // (z.B. der Datei-Tab-Stack) nutzt das, um in der Tab-Pille einen ●-Indikator
  // zu setzen. Wird mit dem aktuellen Wert gefeuert, sobald isDirty kippt.
  onDirtyChange?: (dirty: boolean) => void;
}

export function MarkdownEditor({
  filePath,
  initialContent,
  isClaudeMd,
  onSave,
  onDirtyChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorState, setEditorState] = useState<EditorDirtyState>(() =>
    makeEditorState(initialContent),
  );
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs für die Save-Closure. Der CM6-Keymap wird einmal aufgesetzt und referenziert
  // unten dieselben Werte über Refs — sonst hätten wir einen stale Save-Handler.
  // onDirtyChange läuft analog: die Eltern-Komponente reicht die Inline-Closure
  // bei jedem Render frisch durch (`(d) => setDirty(...)`), und ohne Ref würde
  // unser dirty-Effect bei JEDEM Render setDirty triggern → Endlosschleife
  // (Render → Effect → setDirty → Store-Update → Render → ...).
  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // Save-Handler: liest den aktuellen Buffer, ruft onSave, hebt bei Erfolg
  // saved auf den geschriebenen Wert. CM6-Befehl-Signatur returnt true, wenn
  // die Aktion verarbeitet wurde (= Default-Browser-Save unterdrücken).
  const performSave = useCallback(async (): Promise<void> => {
    const current = editorStateRef.current;
    if (!isDirty(current)) {
      // Nichts zu speichern — Save-Trigger ohne Änderung ist no-op (kein Toast,
      // keine Server-Round-Trip). User merkt nichts, was richtig ist.
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSaveRef.current(current.buffer);
      if (result.ok) {
        setEditorState((prev) => markSaved(prev, current.buffer));
      } else {
        setSaveError(result.error);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  // YAML-Linter: nur für CLAUDE.md. CM6-Linter mit delay:500 (Q4 Variante B).
  const yamlLinter = useMemo(() => {
    if (!isClaudeMd) return null;
    return linter(
      (view): Diagnostic[] => {
        const source = view.state.doc.toString();
        const result = validateClaudeMdYaml(source);
        if (result.ok) return [];
        // Wir mappen unsere line/column auf CM6's character-offsets.
        // CM6 nutzt 1-basierte Line-API (state.doc.line(n) → {from, to, text}).
        return result.errors.map((err): Diagnostic => {
          if (err.line !== null) {
            const totalLines = view.state.doc.lines;
            const safeLine = Math.max(1, Math.min(err.line, totalLines));
            const line = view.state.doc.line(safeLine);
            const from = err.column !== null
              ? Math.min(line.from + Math.max(0, err.column - 1), line.to)
              : line.from;
            return {
              from,
              to: line.to,
              severity: 'error',
              message: err.message,
            };
          }
          // Ohne Position: erste Zeile als Fallback markieren, damit der User den
          // Marker nicht übersieht.
          const first = view.state.doc.line(1);
          return { from: first.from, to: first.to, severity: 'error', message: err.message };
        });
      },
      // 500ms-Debounce — CM6 sammelt Tippeingaben und feuert frühestens nach
      // 500ms Ruhe den Validator. Q4 Variante B.
      { delay: 500 },
    );
  }, [isClaudeMd]);

  // CodeMirror-Setup: Extensions zusammenbauen. Bei filePath-Wechsel oder
  // Linter-Wechsel komplett neu, damit der Sprache-Modus passend ist.
  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [
      lineNumbers(),
      drawSelection(),
      highlightActiveLine(),
      indentOnInput(),
      bracketMatching(),
      history(),
      keymap.of([
        // Ctrl+S triggert performSave — preventDefault verhindert den Browser-Save-Dialog.
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            void performSave();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      // Sprache: Markdown ist die Default-Wahl (CLAUDE.md, CHANGELOG.md, README.md).
      // Wenn der Pfad auf .yaml/.yml endet, wechseln wir auf YAML pur.
      filePath.toLowerCase().endsWith('.yaml') || filePath.toLowerCase().endsWith('.yml')
        ? yamlLang()
        : markdown(),
      oneDark,
      syntaxHighlighting(oneDarkHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      // Sprint 9 — Soft-Wrap: lange Markdown-Zeilen brechen statt horizontal
      // aus dem Viewport zu wandern. Reine View-Konfiguration, ändert das
      // Doc nicht (Speichern bleibt mit Original-Zeilen).
      EditorView.lineWrapping,
    ];
    if (yamlLinter) {
      exts.push(yamlLinter);
      exts.push(lintGutter());
    }
    // Theme-Override sitzt zuletzt → höchste Präzedenz (CM6-Cascade: spätere
    // Extensions überschreiben frühere). td-bg / td-text / td-accent kommen aus
    // tokens.css; dadurch passt der Editor visuell zur App-Chrome.
    exts.push(markdownEditorThemeOverride);
    return exts;
  }, [filePath, yamlLinter, performSave]);

  // Mount: EditorView erstellen.
  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        ...extensions,
        // Update-Listener für Buffer-Sync mit React-State (für isDirty + Save).
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            setEditorState((prev) => updateBuffer(prev, next));
          }
        }),
        // Theme-Override am Schluss — Eslint-import-rules verlangen den Import oben,
        // wir laden ihn aber via dynamischer Spec, damit der Tree-Order stimmt.
      ],
    });
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // initialContent + filePath bewusst NICHT in deps — wir handhaben Inhalts-
    // Wechsel weiter unten mit explizitem dispatch, sonst würden wir den View
    // bei jedem buffer-Update neu mounten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, extensions]);

  // Wenn die Eltern-Komponente die Datei wechselt (filePath ändert), bekommt der
  // Effekt oben einen neuen extensions-Set und re-mountet. Damit landet der
  // initialContent als Doc-Inhalt — kein zusätzlicher dispatch nötig.

  // Aber: wenn die Eltern den initialContent für DENSELBEN filePath ändert
  // (z.B. nach einem externen Save), müssen wir den Editor-Buffer mit dem neuen
  // Inhalt synchronisieren. Trigger ist hier ein expliziter Effekt.
  useEffect(() => {
    setEditorState(makeEditorState(initialContent));
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === initialContent) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialContent },
    });
  }, [initialContent]);

  const dirty = isDirty(editorState);

  // onDirtyChange-Push: Eltern (Datei-Tab-Store) bekommen den Dirty-Status für
  // die ●-Pille in der Tab-Bar. WICHTIG: nur `dirty` als dep — den Callback
  // selbst lesen wir aus dem Ref, sonst feuert der Effect bei jedem Render
  // (Eltern-Komponente reicht eine Inline-Closure rein) und triggert eine
  // setDirty-Endlosschleife im Zustand-Store.
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  return (
    <div className="td-md-edit">
      <div className="td-md-toolbar">
        <span className="td-md-path" title={filePath}>{filePath}</span>
        <span className="td-md-spacer" />
        <button
          type="button"
          className={`td-md-mode${showPreview ? '' : ' active'}`}
          onClick={() => setShowPreview(false)}
          title="Editor (Ctrl+S speichert)"
        >
          ▤ Editor
        </button>
        <button
          type="button"
          className={`td-md-mode${showPreview ? ' active' : ''}`}
          onClick={() => setShowPreview(true)}
          title="Markdown-Preview (read-only)"
        >
          ⎘ Preview
        </button>
        <button
          type="button"
          className="td-md-save"
          onClick={() => void performSave()}
          disabled={!dirty || saving}
          title={dirty ? 'Speichern (Ctrl+S)' : 'Keine ungespeicherten Änderungen'}
        >
          {saving ? '…' : '💾'} Save
        </button>
        <span className={`td-md-status${dirty ? ' dirty' : ' clean'}`}>
          {dirty ? '○ ungespeichert' : '● gespeichert'}
        </span>
      </div>
      {saveError && <div className="td-md-error">Save fehlgeschlagen: {saveError}</div>}
      <div className="td-md-body">
        {showPreview ? (
          <div className="td-md-preview">
            <ReactMarkdown>{editorState.buffer}</ReactMarkdown>
          </div>
        ) : (
          <div ref={containerRef} className="td-md-cm" />
        )}
      </div>
    </div>
  );
}
