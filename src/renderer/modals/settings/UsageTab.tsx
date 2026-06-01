import { useCallback, useMemo } from 'react';
import type { AppSettings } from '@shared/types';
import { z } from 'zod';
import { LimitBarSchema } from '@shared/schemas';
import { JsonRawEditor, type JsonValidationResult } from '../../components/JsonRawEditor';
import { Field, validateJsonAgainst, type TabBaseProps } from './shared';

// Fenstergroesse (in Stunden), ab der eine limit_bar als Wochen-Limit gilt und
// das Wochen-Reset-Schema bekommt.
const WEEKLY_WINDOW_HOURS = 168;

export function UsageTab({
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

  // Patch-Setter fuer context_soft_warning — analog zu setThreshold/setTopN,
  // damit das Sub-Feld an einer Stelle zusammengebaut wird statt zweimal inline.
  const setSoftWarning = useCallback(
    (patch: Partial<AppSettings['context_soft_warning']>) => {
      setField('context_soft_warning', {
        ...settings.context_soft_warning,
        ...patch,
      });
    },
    [settings.context_soft_warning, setField],
  );

  // Phase 2 Season Flacsh: Wochen-Reset. Liest den existierenden reset_schedule
  // der ersten Wochen-Bar (window_hours >= 168) als Defaultwert. Beim Apply
  // wird das Schema in alle Wochen-Bars geschrieben — der JSON-Editor unten
  // bleibt als Per-Bar-Override.
  const weeklyResetCurrent = useMemo(() => {
    const weekly = settings.limit_bars.find(
      (b) => b.window_hours >= WEEKLY_WINDOW_HOURS && b.reset_schedule,
    );
    return weekly?.reset_schedule ?? { day_of_week: 1, hour: 0, minute: 0 };
  }, [settings.limit_bars]);

  const applyWeeklyReset = useCallback(
    (patch: Partial<{ day_of_week: number; hour: number; minute: number }>) => {
      const next = { ...weeklyResetCurrent, ...patch };
      const updated = settings.limit_bars.map((b) =>
        b.window_hours >= WEEKLY_WINDOW_HOURS ? { ...b, reset_schedule: next } : b,
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
              onChange={(e) => {
                if (e.target.value === '') return;
                setThreshold('yellow', Number(e.target.value));
              }}
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
              onChange={(e) => {
                if (e.target.value === '') return;
                setThreshold('orange', Number(e.target.value));
              }}
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
              onChange={(e) => {
                if (e.target.value === '') return;
                setThreshold('red', Number(e.target.value));
              }}
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
              onChange={(e) => setSoftWarning({ enabled: e.target.checked })}
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
                if (e.target.value === '') return;
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n < 0 || n > 100) return;
                setSoftWarning({ threshold_percent: n });
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
        hint={`Wochentag und Uhrzeit, an dem die Wochen-Limit-Bars wieder bei 0 anfangen. Wird auf alle Bars mit Fenster ≥ ${WEEKLY_WINDOW_HOURS} h angewendet. Anthropic resettet i. d. R. zur gleichen Zeit wie beim ersten Plan-Tag.`}
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
                if (e.target.value === '') return;
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
                if (e.target.value === '') return;
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
