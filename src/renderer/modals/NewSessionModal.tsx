import { useEffect, useState, useRef } from 'react';
import type { SessionType } from '@shared/types';

// NewSessionModal: Sprint-3-Pflicht aus Architektur 6.0.1.
//
// Felder: Title (Pflicht), Type (4 Buttons), Modell (Dropdown mit human-readable Labels;
// die Model-IDs sind die internen claude-Werte). Default-Modell kommt aus settings.default_model;
// Architektur 6.2 verlangt diese Default-Hierarchie (Per-Projekt > Global), die Per-Projekt-
// Hierarchie aus CLAUDE.md kommt mit Sprint 4 — bis dahin reicht das globale Setting.

const SESSION_TYPES: SessionType[] = ['feature', 'bug', 'review', 'docs-sync'];
const TYPE_LABELS: Record<SessionType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  review: 'Review',
  'docs-sync': 'Docs-Sync',
};

// Modell-Dropdown-Optionen: human-readable Labels + interne Model-IDs.
// Reihenfolge bewusst vom „Daily Driver" (Sonnet 4.6) absteigend zu speziellen Modellen.
const MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

interface Props {
  defaultModel: string;
  // Sprint 6 (Q6 Variante B): Vorschau der nächsten Season-Nummer für das aktive Projekt.
  // Kommt aus useProjectStore (project.next_season_number) — im Modal nur für die
  // Anzeige, der echte Increment passiert atomar im Main beim pty:create. Lücken
  // (Modal abgebrochen, Spawn-Fehler) sind explizit akzeptiert (Architektur 6.6).
  nextSeasonPreview: number | null;
  onCancel: () => void;
  onCreate: (input: { title: string; type: SessionType; model: string }) => void;
}

export function NewSessionModal({ defaultModel, nextSeasonPreview, onCancel, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<SessionType>('feature');
  const [model, setModel] = useState(defaultModel);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Esc schließt, Enter im Title-Feld submittet (wenn Title nicht leer).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Auto-Focus auf das Title-Feld beim Öffnen — Tippstart sofort möglich.
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const canSubmit = title.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onCreate({ title: title.trim(), type, model });
  };

  return (
    <div className="td-modal-backdrop" onClick={onCancel}>
      <div
        className="td-modal"
        role="dialog"
        aria-label="Neue Session"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="td-modal-header">
          <h2 className="td-modal-title">Neue Session</h2>
          <button
            type="button"
            className="td-modal-close"
            onClick={onCancel}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <form
          className="td-modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* Sprint 9 (D4) — Form-Klassen an Vorlage angeglichen
              (`td-field`/`td-radio-row`/`td-radio`, components.jsx 437-454). */}
          <label className="td-field">
            <span>Titel</span>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Sprint-3-Tabs"
              maxLength={120}
            />
          </label>

          <div className="td-field">
            <span>Typ</span>
            <div className="td-radio-row">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`td-radio ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {type === 'feature' && nextSeasonPreview !== null && (
            <div className="td-field td-form-hint">
              <span />
              <span className="td-form-meta">
                Diese Season wäre <strong>#{nextSeasonPreview}</strong>.
              </span>
            </div>
          )}

          <label className="td-field">
            <span>Modell</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="td-modal-footer">
            <button type="button" className="td-btn td-btn-ghost" onClick={onCancel}>
              Abbrechen
            </button>
            <button
              type="submit"
              className="td-btn td-btn-primary"
              disabled={!canSubmit}
            >
              Session starten
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
