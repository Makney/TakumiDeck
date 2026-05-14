import { useEffect, useMemo, useState } from 'react';
import type {
  ClaudeMdFrontmatter,
  ProjectRow,
  TemplateFile,
  TemplatesResolveAutoVarsResult,
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
import { extractTemplateBody } from '../components/templateBody';
import { displayProjectName } from '../components/displayProjectName';
import { useFileTabsStore } from '../stores/fileTabs';
import { useUiStore } from '../stores/ui';

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
//
// Phase-2 Season-4 (M1): jede Projekt-Template-Zeile hat einen Edit-Stift,
// der das File im Markdown-Editor des Right-Panes oeffnet (via
// useFileTabsStore.openFile). Plus ein "+ Neu"-Button im Modal-Header, der
// ein Inline-Form fuer den Dateinamen zeigt, eine leere Template-Datei in
// docs/templates/ anlegt und gleich in den Editor laedt. Globale Templates
// haben keinen Edit-Pfad (sie liegen ausserhalb des Projekt-Roots, der
// Editor verlangt aber projekt-relative Pfade) — der Edit-Stift ist dort
// disabled mit Tooltip-Hinweis.

const AUTO_VARIABLE_LABELS: Record<AutoVariable, string> = {
  PROJEKT_NAME: 'Projekt',
  NEXT_SEASON_NR: 'Nächste Season',
  CURRENT_PHASE_FILE: 'Phase-Datei',
  DATUM: 'Datum',
  // Phase-2 Season-4 — Werte kommen aus templates:resolve-auto-vars.
  LETZTE_SEASON_NAME: 'Letzte Season',
  TECH_SCHULDEN_RELEVANT: 'Tech-Schulden (Top 3)',
  LETZTE_ENTSCHEIDUNGEN: 'Letzte Entscheidungen',
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
  // Phase-2 Season-11: aktive Session des Tab-Containers (oder null). Wird
  // beim Send genutzt, falls das Template {{NEXT_SEASON_NR}} verwendet — der
  // Main alloziert dann eine Nummer und schreibt sie auf genau diese Session.
  activeSessionId: string | null;
  onClose: () => void;
}

export function TemplatesModal({
  project,
  frontmatter,
  hasActiveTerminal,
  activeSessionId,
  onClose,
}: Props) {
  const [templates, setTemplates] = useState<TemplateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [userVars, setUserVars] = useState<Record<string, string>>({});
  // Phase-2 Season-4 (M1): „+ Neu" oeffnet ein Inline-Form fuer den Dateinamen.
  const [newName, setNewName] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const openFile = useFileTabsStore((s) => s.openFile);
  // Phase-2 Season-4 (V2 Draggable): Modal ist kein klassisches Modal mehr,
  // sondern ein frei verschiebbares Tool-Panel. Backdrop entfaellt, der User
  // kann waehrend des Modal-Open im Editor lesen und Inhalte rauskopieren.
  // Position-State wird beim Mount auf den Viewport zentriert. Drag-Offset
  // ist null, ausser waehrend einer aktiven Drag-Geste.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  // Phase-2 Season-4: serverseitige Auto-Variablen (LETZTE_SEASON_NAME etc.)
  // werden einmal pro Project beim Modal-Open via IPC geholt. Solange das
  // Ergebnis nicht da ist, bleiben die drei Variablen leer im Prompt — der
  // Filler erlaubt das.
  const [serverAutoVars, setServerAutoVars] =
    useState<TemplatesResolveAutoVarsResult | null>(null);
  // Memory: useRef-Guard nur für Server-Mutationen. fs:list-templates ist
  // read-only — KEIN Guard nötig (StrictMode-Doppelmount lädt zweimal,
  // beide Calls sind idempotent, das State-Setting verliert nichts).

  // Esc schliesst das Modal. Wenn das Neu-Inline-Form offen ist, schliesst
  // Esc nur das Inline-Form (nicht das ganze Modal). React-Synthetic-Events
  // stoppen den nativen Bubble nicht — daher loest der Inline-onKeyDown sonst
  // beide aus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (newName !== null) {
          setNewName(null);
          setNewError(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, newName]);

  // Phase-2 Season-4 (V2): Initial-Position beim Mount auf Viewport-Mitte.
  // Geschaetzte Modal-Groesse (820 breit, 80vh hoch) — wir kennen die exakte
  // Hoehe erst nach Layout, aber fuer das initiale Zentrieren reicht eine
  // konservative Schaetzung. Mit Math.max(16, ...) verhindern wir, dass das
  // Modal in einem kleinen Window negative Koordinaten bekommt.
  useEffect(() => {
    const modalW = 820;
    const modalH = Math.min(window.innerHeight * 0.8, 800);
    setPos({
      x: Math.max(16, Math.round((window.innerWidth - modalW) / 2)),
      y: Math.max(16, Math.round((window.innerHeight - modalH) / 2)),
    });
  }, []);

  // Phase-2 Season-4 (V2): Drag-Logik. Pointer-Move/Up am window-Objekt, damit
  // ein schneller Drag, der ueber den Modal-Rand hinaus geht, nicht den Drag
  // verliert. Listener-Setup ist an dragOffset gekoppelt — nur waehrend einer
  // aktiven Geste sind sie aktiv (kein dauerhaftes pointermove-Abfangen).
  useEffect(() => {
    if (!dragOffset) return;
    const onMove = (e: PointerEvent) => {
      // Bounding gegen Viewport: das Modal soll nie ganz aus dem Sichtbereich
      // verschwinden (sonst kann der User den Drag-Griff nicht mehr greifen).
      // 60px Header-Streifen muss sichtbar bleiben.
      const nextX = Math.min(
        Math.max(-200, e.clientX - dragOffset.x),
        window.innerWidth - 80,
      );
      const nextY = Math.min(
        Math.max(0, e.clientY - dragOffset.y),
        window.innerHeight - 60,
      );
      setPos({ x: nextX, y: nextY });
    };
    const onUp = () => setDragOffset(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragOffset]);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Buttons im Header (+ Neu, ×) duerfen das Drag NICHT triggern — sonst
    // wuerde ein Klick auf Schliessen als Mini-Drag interpretiert und das
    // pointerup auf dem Button kommt nicht durch. closest('button') schliesst
    // jeglichen Button-Klick aus, auch verschachtelte Icons.
    if ((e.target as HTMLElement).closest('button')) return;
    if (!pos) return;
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

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

  // Phase-2 Season-4: Server-Auto-Vars laden. read-only IPC → kein StrictMode-
  // Guard noetig (Doppelmount fetcht zweimal, beide Calls sind idempotent).
  useEffect(() => {
    let cancelled = false;
    setServerAutoVars(null);
    void window.api.templates
      .resolveAutoVars({ projectId: project.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setServerAutoVars(result.data);
        }
        // Fehler werden nicht als UI-Error gemeldet — die drei Variablen bleiben
        // leer im Prompt, was eine legitime Anzeige ist.
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Phase-2 Season-11: Frontmatter beim Modal-Open frisch laden. Sonst zeigt
  // {{CURRENT_PHASE_FILE}} im Preview den Stand vom letzten Project-Switch —
  // wenn der User CLAUDE.md zwischenzeitlich editiert hat (z.B. Phase-Update
  // PHASE1 → PHASE2), war das Template stale. Der Store deduped ueber das
  // aktive Project — Doppel-Aufrufe sind unschaedlich, aber wir vermeiden sie
  // im StrictMode mit dem Cancel-Guard.
  const loadActiveProjectFrontmatter = useUiStore((s) => s.loadActiveProjectFrontmatter);
  useEffect(() => {
    void loadActiveProjectFrontmatter(project.id);
  }, [project.id, loadActiveProjectFrontmatter]);

  // Beim Template-Wechsel die User-Vars aufräumen — sonst hängen Werte aus
  // einem vorherigen Template an Variablen, die im neuen Template fehlen.
  useEffect(() => {
    setUserVars({});
  }, [selectedPath]);

  const selected = useMemo(
    () => templates.find((t) => t.path === selectedPath) ?? null,
    [templates, selectedPath],
  );

  // Phase-2 Season-4: Preview/Send nutzen NUR den eigentlichen Vorlage-Block
  // (Code-Fence unter "## Vorlage"), nicht die ganze Datei. Templates ohne
  // diese Konvention bekommen via Fallback weiterhin den vollen Inhalt.
  const selectedBody = useMemo(
    () => (selected ? extractTemplateBody(selected.content) : ''),
    [selected],
  );

  const autoVars = useMemo(
    () =>
      buildAutoVariables({
        projectName: frontmatter?.workbench.project_name ?? displayProjectName(project),
        nextSeasonNumber: project.next_season_number,
        currentPhaseFile: frontmatter?.workbench.current_phase_file ?? null,
        date: new Date(),
        serverAutoVars: serverAutoVars ?? undefined,
      }),
    [project, frontmatter, serverAutoVars],
  );

  const usedVariables = useMemo(
    () => (selected ? findVariablesInTemplate(selectedBody) : []),
    [selected, selectedBody],
  );

  const fill = useMemo(() => {
    if (!selected) return null;
    return fillTemplateVariables(selectedBody, {
      ...autoVars,
      ...(userVars as Partial<Record<KnownVariable, string>>),
    });
  }, [selected, selectedBody, autoVars, userVars]);

  const visibleAutoVars = AUTO_VARIABLES.filter((v) => usedVariables.includes(v));
  const visibleRequired = REQUIRED_USER_VARIABLES.filter((v) => usedVariables.includes(v));
  const visibleOptional = OPTIONAL_USER_VARIABLES.filter((v) => usedVariables.includes(v));

  const canSend =
    selected !== null &&
    fill !== null &&
    fill.missingRequired.length === 0 &&
    hasActiveTerminal;

  const flashToast = useUiStore((s) => s.flashToast);

  // Phase-2 Season-11: wenn das Template {{NEXT_SEASON_NR}} verwendet UND eine
  // aktive Session vorhanden ist, allozieren wir die Nummer atomar im Main
  // und schreiben sie auf die Session. Damit zieht der Counter auch ohne neuen
  // pty:create-Spawn mit (Bug: Counter blieb stehen, weil Seasons per Templates-
  // Send statt neuer Feature-Session gestartet wurden). Wir refillen das
  // Template danach mit der finalen Nummer — das spaerlichere Preview-Vorzeigen
  // bleibt unveraendert, der gesendete Text ist autoritativ.
  const handleSend = async () => {
    if (!canSend || !fill) return;
    let finalText = fill.filled;
    const usesSeasonVar = usedVariables.includes('NEXT_SEASON_NR');
    if (usesSeasonVar && activeSessionId) {
      const result = await window.api.templates.allocateSeasonForSession({
        sessionId: activeSessionId,
      });
      if (!result.ok) {
        // Hard-Stop: ohne korrekte Season-Nummer abschicken ist schlimmer als
        // gar nicht abschicken (die Nummer landet sonst stale im Prompt und im
        // git-Commit-Titel danach). Toast informiert den User; Modal bleibt
        // offen, damit er reagieren kann.
        flashToast(`Season-Nummer konnte nicht alloziert werden: ${result.error}`);
        return;
      }
      const allocated = String(result.data.seasonNumber);
      const refill = fillTemplateVariables(selectedBody, {
        ...autoVars,
        ...(userVars as Partial<Record<KnownVariable, string>>),
        NEXT_SEASON_NR: allocated,
      });
      finalText = refill.filled;
      flashToast(
        result.data.freshlyAssigned
          ? `Session als Season #${allocated} markiert`
          : `Session war bereits Season #${allocated}`,
      );
    }
    window.dispatchEvent(
      new CustomEvent<{ text: string }>('td-template-send', { detail: { text: finalText } }),
    );
    onClose();
  };

  // M1: Edit eines Projekt-Templates — File-Tab im Right-Pane oeffnen und das
  // Modal schliessen. Globale Templates haben keinen relPath und werden im
  // UI durch das disabled-Attribut blockiert; der Guard hier ist Defense in Depth.
  const handleEdit = (tpl: TemplateFile) => {
    if (!tpl.relPath) return;
    void openFile(project.id, tpl.relPath, tpl.name);
    onClose();
  };

  // M1: Neue Template-Datei in docs/templates/ anlegen. Validierung minimal —
  // nicht-leer, .md-Suffix, keine Pfad-Trenner. Bei Erfolg wird das File im
  // Editor geoeffnet und das Modal geschlossen.
  const handleCreate = async () => {
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setNewError('Bitte einen Dateinamen eingeben.');
      return;
    }
    if (/[\\/]/.test(trimmed)) {
      setNewError('Keine Pfad-Trenner im Namen.');
      return;
    }
    const finalName = trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
    const relPath = `docs/templates/${finalName}`;
    // Konflikt-Check gegen die bereits gelistete Template-Liste — vermeidet,
    // dass eine existierende Datei still ueberschrieben wird.
    const exists = templates.some(
      (t) => t.source === 'project' && t.relPath === relPath,
    );
    if (exists) {
      setNewError(`Template „${finalName}" existiert bereits.`);
      return;
    }
    const stub = createTemplateStub(finalName);
    const result = await window.api.fs.write({
      projectId: project.id,
      relPath,
      content: stub,
    });
    if (!result.ok) {
      setNewError(result.error);
      return;
    }
    setNewName(null);
    setNewError(null);
    void openFile(project.id, relPath, finalName);
    onClose();
  };

  // Phase-2 Season-4 (V2): kein Backdrop mehr — alles dahinter bleibt
  // bedienbar (Editor klickbar, Datei-Browser nutzbar, Terminal scrollbar).
  // Modal sitzt als position:fixed-Panel auf dem Viewport und ist via Header
  // verschiebbar. role="dialog" bleibt fuer Screenreader, aber aria-modal
  // entfaellt — es ist kein modaler Dialog mehr.
  if (!pos) return null;
  const dragging = dragOffset !== null;

  return (
    <div
      className="td-modal td-modal-wide td-templates-modal"
      role="dialog"
      aria-label="Templates"
      style={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        zIndex: 100,
        margin: 0,
      }}
    >
      <div
        className="td-modal-header"
        onPointerDown={handleHeaderPointerDown}
        style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        title="Zum Verschieben ziehen"
      >
        <h2 className="td-modal-title">Templates</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <button
            type="button"
            className="td-btn td-btn-ghost"
            onClick={() => {
              setNewName('');
              setNewError(null);
            }}
            title="Neues Projekt-Template anlegen (docs/templates/)"
          >
            + Neu
          </button>
          <button
            type="button"
            className="td-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
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
            {newName !== null && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--td-border, #2a2e2d)',
                  marginBottom: 8,
                }}
              >
                <input
                  type="text"
                  value={newName}
                  autoFocus
                  placeholder="z.B. bugfix.md"
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNewError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreate();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setNewName(null);
                      setNewError(null);
                    }
                  }}
                />
                {newError && (
                  <div className="td-history-error" style={{ fontSize: '0.85em' }}>
                    {newError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="td-btn td-btn-primary"
                    onClick={() => void handleCreate()}
                  >
                    Anlegen + bearbeiten
                  </button>
                  <button
                    type="button"
                    className="td-btn td-btn-ghost"
                    onClick={() => {
                      setNewName(null);
                      setNewError(null);
                    }}
                  >
                    Abbruch
                  </button>
                </div>
              </div>
            )}
            <ul className="td-templates-list">
              {templates.map((tpl) => {
                const canEdit = tpl.source === 'project' && tpl.relPath !== null;
                return (
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
                    <button
                      type="button"
                      className="td-btn td-btn-ghost"
                      disabled={!canEdit}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canEdit) handleEdit(tpl);
                      }}
                      title={
                        canEdit
                          ? 'Im Markdown-Editor öffnen'
                          : 'Globale Templates können nicht im Editor geöffnet werden — bearbeite sie unter %APPDATA%/TakumiDeck/templates/'
                      }
                      aria-label="Template bearbeiten"
                      style={{
                        marginLeft: 6,
                        padding: '2px 6px',
                        fontSize: '0.85em',
                        opacity: canEdit ? 1 : 0.45,
                      }}
                    >
                      ✎
                    </button>
                  </li>
                );
              })}
            </ul>

            {selected && (
              <>
                {visibleAutoVars.length > 0 && (
                  <>
                    <div className="td-templates-section-title">Automatisch</div>
                    <dl className="td-templates-auto-list">
                      {visibleAutoVars.map((v) => (
                        <AutoVarRow key={v} label={AUTO_VARIABLE_LABELS[v]} value={autoVars[v]} />
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
  );
}

// Phase-2 Season-4: Auto-Variablen-Anzeige in der Sidebar. Einzeilige Werte
// werden wie bisher gerendert; mehrzeilige (TECH_SCHULDEN_RELEVANT,
// LETZTE_ENTSCHEIDUNGEN) zeigen nur einen kompakten Snippet (Eintrag-Count
// + erste Zeile), damit die Sidebar nicht ueberlaeuft. Der volle Inhalt ist
// im Preview-Pane rechts sichtbar — ein "Mehr"-Toggle blendet ihn bei Bedarf
// auch in der Sidebar auf.
interface AutoVarRowProps {
  label: string;
  value: string;
}

function AutoVarRow({ label, value }: AutoVarRowProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = value.split('\n');
  const isMultiline = lines.length > 1;
  if (!value) {
    return (
      <div>
        <dt>{label}</dt>
        <dd><em>—</em></dd>
      </div>
    );
  }
  if (!isMultiline) {
    return (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  }
  // Mehrzeilig: Snippet zeigt Anzahl Eintrage (Eintrag = Zeile mit `- `-Prefix)
  // + Zeichen-Count + die erste nicht-leere Zeile als Vorschau.
  const bulletCount = lines.filter((l) => l.startsWith('- ')).length;
  const previewLine = lines.find((l) => l.trim().length > 0) ?? '';
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {!expanded ? (
          <span style={{ display: 'inline-block', maxWidth: '100%' }}>
            {bulletCount > 0
              ? `${bulletCount} Einträge · `
              : `${value.length} Zeichen · `}
            <em style={{ opacity: 0.7 }}>{truncate(previewLine, 60)}</em>{' '}
            <button
              type="button"
              className="td-btn-link"
              onClick={() => setExpanded(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                font: 'inherit',
              }}
            >
              Mehr
            </button>
          </span>
        ) : (
          <span
            style={{
              whiteSpace: 'pre-line',
              display: 'block',
              maxHeight: '12em',
              overflowY: 'auto',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
            {'\n'}
            <button
              type="button"
              className="td-btn-link"
              onClick={() => setExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                font: 'inherit',
              }}
            >
              Weniger
            </button>
          </span>
        )}
      </dd>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

// Phase-2 Season-4 (M1): Stub fuer ein frisch angelegtes Template. Folgt der
// SEASON_PROMPT.md-Konvention: erklaerendes Kopf-Material + `## Vorlage`-Block
// mit dem eigentlichen Prompt. Der Body-Extraktor erkennt diese Struktur und
// pastet ausschliesslich den Code-Fence-Inhalt an die PTY.
export function createTemplateStub(name: string): string {
  const title = name.replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
  return [
    `# ${title}`,
    '',
    'Kurzbeschreibung des Templates. Wird vom Modal NICHT in den Prompt eingefuegt — nur der Code-Block unter `## Vorlage` landet im Terminal.',
    '',
    '**Auto-Variablen** (optional):',
    '',
    '- `{{PROJEKT_NAME}}`, `{{DATUM}}`, `{{NEXT_SEASON_NR}}`, `{{CURRENT_PHASE_FILE}}`',
    '- `{{LETZTE_SEASON_NAME}}`, `{{TECH_SCHULDEN_RELEVANT}}`, `{{LETZTE_ENTSCHEIDUNGEN}}`',
    '',
    '**User-Variablen**: `{{FEATURE_NAME}}` und `{{AUFGABE}}` (Pflicht), `{{HINWEISE}}` (optional).',
    '',
    '---',
    '',
    '## Vorlage (Inhalt)',
    '```',
    '{{FEATURE_NAME}}',
    '',
    '{{AUFGABE}}',
    '```',
    '',
  ].join('\n');
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
