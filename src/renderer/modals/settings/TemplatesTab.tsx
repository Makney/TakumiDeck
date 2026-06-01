import { useCallback } from 'react';
import { Field, type TabBaseProps } from './shared';

// Phase-2 Season-20: Top-N fuer die Doku-Auto-Variablen im Templates-Send-Flow.
// Beide Werte werden via templates:resolve-auto-vars beim Templates-Send frisch
// aus den Settings gelesen — Aenderung wirkt also beim naechsten Send-Klick.
export function TemplatesTab({ settings, setField }: TabBaseProps) {
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
                if (e.target.value === '') return;
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
                if (e.target.value === '') return;
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
