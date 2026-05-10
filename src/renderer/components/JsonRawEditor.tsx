import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { json as jsonLang } from '@codemirror/lang-json';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { markdownEditorThemeOverride } from './markdownEditorTheme';

// JsonRawEditor (Sprint 8 — Settings-Dialog Raw-JSON-Tab).
//
// CodeMirror 6 + lang-json + Live-Lint (V1-A). Lint feuert mit 300 ms-Debounce
// gegen den übergebenen `validate`-Callback — der kann sowohl JSON.parse-Fehler
// als auch Schema-Fehler (z.B. zod) zurückgeben.
//
// Save-Pfad: separater „Anwenden"-Knopf (V2: Auto-Save für Form-Inputs, Raw-JSON
// expliziter Apply, weil unfertiges JSON sonst die settings.json verkrüppelt).
// Der Editor selbst ruft KEINEN onApply automatisch — die Eltern-Komponente
// entscheidet, wann gesaved wird.

export interface JsonValidationError {
  message: string;
  // Optional: 1-basierte Position für CM6-Diagnostics-Marker. null = ohne
  // Position (Editor markiert die erste Zeile als Fallback).
  line?: number;
  column?: number;
}

export interface JsonValidationResult {
  // Geparstes JSON-Objekt — null, wenn parse fehlgeschlagen ist.
  value: unknown;
  errors: JsonValidationError[];
}

interface Props {
  // Initial-Inhalt. Bei Änderung von außen (z.B. nach erfolgreichem Apply)
  // wird der Editor-Buffer neu befüllt.
  initialJson: string;
  // Pure-Logik-Validierung. Wird mit dem aktuellen Buffer aufgerufen und
  // returnt geparsten Value + Fehlerliste. Aufrufer sollten zod.safeParse
  // benutzen und das Ergebnis hier als errors mappen.
  validate: (source: string) => JsonValidationResult;
  // Wird aufgerufen, wenn der „Anwenden"-Knopf gedrückt wird UND `validate`
  // keine Fehler gemeldet hat. Returnt ein Promise, dessen Resolve den
  // Apply-Status zurücksetzt (Saving-Indikator weg).
  onApply: (parsed: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
  // Optional: Höhe in px (für eingebettete Container). Default 240 px.
  heightPx?: number;
  // Optional: zeige Apply-Knopf rechts in der Toolbar. Default true.
  showApplyButton?: boolean;
}

export function JsonRawEditor({
  initialJson,
  validate,
  onApply,
  heightPx = 240,
  showApplyButton = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [buffer, setBuffer] = useState(initialJson);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  // Validate-Result für Toolbar-Statusanzeige (Apply-Button-Disable, Hint-Text).
  // useMemo, damit wir bei jedem Tippen einmal validieren — der CM6-Linter macht
  // das parallel, aber für die Toolbar brauchen wir den Wert sofort.
  const validation = useMemo(() => validate(buffer), [buffer, validate]);

  // CM6-Linter: gleiche validate-Funktion, mit 300ms-Debounce für Tipp-Pause-
  // Komfort. Markers werden auf line/column gemappt; ohne Position landet der
  // Marker auf Zeile 1 als Fallback.
  const jsonLinter = useMemo(() => {
    return linter(
      (view): Diagnostic[] => {
        const source = view.state.doc.toString();
        const result = validate(source);
        if (result.errors.length === 0) return [];
        return result.errors.map((err): Diagnostic => {
          const totalLines = view.state.doc.lines;
          const lineNo = err.line ? Math.max(1, Math.min(err.line, totalLines)) : 1;
          const line = view.state.doc.line(lineNo);
          const from = err.column !== undefined
            ? Math.min(line.from + Math.max(0, err.column - 1), line.to)
            : line.from;
          return {
            from,
            to: line.to,
            severity: 'error',
            message: err.message,
          };
        });
      },
      { delay: 300 },
    );
  }, [validate]);

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [
      lineNumbers(),
      drawSelection(),
      highlightActiveLine(),
      indentOnInput(),
      bracketMatching(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      jsonLang(),
      oneDark,
      syntaxHighlighting(oneDarkHighlightStyle),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      jsonLinter,
      lintGutter(),
      markdownEditorThemeOverride,
    ];
    return exts;
  }, [jsonLinter]);

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: initialJson,
      extensions: [
        ...extensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString();
            setBuffer(next);
            // Apply-Indikatoren beim Tippen wegnehmen — der User editiert
            // weiter, also ist der letzte Apply-Status nicht mehr aussagekräftig.
            setApplySuccess(false);
            setApplyError(null);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // initialJson bewusst NICHT in deps — nur beim Mount setzen, danach
    // von außen via Re-Mount (Eltern-Komponente kann key={something} nutzen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensions]);

  const performApply = async (): Promise<void> => {
    if (validation.errors.length > 0) return;
    setApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      const result = await onApply(validation.value);
      if (result.ok) {
        setApplySuccess(true);
      } else {
        setApplyError(result.error);
      }
    } finally {
      setApplying(false);
    }
  };

  const canApply = validation.errors.length === 0 && !applying;

  return (
    <div className="td-json-editor">
      <div className="td-json-toolbar">
        <span
          className={`td-json-status${
            validation.errors.length > 0 ? ' invalid' : ' valid'
          }`}
        >
          {validation.errors.length === 0
            ? '✓ JSON valide'
            : `⚠ ${validation.errors[0]!.message}`}
        </span>
        {showApplyButton && (
          <button
            type="button"
            className="td-action-btn primary"
            onClick={() => void performApply()}
            disabled={!canApply}
            title={
              validation.errors.length > 0
                ? 'JSON ist ungültig — Fehler beheben, dann Anwenden'
                : 'Settings übernehmen'
            }
          >
            {applying ? '…' : applySuccess ? '✓ Gespeichert' : 'Anwenden'}
          </button>
        )}
      </div>
      {applyError && <div className="td-md-error">Apply fehlgeschlagen: {applyError}</div>}
      <div
        ref={containerRef}
        className="td-json-cm"
        style={{ height: `${heightPx}px` }}
      />
    </div>
  );
}
