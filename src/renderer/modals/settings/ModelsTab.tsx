import { useCallback, useMemo, useState } from 'react';
import type { CustomModel, FetchedModel } from '@shared/types';
import {
  BUILT_IN_MODEL_OPTIONS,
  buildModelOptions,
  diffNewModels,
  resolveModelSelectValue,
  validateNewCustomModel,
  type CustomModelValidationError,
} from '@shared/models';
import { Field, type TabBaseProps } from './shared';

export function ModelsTab({ settings, setField }: TabBaseProps) {
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
      // War das entfernte Modell das Default-Modell, faellt es auf das erste
      // Built-in zurueck — sonst zeigt default_model auf eine nicht mehr im
      // Dropdown vorhandene ID (Controlled-<select>-Mismatch).
      const fallbackModel = BUILT_IN_MODEL_OPTIONS[0]?.id;
      if (settings.default_model === id && fallbackModel) {
        setField('default_model', fallbackModel);
      }
      // Verwaisten Per-Modell-Limit-Eintrag mit aufraeumen (Karteileiche).
      if (id in settings.model_limits) {
        const rest = { ...settings.model_limits };
        delete rest[id];
        setField('model_limits', rest);
      }
    },
    [settings.custom_models, settings.default_model, settings.model_limits, setField],
  );

  return (
    <div className="td-settings-section">
      <Field
        label="Default-Modell"
        hint='Wird im „Neue Session"-Dialog vorausgewählt, falls die CLAUDE.md kein Per-Projekt-Default hat.'
      >
        <select
          className="td-settings-input"
          value={resolveModelSelectValue(settings.default_model, modelOptions)}
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
    try {
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
    } catch (err) {
      // Bridge-Reject (IPC-Fehler) darf den Button nicht im Loading-State lassen.
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
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
