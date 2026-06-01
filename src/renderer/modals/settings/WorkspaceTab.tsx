import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { JsonRawEditor, type JsonValidationResult } from '../../components/JsonRawEditor';
import { Field, validateJsonAgainst, type TabBaseProps } from './shared';

export function WorkspaceTab({
  settings,
  setField,
  onApplyRawSensitive,
}: TabBaseProps & {
  onApplyRawSensitive: (parsed: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<number | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const result = await window.api.projects.scanWorkspace();
      if (result.ok) setScanResult(result.data.length);
      else setScanError(result.error);
    } finally {
      setScanning(false);
    }
  }, []);

  const sensitiveJson = useMemo(
    () => JSON.stringify(settings.sensitive_file_patterns, null, 2),
    [settings.sensitive_file_patterns],
  );

  // Validate-Funktion für den Sensitive-Patterns-JSON-Editor.
  const validateSensitive = useCallback((src: string): JsonValidationResult => {
    return validateJsonAgainst(src, z.array(z.string()));
  }, []);

  return (
    <div className="td-settings-section">
      <Field
        label="Workspace-Pfad"
        hint="Der Wurzel-Ordner, der beim App-Start nach Projekten mit CLAUDE.md gescannt wird."
      >
        <input
          type="text"
          value={settings.workspace_path}
          onChange={(e) => setField('workspace_path', e.target.value)}
          className="td-settings-input"
          spellCheck={false}
        />
      </Field>

      <Field label="Workspace neu scannen" hint="Sucht erneut nach Projekten und nimmt neue auf.">
        <button
          type="button"
          className="td-action-btn"
          onClick={() => void runScan()}
          disabled={scanning}
        >
          {scanning ? '…' : '↻'} Workspace neu scannen
        </button>
        {scanResult !== null && (
          <div className="td-settings-hint-success">
            ✓ {scanResult} Projekte erkannt
          </div>
        )}
        {scanError && <div className="td-md-error">{scanError}</div>}
      </Field>

      <Field
        label="Sensitive-File-Patterns (zusätzlich zu Defaults)"
        hint="RegEx-Quellen als JSON-Array. Werden ZUSÄTZLICH zu .env(.*), secrets.*, *.key und *.pem ausgewertet — die Defaults sind nicht abschaltbar."
      >
        <JsonRawEditor
          key={sensitiveJson}
          initialJson={sensitiveJson}
          validate={validateSensitive}
          onApply={onApplyRawSensitive}
          heightPx={140}
        />
      </Field>
    </div>
  );
}
