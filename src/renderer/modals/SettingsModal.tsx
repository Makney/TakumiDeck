import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  CustomModel,
  FetchedModel,
  LimitBar,
  UpdaterState,
} from '@shared/types';
import { z } from 'zod';
import { LimitBarSchema } from '@shared/schemas';
import {
  BUILT_IN_MODEL_OPTIONS,
  buildModelOptions,
  diffNewModels,
  validateNewCustomModel,
  type CustomModelValidationError,
} from '@shared/models';
import { JsonRawEditor, type JsonValidationResult } from '../components/JsonRawEditor';
import {
  createDebouncedSaver,
  type DebouncedSaver,
  type SaveOutcome,
} from '../components/settingsAutoSave';
import { useUpdaterState } from '../components/useUpdaterState';

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

type TabKey =
  | 'general'
  | 'workspace'
  | 'models'
  | 'usage'
  | 'templates'
  | 'terminal'
  | 'about';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'general', label: 'Allgemein' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'models', label: 'Modelle' },
  { key: 'usage', label: 'Token-Tracking' },
  { key: 'templates', label: 'Templates' },
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

  // Idle-Reset-Timer für die „✓ Gespeichert"-Badge. In einem Ref, damit ein
  // schnell folgendes Save-Outcome den alten Timer canceln kann — sonst hätten
  // wir eine Race: alter Timer feuert nach 1.5 s `idle`, obwohl inzwischen ein
  // neuer `saving`-Status aktiv ist.
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saver = saverRef.current;
    if (!saver) return;
    const unsub = saver.onOutcome((outcome: SaveOutcome) => {
      // Vor jedem neuen Outcome den evtl. wartenden idle-Reset abräumen.
      if (savedBadgeTimerRef.current !== null) {
        clearTimeout(savedBadgeTimerRef.current);
        savedBadgeTimerRef.current = null;
      }
      if (outcome.status === 'saved') {
        setSaveStatus({ kind: 'saved', fields: outcome.fields });
        if (outcome.result) {
          setSettings(outcome.result);
          onSettingsUpdated(outcome.result);
        }
        savedBadgeTimerRef.current = setTimeout(() => {
          savedBadgeTimerRef.current = null;
          setSaveStatus({ kind: 'idle' });
        }, 1500);
        return;
      }
      setSaveStatus({ kind: 'error', message: outcome.error ?? 'Unbekannter Fehler' });
    });
    return () => {
      unsub();
      if (savedBadgeTimerRef.current !== null) {
        clearTimeout(savedBadgeTimerRef.current);
        savedBadgeTimerRef.current = null;
      }
    };
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

        {/* Sprint 9 (D5) — 2-Spalten-Layout nach Vorlage (app.jsx 422-431).
            Linke Sidebar mit td-list-item-Klassen (Konsistenz zur App-
            Sidebar), rechter Content-Bereich mit dem aktiven Tab. */}
        <div className="td-modal-body td-settings-body td-settings-body-2col">
          <nav className="td-settings-sidenav" aria-label="Settings-Bereiche">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`td-list-item${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="td-name">{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="td-settings-content">
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
            {tab === 'templates' && (
              <TemplatesTab settings={settings} setField={setField} />
            )}
            {tab === 'terminal' && (
              <TerminalTab settings={settings} setField={setField} />
            )}
            {tab === 'about' && <AboutTab version={appVersion} />}
          </div>
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

  // Phase-2 Season-17: nested object analog zu token_warning_thresholds — eigener
  // Setter, der den Patch aufs Sub-Feld zusammenbaut und ueber setField('screenshot_retention')
  // schiebt. NaN/negative Eingaben werden verworfen, damit der Auto-Save-Patch nicht
  // vom Schema abgewiesen wird.
  const setRetention = useCallback(
    (patch: Partial<{ max_age_days: number; max_total_mib: number }>) => {
      const next = { ...settings.screenshot_retention, ...patch };
      setField('screenshot_retention', next);
    },
    [settings.screenshot_retention, setField],
  );

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

      <ScreenshotRetentionBlock
        settings={settings}
        onChange={setRetention}
      />

      {/* Phase-2 Season-19: Easter-Egg-Token-Vergleiche („du hast ~31×
          LotR geschrieben") als dezenter Streifen unter der Heatmap.
          Werk-Liste ist hartcodiert (DEFAULT_EASTER_EGG_WORKS); der
          Toggle hier ist die einzige Konfigurations-Achse. */}
      <Field
        label="Easter-Egg-Vergleiche"
        hint="Spielerischer Streifen unter der Aktivitaets-Heatmap, der den eigenen Token-Verbrauch mit bekannten Werken vergleicht (LotR, Bibel, Harry-Potter-Reihe usw.)."
      >
        <label className="td-settings-grid-row">
          <span className="td-settings-grid-label">Aktiv</span>
          <input
            type="checkbox"
            className="td-settings-input td-settings-input--narrow"
            checked={settings.easter_egg_enabled}
            onChange={(e) => setField('easter_egg_enabled', e.target.checked)}
          />
        </label>
      </Field>

      {/* Phase-2 Season-24: Default-Layout fuer den Markdown-Editor.
          Side-by-Side ist der neue Daily-Driver; alte Phase-1-Toggle bleibt
          als 'editor'/'preview' weiter im Per-Datei-Switch der Editor-Toolbar
          erreichbar. Diese Einstellung legt nur den Startwert fest, mit dem
          ein frisch geoeffneter Tab kommt. */}
      <Field
        label="Markdown-Editor-Layout"
        hint="Standard-Modus beim Oeffnen einer Markdown-Datei. Pro Datei jederzeit in der Editor-Toolbar umstellbar."
      >
        <select
          className="td-settings-input td-settings-input--narrow"
          value={settings.markdown_editor_layout}
          onChange={(e) =>
            setField('markdown_editor_layout', e.target.value as AppSettings['markdown_editor_layout'])
          }
        >
          <option value="split">Beide (Editor + Preview)</option>
          <option value="editor">Nur Editor</option>
          <option value="preview">Nur Preview</option>
        </select>
      </Field>
    </div>
  );
}

// Phase-2 Season-17: Aufraeum-Block fuer <userData>/screenshots/. Auto-Retention
// laeuft beim App-Start (Boot-Pass), dieser Block liefert die Anzeige + zwei
// Schwellwert-Inputs + Manual-Clear-Button mit Doppel-Confirm.
//
// Doppel-Confirm-Pattern als dritter Inline-Aufrufer nach HistoryActionModal +
// RemoveProjectModal. Der TECH_SCHULDEN-Eintrag #2 dokumentiert die ausstehende
// Extraktion in eine eigene Komponente — bewusst hier nicht mitgezogen, damit
// die Season schmal bleibt.
function ScreenshotRetentionBlock({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<{ max_age_days: number; max_total_mib: number }>) => void;
}) {
  const [summary, setSummary] = useState<{ fileCount: number; totalBytes: number } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [clearStage, setClearStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearedHint, setClearedHint] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    setSummaryError(null);
    const res = await window.api.fs.screenshotsSummary();
    if (res.ok) {
      setSummary(res.data);
    } else {
      setSummary(null);
      setSummaryError(res.error);
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  const handleClear = useCallback(async () => {
    if (clearStage === 'idle') {
      setClearStage('confirm');
      return;
    }
    if (clearStage === 'busy') return;
    setClearStage('busy');
    setClearError(null);
    setClearedHint(null);
    try {
      const res = await window.api.fs.clearScreenshots();
      if (res.ok) {
        const mib = (res.data.bytesFreed / (1024 * 1024)).toFixed(1);
        setClearedHint(
          `✓ ${res.data.filesDeleted} Datei${res.data.filesDeleted === 1 ? '' : 'en'}` +
            ` geloescht (${mib} MiB freigegeben)` +
            (res.data.failures > 0 ? ` · ${res.data.failures} Fehler` : ''),
        );
        await refreshSummary();
      } else {
        setClearError(res.error);
      }
    } finally {
      setClearStage('idle');
    }
  }, [clearStage, refreshSummary]);

  const summaryLabel = summary
    ? `${summary.fileCount} Datei${summary.fileCount === 1 ? '' : 'en'} · ` +
      `${(summary.totalBytes / (1024 * 1024)).toFixed(1)} MiB`
    : summaryError
      ? '— (Lese-Fehler)'
      : '— (lade...)';

  return (
    <Field
      label="Screenshot-Retention"
      hint="Beim App-Start wird <userData>/screenshots/ aufgeraeumt: alles aelter als X Tage fliegt raus, plus Cap auf Gesamtgroesse (aelteste zuerst). Beide Schwellen auf 0 deaktiviert die Auto-Retention; der Manual-Clear-Button bleibt unabhaengig nutzbar."
    >
      <div className="td-settings-grid">
        <div className="td-settings-grid-row">
          <label className="td-settings-grid-label">Maximum Alter (Tage)</label>
          <input
            type="number"
            min={0}
            max={3650}
            step={1}
            className="td-settings-input td-settings-input--narrow"
            value={settings.screenshot_retention.max_age_days}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 3650) {
                onChange({ max_age_days: Math.floor(n) });
              }
            }}
          />
        </div>
        <div className="td-settings-grid-row">
          <label className="td-settings-grid-label">Maximum Gesamtgroesse (MiB)</label>
          <input
            type="number"
            min={0}
            max={1_000_000}
            step={10}
            className="td-settings-input td-settings-input--narrow"
            value={settings.screenshot_retention.max_total_mib}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) {
                onChange({ max_total_mib: Math.floor(n) });
              }
            }}
          />
        </div>
        <div className="td-settings-grid-row">
          <label className="td-settings-grid-label">Aktuell</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="td-settings-hint">{summaryLabel}</span>
            <button
              type="button"
              className="td-action-btn"
              onClick={() => void handleClear()}
              disabled={clearStage === 'busy' || (summary !== null && summary.fileCount === 0)}
              style={
                clearStage === 'confirm'
                  ? { borderColor: 'var(--td-red)', color: 'var(--td-red)' }
                  : undefined
              }
              title={
                clearStage === 'confirm'
                  ? 'Klick erneut zum Bestaetigen'
                  : 'Alle Screenshots in <userData>/screenshots/ loeschen'
              }
            >
              {clearStage === 'confirm'
                ? '⚠ Wirklich alle loeschen?'
                : clearStage === 'busy'
                  ? '…'
                  : '⌧ Alle loeschen'}
            </button>
          </div>
        </div>
      </div>
      {clearedHint && <div className="td-settings-hint-success">{clearedHint}</div>}
      {clearError && <div className="td-md-error">{clearError}</div>}
    </Field>
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

  // Phase-2 Season-34: Built-ins + Custom als eine Liste — daraus wird sowohl
  // das Default-Modell-Dropdown als auch die Per-Modell-Limit-Tabelle gefuellt.
  const modelOptions = useMemo(
    () => buildModelOptions(settings.custom_models),
    [settings.custom_models],
  );

  const addCustomModel = useCallback(
    (model: CustomModel) => {
      setField('custom_models', [...settings.custom_models, model]);
    },
    [settings.custom_models, setField],
  );

  const removeCustomModel = useCallback(
    (id: string) => {
      setField(
        'custom_models',
        settings.custom_models.filter((m) => m.id !== id),
      );
    },
    [settings.custom_models, setField],
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
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.id}){m.isCustom ? ' · custom' : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Per-Modell-Kontext-Limits (Token)"
        hint="Standard ist 200 000 Token. Für Extended-Context-Beta (1 000 000) auf den jeweiligen Wert hochsetzen."
      >
        <div className="td-settings-grid">
          {modelOptions.map((m) => (
            <label key={m.id} className="td-settings-grid-row">
              <span className="td-settings-grid-label">{m.label}</span>
              <input
                type="number"
                min={1}
                step={1000}
                className="td-settings-input td-settings-input--narrow"
                value={settings.model_limits[m.id] ?? settings.default_limit}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) updateLimit(m.id, n);
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

      <ModelRefreshBlock customModels={settings.custom_models} onAdd={addCustomModel} />

      <CustomModelsBlock
        customModels={settings.custom_models}
        onAdd={addCustomModel}
        onRemove={removeCustomModel}
      />
    </div>
  );
}

// Phase-2 Season-34 (Variante D): optionaler Auto-Refresh gegen die Anthropic
// Models-API. Der Button fragt `/v1/models` ab. Drei Ausgaenge:
//   - kein API-Key (Abo-/OAuth-Nutzung) → Hinweis auf manuelle Pflege unten,
//   - Liste mit neuen IDs → je ein „Uebernehmen"-Button, der das Modell als
//     Custom-Eintrag (Label = Anzeigename, ohne Limit → Default greift) anlegt,
//   - Netzwerk-/HTTP-Fehler → Fehlermeldung.
// Bereits bekannte Modelle (Built-in oder Custom) werden via `diffNewModels`
// herausgefiltert, damit nur echte Neuzugaenge erscheinen.
function ModelRefreshBlock({
  customModels,
  onAdd,
}: {
  customModels: CustomModel[];
  onAdd: (model: CustomModel) => void;
}) {
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'no-key' }
    | { kind: 'loaded'; models: FetchedModel[] }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Built-in- + Custom-IDs als Bekannt-Menge fuer den Diff. Neu hinzugefuegte
  // Customs verschwinden so nach dem Uebernehmen aus der Vorschlagsliste.
  const knownIds = useMemo(
    () => [...BUILT_IN_MODEL_OPTIONS.map((m) => m.id), ...customModels.map((m) => m.id)],
    [customModels],
  );

  const newModels = useMemo(
    () => (state.kind === 'loaded' ? diffNewModels(state.models, knownIds) : []),
    [state, knownIds],
  );

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    const res = await window.api.models.fetchAvailable();
    if (!res.ok) {
      setState({ kind: 'error', message: res.error });
      return;
    }
    if (!res.data.available) {
      setState({ kind: 'no-key' });
      return;
    }
    setState({ kind: 'loaded', models: res.data.models });
  }, []);

  return (
    <Field
      label="Verfuegbare Modelle abrufen"
      hint={
        'Fragt die Anthropic-API nach allen aktuell verfuegbaren Modellen. ' +
        'Funktioniert nur mit gesetztem ANTHROPIC_API_KEY — bei Abo-/Login-Nutzung ' +
        'gibt es keinen Key; dann neue Modelle einfach unten manuell anlegen. ' +
        'Kontext-Limits liefert die API nicht — die bleiben Default bzw. eigene Eingabe.'
      }
    >
      <div className="td-model-refresh">
        <button
          type="button"
          className="td-action-btn"
          onClick={() => void refresh()}
          disabled={state.kind === 'loading'}
        >
          {state.kind === 'loading' ? '… Abrufen' : '↻ Modelle abrufen'}
        </button>

        {state.kind === 'no-key' && (
          <div className="td-settings-hint">
            Kein API-Key gefunden (du nutzt vermutlich das Abo). Neue Modelle bitte
            unten unter „Eigene Modelle“ manuell eintragen.
          </div>
        )}

        {state.kind === 'error' && <div className="td-md-error">⚠ {state.message}</div>}

        {state.kind === 'loaded' && newModels.length === 0 && (
          <div className="td-settings-hint-success">
            ✓ Alle verfuegbaren Modelle sind bereits bekannt.
          </div>
        )}

        {state.kind === 'loaded' && newModels.length > 0 && (
          <ul className="td-custom-models-list">
            {newModels.map((m) => (
              <li key={m.id} className="td-custom-models-row">
                <span className="td-custom-models-id">{m.id}</span>
                <span className="td-custom-models-label">{m.displayName}</span>
                <button
                  type="button"
                  className="td-action-btn primary td-custom-models-remove"
                  onClick={() => onAdd({ id: m.id, label: m.displayName })}
                  title="Als eigenes Modell uebernehmen"
                >
                  + Uebernehmen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

// Phase-2 Season-34: Pflege-Block fuer User-erweiterte Modell-Liste.
// Eingabe-Zeile (ID + Anzeigename + optionales Kontext-Limit) + Liste der
// bereits angelegten Custom-Modelle mit Loeschen-Button. Built-ins werden
// hier bewusst NICHT gerendert — die liefert die App und sind nicht
// loeschbar. ID-Konflikte mit Built-ins erlauben wir trotzdem (Override
// des Anzeigenamens), die Validator-Logik in `buildModelOptions` deckt das.
function CustomModelsBlock({
  customModels,
  onAdd,
  onRemove,
}: {
  customModels: CustomModel[];
  onAdd: (model: CustomModel) => void;
  onRemove: (id: string) => void;
}) {
  const [draftId, setDraftId] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [error, setError] = useState<CustomModelValidationError | null>(null);

  const existingIds = useMemo(
    () => [...BUILT_IN_MODEL_OPTIONS.map((m) => m.id), ...customModels.map((m) => m.id)],
    [customModels],
  );

  const submit = useCallback(() => {
    const validation = validateNewCustomModel({
      id: draftId,
      label: draftLabel,
      existingIds,
    });
    if (validation !== null) {
      setError(validation);
      return;
    }
    const model: CustomModel = {
      id: draftId.trim(),
      label: draftLabel.trim(),
    };
    onAdd(model);
    setDraftId('');
    setDraftLabel('');
    setError(null);
  }, [draftId, draftLabel, existingIds, onAdd]);

  return (
    <Field
      label="Eigene Modelle"
      hint={
        'IDs vergibt Anthropic im Format „claude-<familie>-<version>". Der Anzeigename ' +
        'erscheint im Dropdown („Neue Session" + Default-Modell). Kontext-Limits ' +
        'setzt du oben in der Per-Modell-Limit-Tabelle.'
      }
    >
      <div className="td-custom-models">
        {customModels.length === 0 ? (
          <div className="td-settings-meta">Noch keine eigenen Modelle.</div>
        ) : (
          <ul className="td-custom-models-list">
            {customModels.map((m) => (
              <li key={m.id} className="td-custom-models-row">
                <span className="td-custom-models-id">{m.id}</span>
                <span className="td-custom-models-label">{m.label}</span>
                <button
                  type="button"
                  className="td-action-btn td-custom-models-remove"
                  onClick={() => onRemove(m.id)}
                  aria-label={`Modell ${m.label} entfernen`}
                  title="Entfernen"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="td-custom-models-add">
          <input
            type="text"
            className="td-settings-input"
            placeholder="Modell-ID (z.B. claude-opus-5)"
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            spellCheck={false}
          />
          <input
            type="text"
            className="td-settings-input"
            placeholder="Anzeigename (z.B. Opus 5)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="td-action-btn primary"
            onClick={submit}
          >
            + Hinzufügen
          </button>
        </div>

        {error && (
          <div className="td-md-error">
            {formatCustomModelError(error)}
          </div>
        )}
      </div>
    </Field>
  );
}

function formatCustomModelError(error: CustomModelValidationError): string {
  switch (error) {
    case 'empty_id':
      return 'Modell-ID darf nicht leer sein.';
    case 'empty_label':
      return 'Anzeigename darf nicht leer sein.';
    case 'duplicate_id':
      return 'Diese Modell-ID existiert bereits (Built-in oder eigenes).';
  }
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
      // Wie bei den anderen Number-Inputs: invalides Input (NaN aus Paste o.ä.)
      // verwerfen, statt es in den Patch zu schreiben und vom Schema abweisen
      // zu lassen — User würde sonst „⚠ Ungültiger Settings-Patch" ohne Grund sehen.
      if (!Number.isFinite(value) || value < 0 || value > 100) return;
      const next = { ...settings.token_warning_thresholds, [color]: value };
      setField('token_warning_thresholds', next);
    },
    [settings.token_warning_thresholds, setField],
  );

  // Phase 2 Season Flacsh: Wochen-Reset. Liest den existierenden reset_schedule
  // der ersten Wochen-Bar (window_hours >= 168) als Defaultwert. Beim Apply
  // wird das Schema in alle Wochen-Bars geschrieben — der JSON-Editor unten
  // bleibt als Per-Bar-Override.
  const weeklyResetCurrent = useMemo(() => {
    const weekly = settings.limit_bars.find(
      (b) => b.window_hours >= 168 && b.reset_schedule,
    );
    return weekly?.reset_schedule ?? { day_of_week: 1, hour: 0, minute: 0 };
  }, [settings.limit_bars]);

  const applyWeeklyReset = useCallback(
    (patch: Partial<{ day_of_week: number; hour: number; minute: number }>) => {
      const next = { ...weeklyResetCurrent, ...patch };
      const updated = settings.limit_bars.map((b) =>
        b.window_hours >= 168 ? { ...b, reset_schedule: next } : b,
      );
      setField('limit_bars', updated);
    },
    [settings.limit_bars, weeklyResetCurrent, setField],
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

      {/* Phase-2 Season-8: Soft-Warning fuer die persoenliche Erfahrungsgrenze.
          Setzt einen Marker an der Per-Session-Kontext-Bar und toent die Bar
          dezent ein, sobald die Auslastung den Wert ueberschreitet — unabhaengig
          von den globalen gelb/orange/rot-Stufen oben (= harte Limit-Naehe). */}
      <Field
        label="Kontext-Soft-Warning"
        hint="Persoenliche Erfahrungsgrenze fuer die ctx-Bar in der Action-Bar. Default 20 % — empirisch der Punkt, ab dem die Output-Qualitaet in langen Sessions spuerbar nachlaesst."
      >
        <div className="td-settings-grid">
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Aktiv</span>
            <input
              type="checkbox"
              className="td-settings-input td-settings-input--narrow"
              checked={settings.context_soft_warning.enabled}
              onChange={(e) =>
                setField('context_soft_warning', {
                  ...settings.context_soft_warning,
                  enabled: e.target.checked,
                })
              }
            />
          </label>
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Schwellwert (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              className="td-settings-input td-settings-input--narrow"
              value={settings.context_soft_warning.threshold_percent}
              disabled={!settings.context_soft_warning.enabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n < 0 || n > 100) return;
                setField('context_soft_warning', {
                  ...settings.context_soft_warning,
                  threshold_percent: n,
                });
              }}
            />
          </label>
        </div>
      </Field>

      {/* Phase 2 Season Flacsh: Wochen-Reset-Block. Schreibt das reset_schedule
          in alle limit_bars mit window_hours >= 168 (= Wochen-Limits). Das 5h-
          Window laeuft als session_block automatisch ab erster Nachricht — kein
          Einstellungs-Slot noetig. Wer pro Wochen-Bar abweichende Zeitpunkte
          will, kann den Raw-JSON-Editor weiter unten nutzen. */}
      <Field
        label="Wochen-Reset"
        hint="Wochentag und Uhrzeit, an dem die Wochen-Limit-Bars wieder bei 0 anfangen. Wird auf alle Bars mit Fenster ≥ 168 h angewendet. Anthropic resettet i. d. R. zur gleichen Zeit wie beim ersten Plan-Tag."
      >
        <div className="td-settings-grid">
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Wochentag</span>
            <select
              className="td-settings-input td-settings-input--narrow"
              value={weeklyResetCurrent.day_of_week}
              onChange={(e) => applyWeeklyReset({ day_of_week: Number(e.target.value) })}
            >
              <option value={1}>Montag</option>
              <option value={2}>Dienstag</option>
              <option value={3}>Mittwoch</option>
              <option value={4}>Donnerstag</option>
              <option value={5}>Freitag</option>
              <option value={6}>Samstag</option>
              <option value={0}>Sonntag</option>
            </select>
          </label>
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Stunde</span>
            <input
              type="number"
              min={0}
              max={23}
              className="td-settings-input td-settings-input--narrow"
              value={weeklyResetCurrent.hour}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n < 0 || n > 23) return;
                applyWeeklyReset({ hour: n });
              }}
            />
          </label>
          <label className="td-settings-grid-row">
            <span className="td-settings-grid-label">Minute</span>
            <input
              type="number"
              min={0}
              max={59}
              className="td-settings-input td-settings-input--narrow"
              value={weeklyResetCurrent.minute}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n < 0 || n > 59) return;
                applyWeeklyReset({ minute: n });
              }}
            />
          </label>
        </div>
      </Field>

      <Field
        label="Plannutzungs-Bars (Raw JSON)"
        hint={
          'Komplexe Settings mit RegEx-Filtern; live-validiert gegen das Schema. ' +
          'Apply nur möglich, wenn das JSON valide ist. ' +
          'Optional pro Bar: "reset_schedule": { "day_of_week": 1, "hour": 0, "minute": 0 } ' +
          '(Wochentag 0=Sonntag bis 6=Samstag) und "aggregation_mode": ' +
          '"rolling" | "session_block". Default: window_hours ≤ 6 → session_block, sonst rolling.'
        }
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

// --- Tab: Templates ------------------------------------------------------

// Phase-2 Season-20: Top-N fuer die Doku-Auto-Variablen im Templates-Send-Flow.
// Beide Werte werden via templates:resolve-auto-vars beim Templates-Send frisch
// aus den Settings gelesen — Aenderung wirkt also beim naechsten Send-Klick.
function TemplatesTab({ settings, setField }: TabBaseProps) {
  const setTopN = useCallback(
    (patch: Partial<{ schulden: number; entscheidungen: number }>) => {
      const next = { ...settings.template_top_n, ...patch };
      setField('template_top_n', next);
    },
    [settings.template_top_n, setField],
  );

  return (
    <div className="td-settings-section">
      <Field
        label="Top-N fuer Doku-Auto-Variablen"
        hint={
          'Anzahl der Eintraege, die {{TECH_SCHULDEN_RELEVANT}} und {{LETZTE_ENTSCHEIDUNGEN}} ' +
          'beim Templates-Send aus den Doku-Dateien ziehen. Default 3 fuer beide. ' +
          '0 unterdrueckt die jeweilige Variable komplett. Maximum 20, weil mehr Eintraege ' +
          'den Prompt unnoetig blaehen.'
        }
      >
        <div className="td-settings-grid">
          <div className="td-settings-grid-row">
            <label className="td-settings-grid-label">Tech-Schulden (Top-N)</label>
            <input
              type="number"
              min={0}
              max={20}
              step={1}
              className="td-settings-input td-settings-input--narrow"
              value={settings.template_top_n.schulden}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n <= 20) {
                  setTopN({ schulden: Math.floor(n) });
                }
              }}
            />
          </div>
          <div className="td-settings-grid-row">
            <label className="td-settings-grid-label">Entscheidungen (Top-N)</label>
            <input
              type="number"
              min={0}
              max={20}
              step={1}
              className="td-settings-input td-settings-input--narrow"
              value={settings.template_top_n.entscheidungen}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n <= 20) {
                  setTopN({ entscheidungen: Math.floor(n) });
                }
              }}
            />
          </div>
        </div>
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
        <span className="td-settings-meta">Privat (kein Code-Signing)</span>
      </Field>
      <UpdaterField />
    </div>
  );
}

// Phase-2 Season-26: Update-Block im About-Tab. Zeigt den aktuellen
// Updater-State und stellt den manuellen Re-Check-Button bereit. Banner-
// Klicks (Download/Install) bleiben in der Header-Bar — hier nur Status
// und Re-Check. Im Dev-Modus zeigen wir explizit, dass Auto-Update aus
// ist, damit der User nicht raetselt, warum der Button nichts tut.
function UpdaterField() {
  const state = useUpdaterState();
  const [busy, setBusy] = useState(false);

  const handleCheck = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.api.updater.check();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <Field
      label="Auto-Update"
      hint="Prueft beim App-Start automatisch auf neue Versionen via GitHub-Releases."
    >
      <div className="td-settings-updater">
        <span className="td-settings-meta">{formatUpdaterState(state)}</span>
        <button
          type="button"
          className="td-action-btn"
          onClick={() => void handleCheck()}
          disabled={busy || state.kind === 'disabled-dev'}
          title={
            state.kind === 'disabled-dev'
              ? 'Im Dev-Mode deaktiviert — nur im verpackten Build aktiv.'
              : 'Jetzt manuell auf neue Version pruefen.'
          }
        >
          {busy ? 'Pruefe…' : 'Jetzt nach Update suchen'}
        </button>
      </div>
    </Field>
  );
}

function formatUpdaterState(state: UpdaterState): string {
  switch (state.kind) {
    case 'idle':
      return 'Noch nicht geprueft.';
    case 'checking':
      return 'Pruefe gegen GitHub-Releases…';
    case 'no-update':
      return `Aktuelle Version v${state.currentVersion} ist auf dem neuesten Stand.`;
    case 'available':
      return `Neue Version v${state.version} verfuegbar — Banner oben rechts.`;
    case 'downloading':
      return `Lade v${state.version} … ${state.percent}%`;
    case 'downloaded':
      return `v${state.version} bereit — Neustart noetig.`;
    case 'error':
      return `Fehler: ${state.message}`;
    case 'disabled-dev':
      return `Dev-Mode (v${state.currentVersion}) — Auto-Update nur im Packaged-Build.`;
  }
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
