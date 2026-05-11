import { useEffect, useMemo, useState } from 'react';
import type {
  ClaudeMdFrontmatter,
  ProjectRow,
  TemplateFile,
} from '@shared/types';
import {
  AUTO_VARIABLES,
  REQUIRED_USER_VARIABLES,
  OPTIONAL_USER_VARIABLES,
  buildAutoVariables,
  fillTemplateVariables,
  findVariablesInTemplate,
  type AutoVariable,
  type KnownVariable,
} from '../components/templateVariables';
import { displayProjectName } from '../components/displayProjectName';

// TemplatesModal (Sprint 6, Architektur 6.5).
//
// Q3 Variante A: linke Form-Spalte mit Auto-Vars (read-only) + User-Inputs,
//                rechte Spalte mit Live-Preview. Format-Modal-large (820 px).
// Q1 Variante B: Templates werden bei jedem Open frisch via fs:list-templates
//                gescannt — keine Cache-Reload-Aktion nötig.
// Q2 Variante B: globale und Per-Projekt-Templates erscheinen mit source-Tag
//                separat in der Liste, Konflikt wird sichtbar gemacht.
//
// Send-Mechanismus: dispatched ein 'td-template-send'-CustomEvent, das der
// aktive TerminalTab konsumiert und via terminal.paste(text) an die PTY
// schickt (= Bracketed-Paste-Mode aus Sprint 3.5, kein Reimport nötig).

const AUTO_VARIABLE_LABELS: Record<AutoVariable, string> = {
  PROJEKT_NAME: 'Projekt',
  NEXT_SEASON_NR: 'Nächste Season',
  CURRENT_PHASE_FILE: 'Phase-Datei',
  DATUM: 'Datum',
};

const USER_VARIABLE_LABELS: Record<string, string> = {
  FEATURE_NAME: 'Feature',
  AUFGABE: 'Aufgabe',
  HINWEISE: 'Hinweise (optional)',
};

interface Props {
  project: ProjectRow;
  frontmatter: ClaudeMdFrontmatter | null;
  hasActiveTerminal: boolean;
  onClose: () => void;
}

export function TemplatesModal({ project, frontmatter, hasActiveTerminal, onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [userVars, setUserVars] = useState<Record<string, string>>({});
  // Memory: useRef-Guard nur für Server-Mutationen. fs:list-templates ist
  // read-only — KEIN Guard nötig (StrictMode-Doppelmount lädt zweimal,
  // beide Calls sind idempotent, das State-Setting verliert nichts).

  // Esc schließt das Modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Templates beim Open laden.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void window.api.fs
      .listTemplates({ projectId: project.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setTemplates(result.data);
          // Auto-Pre-Select des ersten Templates, damit der Preview gleich was zeigt.
          if (result.data.length > 0 && result.data[0]) {
            setSelectedPath(result.data[0].path);
          }
        } else {
          setError(result.error);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Beim Template-Wechsel die User-Vars aufräumen — sonst hängen Werte aus
  // einem vorherigen Template an Variablen, die im neuen Template fehlen.
  useEffect(() => {
    setUserVars({});
  }, [selectedPath]);

  const selected = useMemo(
    () => templates.find((t) => t.path === selectedPath) ?? null,
    [templates, selectedPath],
  );

  const autoVars = useMemo(
    () =>
      buildAutoVariables({
        projectName: frontmatter?.workbench.project_name ?? displayProjectName(project),
        nextSeasonNumber: project.next_season_number,
        currentPhaseFile: frontmatter?.workbench.current_phase_file ?? null,
        date: new Date(),
      }),
    [project, frontmatter],
  );

  const usedVariables = useMemo(
    () => (selected ? findVariablesInTemplate(selected.content) : []),
    [selected],
  );

  const fill = useMemo(() => {
    if (!selected) return null;
    return fillTemplateVariables(selected.content, {
      ...autoVars,
      ...(userVars as Partial<Record<KnownVariable, string>>),
    });
  }, [selected, autoVars, userVars]);

  const visibleAutoVars = AUTO_VARIABLES.filter((v) => usedVariables.includes(v));
  const visibleRequired = REQUIRED_USER_VARIABLES.filter((v) => usedVariables.includes(v));
  const visibleOptional = OPTIONAL_USER_VARIABLES.filter((v) => usedVariables.includes(v));

  const canSend =
    selected !== null &&
    fill !== null &&
    fill.missingRequired.length === 0 &&
    hasActiveTerminal;

  const handleSend = () => {
    if (!canSend || !fill) return;
    window.dispatchEvent(
      new CustomEvent<{ text: string }>('td-template-send', { detail: { text: fill.filled } }),
    );
    onClose();
  };

  return (
    <div className="td-modal-backdrop" onClick={onClose}>
      <div
        className="td-modal td-modal-wide td-templates-modal"
        role="dialog"
        aria-label="Templates"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="td-modal-header">
          <h2 className="td-modal-title">Templates</h2>
          <button
            type="button"
            className="td-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="td-templates-body">
          <aside className="td-templates-sidebar">
            <div className="td-templates-section-title">Verfügbar</div>
            {loading && <div className="td-templates-empty">Suche…</div>}
            {error && <div className="td-history-error">{error}</div>}
            {!loading && templates.length === 0 && (
              <div className="td-templates-empty">
                Keine Templates gefunden. Lege welche unter
                <code> docs/templates/*.md</code> oder global unter
                <code> %APPDATA%/TakumiDeck/templates/</code> an.
              </div>
            )}
            <ul className="td-templates-list">
              {templates.map((tpl) => (
                <li
                  key={tpl.path}
                  className={`td-templates-item ${selectedPath === tpl.path ? 'active' : ''}`}
                  onClick={() => setSelectedPath(tpl.path)}
                  title={tpl.path}
                >
                  <span className="td-templates-item-name">{tpl.name}</span>
                  <span className={`td-templates-item-source ${tpl.source}`}>
                    {tpl.source === 'global' ? 'Global' : 'Projekt'}
                  </span>
                </li>
              ))}
            </ul>

            {selected && (
              <>
                {visibleAutoVars.length > 0 && (
                  <>
                    <div className="td-templates-section-title">Automatisch</div>
                    <dl className="td-templates-auto-list">
                      {visibleAutoVars.map((v) => (
                        <div key={v}>
                          <dt>{AUTO_VARIABLE_LABELS[v]}</dt>
                          <dd>{autoVars[v] || <em>—</em>}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
                {(visibleRequired.length > 0 || visibleOptional.length > 0) && (
                  <>
                    <div className="td-templates-section-title">Eingaben</div>
                    {visibleRequired.map((v) => (
                      <UserInput
                        key={v}
                        name={v}
                        label={USER_VARIABLE_LABELS[v] ?? v}
                        required
                        multiline={false}
                        value={userVars[v] ?? ''}
                        onChange={(val) => setUserVars((prev) => ({ ...prev, [v]: val }))}
                      />
                    ))}
                    {visibleOptional.map((v) => (
                      <UserInput
                        key={v}
                        name={v}
                        label={USER_VARIABLE_LABELS[v] ?? v}
                        required={false}
                        multiline
                        value={userVars[v] ?? ''}
                        onChange={(val) => setUserVars((prev) => ({ ...prev, [v]: val }))}
                      />
                    ))}
                  </>
                )}
                {fill && fill.unknownTokens.length > 0 && (
                  <div className="td-templates-warning">
                    Unbekannte Tokens im Template: {fill.unknownTokens.join(', ')}
                  </div>
                )}
              </>
            )}
          </aside>

          <main className="td-templates-preview">
            <div className="td-templates-preview-header">Preview</div>
            <pre className="td-templates-preview-body">
              {fill ? fill.filled : 'Kein Template ausgewählt.'}
            </pre>
          </main>
        </div>

        <div className="td-modal-footer">
          {!hasActiveTerminal && (
            <span className="td-form-meta">
              Kein aktiver Tab — öffne erst eine Session zum Senden.
            </span>
          )}
          <button type="button" className="td-btn td-btn-ghost" onClick={onClose}>
            Schließen
          </button>
          <button
            type="button"
            className="td-btn td-btn-primary"
            disabled={!canSend}
            onClick={handleSend}
            title={canSend ? 'An aktive Session senden' : 'Pflichtfelder fehlen oder kein Tab aktiv'}
          >
            An Session senden
          </button>
        </div>
      </div>
    </div>
  );
}

interface UserInputProps {
  name: string;
  label: string;
  required: boolean;
  multiline: boolean;
  value: string;
  onChange: (value: string) => void;
}

function UserInput({ name, label, required, multiline, value, onChange }: UserInputProps) {
  const isMissing = required && value.trim() === '';
  return (
    /* Sprint 9 (D4) — Vorlage-Naming `td-field` statt `td-form-row`.
       `invalid`-Klasse für die Validierungs-Markierung bleibt eigenständig. */
    <label className="td-field td-templates-input">
      <span>
        {label}
        {required && <span className="td-form-required"> *</span>}
      </span>
      {multiline ? (
        <textarea
          className={`td-templates-textarea ${isMissing ? 'invalid' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`{{${name}}}`}
          rows={3}
        />
      ) : (
        <input
          type="text"
          className={isMissing ? 'invalid' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`{{${name}}}`}
        />
      )}
    </label>
  );
}
