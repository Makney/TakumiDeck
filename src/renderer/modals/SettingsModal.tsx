import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, LimitBar } from '@shared/types';
import { z } from 'zod';
import { LimitBarSchema } from '@shared/schemas';
import { JsonRawEditor, type JsonValidationResult } from '../components/JsonRawEditor';
import {
  createDebouncedSaver,
  type DebouncedSaver,
  type SaveOutcome,
} from '../components/settingsAutoSave';

// SettingsModal (Sprint 8, Architektur 6.9).
//
// Sechs Tabs (Allgemein / Workspace / Modelle / Token-Tracking / Terminal /
// About). Mix aus Form-Inputs (V2-A: Auto-Save mit 500 ms Debounce) und
// Raw-JSON-Editor (V1-A: Live-Lint, expliziter „Anwenden"-Knopf) für komplexe
// Settings wie limit_bars[] und sensitive_file_patterns.
//
// Modal-Pattern aus PreCommitModal (Sprint 7) — td-modal-backdrop /
// td-modal-header / td-modal-footer / td-action-btn primary.
// Erreichbar via Ctrl+K und Settings-Icon in der Header-Bar (Sprint 8).
//
// Save-Indikator: dezente Tag-Pille im Footer („gespeichert" / „speichert…" /
// „Fehler: …"). Auto-Save-Pfad fühlt sich wie Notes-Save aus Sprint 3 an.

const MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

type TabKey = 'general' | 'workspace' | 'models' | 'usage' | 'terminal' | 'about';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'general', label: 'Allgemein' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'models', label: 'Modelle' },
  { key: 'usage', label: 'Token-Tracking' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'about', label: 'About' },
];

interface Props {
  initialSettings: AppSettings;
  appVersion: string;
  // Wird mit den finalen Settings nach jedem Auto-Save aufgerufen — die
  // Eltern-Komponente (App.tsx) hält dann ihren Settings-State synchron, damit
  // andere Panels (UsageBar, MarkdownEditor etc.) die Änderung sofort sehen.
  onSettingsUpdated: (next: AppSettings) => void;
  onClose: () => void;
}

export function SettingsModal({
  initialSettings,
  appVersion,
  onSettingsUpdated,
  onClose,
}: Props) {
  const [tab, setTab] = useState<TabKey>('general');
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saveStatus, setSaveStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; fields: string[] }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Debounced-Saver — ein Singleton pro Modal-Mount. Beim Modal-Close flushen
  // wir noch einmal, damit die letzte Tipp-Aktion nicht verloren geht.
  const saverRef = useRef<DebouncedSaver | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createDebouncedSaver({
      set: window.api.settings.set,
    });
  }

  useEffect(() => {
    const saver = saverRef.current;
    if (!saver) return;
    const unsub = saver.onOutcome((outcome: SaveOutcome) => {
      if (outcome.status === 'saved') {
        setSaveStatus({ kind: 'saved', fields: outcome.fields });
        if (outcome.result) {
          setSettings(outcome.result);
          onSettingsUpdated(outcome.result);
        }
        // Nach 1.5 s zurück auf idle, damit der Indikator nicht dauerhaft sichtbar bleibt.
        const t = setTimeout(() => setSaveStatus({ kind: 'idle' }), 1500);
        return () => clearTimeout(t);
      }
      setSaveStatus({ kind: 'error', message: outcome.error ?? 'Unbekannter Fehler' });
    });
    return unsub;
  }, [onSettingsUpdated]);

  // Esc + Modal-Close-Flush: letzte queued Field-Patches flushen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void saverRef.current?.flush().then(() => onClose());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleClose = useCallback(() => {
    void saverRef.current?.flush().then(() => onClose());
  }, [onClose]);

  // Gemeinsamer Field-Setter: lokal optimistisch updaten (UI ist sofort live)
  // PLUS in den Debounced-Saver queuen. Der Server-Roundtrip ersetzt unseren
  // optimistic State, sobald er durch ist.
  const setField = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveStatus({ kind: 'saving' });
    saverRef.current?.queue(key, value);
  }, []);

  return (
    <div className="td-modal-backdrop" onClick={handleClose}>
      <div
        className="td-modal td-settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="td-modal-header">
          <div className="td-modal-title">Einstellungen</div>
          <button
            type="button"
            className="td-modal-close"
            onClick={handleClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="td-settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`td-settings-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="td-modal-body td-settings-body">
          {tab === 'general' && (
            <GeneralTab settings={settings} setField={setField} />
          )}
          {tab === 'workspace' && (
            <WorkspaceTab
              settings={settings}
              setField={setField}
              onApplyRawSensitive={(parsed) => applySensitivePatterns(parsed, setField)}
            />
          )}
          {tab === 'models' && (
            <ModelsTab settings={settings} setField={setField} />
          )}
          {tab === 'usage' && (
            <UsageTab
              settings={settings}
              setField={setField}
              onApplyLimitBars={(parsed) => applyLimitBars(parsed, setField)}
            />
          )}
          {tab === 'terminal' && (
            <TerminalTab settings={settings} setField={setField} />
          )}
          {tab === 'about' && <AboutTab version={appVersion} />}
        </div>

        <div className="td-modal-footer td-settings-footer">
          <SaveStatusBadge status={saveStatus} />
          <span className="td-settings-spacer" />
          <button
            type="button"
            className="td-action-btn primary"
            onClick={handleClose}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Apply-Helper für Raw-JSON-Editoren ---------------------------------

function applyLimitBars(
  parsed: unknown,
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Schema bereits in der validate-Funktion geprüft — wir vertrauen dem cast.
  const bars = parsed as LimitBar[];
  setField('limit_bars', bars);
  // Auto-Save kümmert sich um das Persistieren. Apply gibt sofort ok zurück;
  // Server-Errors landen via SaveStatusBadge im Footer.
  return Promise.resolve({ ok: true });
}

function applySensitivePatterns(
  parsed: unknown,
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patterns = parsed as string[];
  setField('sensitive_file_patterns', patterns);
  return Promise.resolve({ ok: true });
}

// --- Tab: Allgemein ------------------------------------------------------

interface TabBaseProps {
  settings: AppSettings;
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

function GeneralTab({ settings, setField }: TabBaseProps) {
  const [openingFolder, setOpeningFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const openDataFolder = useCallback(async () => {
    setOpeningFolder(true);
    setFolderError(null);
    try {
      const result = await window.api.app.openDataFolder();
      if (!result.ok) setFolderError(result.error);
    } finally {
      setOpeningFolder(false);
    }
  }, []);

  return (
    <div className="td-settings-section">
      <Field label="Theme" hint="Aktuell nur Dark verfügbar — Light kommt in Phase 2.">
        <input type="text" value={settings.theme} disabled className="td-settings-input" />
      </Field>

      <Field
        label="claude-Binary-Pfad"
        hint="Default 'claude' nutzt PATH. Wenn du eine spezifische Installation pinnen willst, hier den absoluten Pfad eintragen."
      >
        <input
          type="text"
          value={settings.claude_binary_path}
          onChange={(e) => setField('claude_binary_path', e.target.value)}
          className="td-settings-input"
          placeholder="claude"
          spellCheck={false}
        />
      </Field>

      <Field label="App-Daten-Ordner" hint="settings.json, data.sqlite, Logs und Templates leben hier.">
        <button
          type="button"
          className="td-action-btn"
          onClick={() => void openDataFolder()}
          disabled={openingFolder}
        >
          📂 Open Data Folder
        </button>
        {folderError && <div className="td-md-error">{folderError}</div>}
      </Field>

      <Field label="Akzent-Farbe" hint="Hex-Wert, wirkt auf Hover/Active-Highlights.">
        <input
          type="text"
          value={settings.accent_color}
          onChange={(e) => setField('accent_color', e.target.value)}
          className="td-settings-input td-settings-input--narrow"
          spellCheck={false}
        />
      </Field>
    </div>
  );
}

// --- Tab: Workspace ------------------------------------------------------

function WorkspaceTab({
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

// --- Tab: Modelle --------------------------------------------------------

function ModelsTab({ settings, setField }: TabBaseProps) {
  const updateLimit = useCallback(
    (modelId: string, limit: number) => {
      const next = { ...settings.model_limits, [modelId]: limit };
      setField('model_limits', next);
    },
    [settings.model_limits, setField],
  );

  return (
    <div className="td-settings-section">
      <Field
        label="Default-Modell"
        hint='Wird im „Neue Session"-Dialog vorausgewählt, falls die CLAUDE.md kein Per-Projekt-Default hat.'
      >
        <select
          className="td-settings-input"
          value={settings.default_model}
          onChange={(e) => setField('default_model', e.target.value)}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} ({m.value})
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Per-Modell-Kontext-Limits (Token)"
        hint="Standard ist 200 000 Token. Für Extended-Context-Beta (1 000 000) auf den jeweiligen Wert hochsetzen."
      >
        <div className="td-settings-grid">
          {MODEL_OPTIONS.map((m) => (
            <label key={m.value} className="td-settings-grid-row">
              <span className="td-settings-grid-label">{m.label}</span>
              <input
                type="number"
                min={1}
                step={1000}
                className="td-settings-input td-settings-input--narrow"
                value={settings.model_limits[m.value] ?? settings.default_limit}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) updateLimit(m.value, n);
                }}
              />
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Default-Limit (für Modelle ohne expliziten Wert)"
        hint="Greift, wenn ein neues Modell auftaucht, das noch nicht in der Per-Modell-Tabelle steht."
      >
        <input
          type="number"
          min={1}
          step={1000}
          className="td-settings-input td-settings-input--narrow"
          value={settings.default_limit}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) setField('default_limit', n);
          }}
        />
      </Field>
    </div>
  );
}

// --- Tab: Token-Tracking -------------------------------------------------

function UsageTab({
  settings,
  setField,
  onApplyLimitBars,
}: TabBaseProps & {
  onApplyLimitBars: (parsed: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const limitBarsJson = useMemo(
    () => JSON.stringify(settings.limit_bars, null, 2),
    [settings.limit_bars],
  );

  const validateLimitBars = useCallback((src: string): JsonValidationResult => {
    return validateJsonAgainst(src, z.array(LimitBarSchema));
  }, []);

  const setThreshold = useCallback(
    (color: 'yellow' | 'orange' | 'red', value: number) => {
      const next = { ...settings.token_warning_thresholds, [color]: value };
      setField('token_warning_thresholds', next);
    },
    [settings.token_warning_thresholds, setField],
  );

  return (
    <div className="td-settings-section">
      <Field
        label="P90-Window (Stunden)"
        hint="Über wieviele Stunden P90-Limit-Schätzung berechnen. Default 192 h (~8 Tage)."
      >
        <input
          type="number"
          min={24}
          step={24}
          className="td-settings-input td-settings-input--narrow"
          value={settings.p90_window_hours}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) setField('p90_window_hours', n);
          }}
        />
      </Field>

      <Field label="Warning-Schwellen (%)" hint="Ab welchem Verbrauch die UsageBar gelb / orange / rot wird.">
        <div className="td-settings-grid">
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Gelb ab</span>
            <input
              type="number"
              min={0}
              max={100}
              className="td-settings-input td-settings-input--narrow"
              value={settings.token_warning_thresholds.yellow}
              onChange={(e) => setThreshold('yellow', Number(e.target.value))}
            />
          </label>
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Orange ab</span>
            <input
              type="number"
              min={0}
              max={100}
              className="td-settings-input td-settings-input--narrow"
              value={settings.token_warning_thresholds.orange}
              onChange={(e) => setThreshold('orange', Number(e.target.value))}
            />
          </label>
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Rot ab</span>
            <input
              type="number"
              min={0}
              max={100}
              className="td-settings-input td-settings-input--narrow"
              value={settings.token_warning_thresholds.red}
              onChange={(e) => setThreshold('red', Number(e.target.value))}
            />
          </label>
        </div>
      </Field>

      <Field
        label="Plannutzungs-Bars (Raw JSON)"
        hint="Komplexe Settings mit RegEx-Filtern; live-validiert gegen das Schema. Apply nur möglich, wenn das JSON valide ist."
      >
        <JsonRawEditor
          key={limitBarsJson}
          initialJson={limitBarsJson}
          validate={validateLimitBars}
          onApply={onApplyLimitBars}
          heightPx={280}
        />
      </Field>
    </div>
  );
}

// --- Tab: Terminal -------------------------------------------------------

function TerminalTab({ settings, setField }: TabBaseProps) {
  return (
    <div className="td-settings-section">
      <Field label="Schriftart" hint="Komma-getrennte Fallback-Liste. Erste vorhandene Font wird verwendet.">
        <input
          type="text"
          className="td-settings-input"
          value={settings.terminal_font_family}
          onChange={(e) => setField('terminal_font_family', e.target.value)}
          spellCheck={false}
        />
      </Field>

      <Field label="Schriftgröße (px)">
        <input
          type="number"
          min={9}
          max={28}
          className="td-settings-input td-settings-input--narrow"
          value={settings.terminal_font_size}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) setField('terminal_font_size', n);
          }}
        />
      </Field>
    </div>
  );
}

// --- Tab: About ----------------------------------------------------------

function AboutTab({ version }: { version: string }) {
  return (
    <div className="td-settings-section">
      <Field label="Version">
        <code className="td-settings-code">v{version}</code>
      </Field>
      <Field label="Repository">
        <code className="td-settings-code">github.com/Makney/TakumiDeck</code>
      </Field>
      <Field label="Lizenz" hint="Privates Tool, kein öffentliches Distribution-Paket.">
        <span className="td-settings-meta">Privat (kein Code-Signing, kein Auto-Update)</span>
      </Field>
    </div>
  );
}

// --- Reusable Bits -------------------------------------------------------

function Field({
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

function SaveStatusBadge({
  status,
}: {
  status:
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; fields: string[] }
    | { kind: 'error'; message: string };
}) {
  if (status.kind === 'idle') {
    return <span className="td-settings-save-status idle">Auto-Save aktiv</span>;
  }
  if (status.kind === 'saving') {
    return <span className="td-settings-save-status saving">Speichert…</span>;
  }
  if (status.kind === 'saved') {
    return (
      <span className="td-settings-save-status saved">
        ✓ Gespeichert ({status.fields.length} Feld{status.fields.length === 1 ? '' : 'er'})
      </span>
    );
  }
  return (
    <span className="td-settings-save-status error">⚠ {status.message}</span>
  );
}

// --- Validation-Hilfe für JSON-Editoren -----------------------------------

// Pure-Logik: nimmt eine Quelle und ein zod-Schema, gibt JsonValidationResult
// mit JSON-Parse-Fehlern oder Schema-Fehlern. Wir versuchen, line/column aus
// JSON.parse-Fehlern zu extrahieren — der Standard-Error-Format („Unexpected
// token ... at position N") gibt Position, kein Line. CM6 mappt Line=1 als
// Fallback, was für kurze Settings-JSON-Snippets reicht.
function validateJsonAgainst(source: string, schema: z.ZodTypeAny): JsonValidationResult {
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
