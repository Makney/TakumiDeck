import type { AppSettings } from '@shared/types';
import { z } from 'zod';
import type { JsonValidationResult } from '../../components/JsonRawEditor';

// Geteilte Bausteine der SettingsModal-Tabs (Season 35 aus der Monolith-
// SettingsModal.tsx herausgeloest). Jeder Tab lebt in einer eigenen Datei und
// zieht sich von hier `Field`, `TabBaseProps` und `validateJsonAgainst`.

// Gemeinsame Props der einfachen Tabs: aktuelle Settings + der debounced
// Field-Setter aus dem Shell-Modal.
export interface TabBaseProps {
  settings: AppSettings;
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

// Label + optionaler Hint-Text um ein beliebiges Eingabe-Element.
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="td-settings-field">
      <label className="td-settings-label">{label}</label>
      {children}
      {hint && <div className="td-settings-hint">{hint}</div>}
    </div>
  );
}

// --- Validation-Hilfe für JSON-Editoren -----------------------------------

// Pure-Logik: nimmt eine Quelle und ein zod-Schema, gibt JsonValidationResult
// mit JSON-Parse-Fehlern oder Schema-Fehlern. Wir versuchen, line/column aus
// JSON.parse-Fehlern zu extrahieren — der Standard-Error-Format („Unexpected
// token ... at position N") gibt Position, kein Line. CM6 mappt Line=1 als
// Fallback, was für kurze Settings-JSON-Snippets reicht.
export function validateJsonAgainst(source: string, schema: z.ZodTypeAny): JsonValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { value: null, errors: [{ message }] };
  }
  const schemaResult = schema.safeParse(parsed);
  if (!schemaResult.success) {
    return {
      value: parsed,
      errors: schemaResult.error.errors.map((err) => ({
        message: `${err.path.join('.') || '<root>'}: ${err.message}`,
      })),
    };
  }
  return { value: schemaResult.data, errors: [] };
}
