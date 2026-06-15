import { useCallback, useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { Field, type TabBaseProps } from './shared';

export function GeneralTab({ settings, setField }: TabBaseProps) {
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

      {/* Season 39 (Opencode): zweite Engine. Toggle blendet im „Neue Session"-
          Dialog den Typ „Opencode" ein; der Binary-Pfad wird wie bei claude
          ueber PATH aufgeloest, kann aber gepinnt werden. */}
      <Field
        label="Opencode-Engine"
        hint="Aktiviert opencode als zweite Engine. Ist der Schalter an, taucht im „Neue Session“-Dialog der Typ „Opencode“ auf; das Modell-Dropdown zeigt dann die opencode-Modelle (provider/model)."
      >
        <label className="td-settings-grid-row">
          <span className="td-settings-grid-label">Aktiv</span>
          <input
            type="checkbox"
            className="td-settings-input td-settings-input--narrow"
            checked={settings.opencode_enabled}
            onChange={(e) => setField('opencode_enabled', e.target.checked)}
          />
        </label>
      </Field>

      <Field
        label="opencode-Binary-Pfad"
        hint="Default 'opencode' nutzt PATH. Für eine bestimmte Installation hier den absoluten Pfad eintragen."
      >
        <input
          type="text"
          value={settings.opencode_binary_path}
          onChange={(e) => setField('opencode_binary_path', e.target.value)}
          className="td-settings-input"
          placeholder="opencode"
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
    try {
      const res = await window.api.fs.screenshotsSummary();
      if (res.ok) {
        setSummary(res.data);
      } else {
        setSummary(null);
        setSummaryError(res.error);
      }
    } catch (err) {
      // Bridge-Reject (IPC-Fehler) darf nicht im Loading-State haengen bleiben.
      setSummary(null);
      setSummaryError(err instanceof Error ? err.message : String(err));
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
              if (e.target.value === '') return;
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
              if (e.target.value === '') return;
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
