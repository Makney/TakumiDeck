import { useEffect, useMemo, useState } from 'react';
import type {
  ClaudeMdFrontmatter,
  ProjectRow,
  TemplateFile,
  TemplateSchema,
  TemplateVariableSpec,
} from '@shared/types';
import {
  LEGACY_TEMPLATE_SCHEMA,
  buildResolverContext,
  collectServerAutoPaths,
  fillTemplateVariables,
  findVariablesInTemplate,
  resolveAutoPath,
} from '../components/templateVariables';
import { extractTemplateBody } from '../components/templateBody';
import { useFileTabsStore } from '../stores/fileTabs';
import { useUiStore } from '../stores/ui';
import { useProjectStore } from '../stores/projects';

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

// Layout-Konstanten fuer das verschiebbare Format-Modal (Phase-2 Season-4 V2).
// Die Werte sind reine Pixel-Schwellen — als benannte Konstanten statt nackter
// Zahlen im Effekt, damit der Bezug (Modal-Groesse vs. Drag-Bounding) klar ist.
const MODAL_WIDTH_PX = 820;
const MODAL_MAX_HEIGHT_PX = 800;
// Beim Drag soll das Modal nie ganz aus dem Viewport verschwinden: links darf
// es bis -200 px wandern, rechts/unten muss ein sichtbarer Greif-Streifen
// bleiben (80 px Rest rechts, 60 px Header-Streifen unten).
const DRAG_MIN_LEFT_PX = -200;
const DRAG_VISIBLE_RIGHT_PX = 80;
const DRAG_VISIBLE_BOTTOM_PX = 60;

// Phase-2 Season-23: Default-Labels fuer Tokens, deren Schema-Eintrag kein
// eigenes `label` setzt. Greift fuer Bestand (LEGACY_TEMPLATE_SCHEMA) und als
// Fallback bei neuen Templates ohne expliziten Label. Token-Namen sind UPPER_
// SNAKE — wenn auch das Default-Label fehlt, faellt die UI auf den Token-Namen
// selbst zurueck (siehe `formatVariableLabel`).
const DEFAULT_VARIABLE_LABELS: Record<string, string> = {
  PROJEKT_NAME: 'Projekt',
  NEXT_SEASON_NR: 'Nächste Season',
  CURRENT_PHASE_FILE: 'Phase-Datei',
  CURRENT_VERSION: 'Version',
  DATUM: 'Datum',
  LETZTE_SEASON_NAME: 'Letzte Season',
  TECH_SCHULDEN_RELEVANT: 'Tech-Schulden (Top 3)',
  LETZTE_ENTSCHEIDUNGEN: 'Letzte Entscheidungen',
  FEATURE_NAME: 'Feature',
  AUFGABE: 'Aufgabe',
  HINWEISE: 'Hinweise (optional)',
  FIX_TRIGGER: 'Fix-Trigger',
  COMMIT_TRIGGER: 'Commit-Trigger',
  DOCS_TRIGGER: 'Docs-Trigger',
  RELEASE_TRIGGER: 'Release-Trigger',
  RELEASE_ARTIFACTS_TRIGGER: 'Release-Artefakte-Trigger',
  TAG_PUSH_TRIGGER: 'Tag/Push-Trigger',
};

function formatVariableLabel(name: string, spec: TemplateVariableSpec): string {
  if ('input' in spec && spec.label) return spec.label;
  return DEFAULT_VARIABLE_LABELS[name] ?? name;
}

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
  // Phase-2 Season-23: serverseitige Auto-Variablen kommen jetzt als
  // generische Pfad→Wert-Map. Renderer fragt pro aktivem Template nur die
  // Pfade an, die im Schema vorkommen UND im Body verwendet werden (siehe
  // collectServerAutoPaths). Leere Map = noch nicht geladen oder keine
  // Server-Pfade noetig.
  const [serverAutoVars, setServerAutoVars] = useState<Record<string, string>>({});
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
  // Geschaetzte Modal-Groesse (MODAL_WIDTH_PX breit, 80vh hoch) — wir kennen die
  // exakte Hoehe erst nach Layout, aber fuer das initiale Zentrieren reicht eine
  // konservative Schaetzung. Mit Math.max(16, ...) verhindern wir, dass das
  // Modal in einem kleinen Window negative Koordinaten bekommt.
  useEffect(() => {
    const modalW = MODAL_WIDTH_PX;
    const modalH = Math.min(window.innerHeight * 0.8, MODAL_MAX_HEIGHT_PX);
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
        Math.max(DRAG_MIN_LEFT_PX, e.clientX - dragOffset.x),
        window.innerWidth - DRAG_VISIBLE_RIGHT_PX,
      );
      const nextY = Math.min(
        Math.max(0, e.clientY - dragOffset.y),
        window.innerHeight - DRAG_VISIBLE_BOTTOM_PX,
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

  // Server-Auto-Vars-Fetch ist weiter unten — er braucht das aktive Schema +
  // die im Body verwendeten Variablen, beides wird in den useMemo-Bloecken
  // unten berechnet. Verschiebt sich nach `usedVariables`/`schema`.

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

  // Phase-2 Season-23: Schema kommt entweder aus dem Template-Frontmatter (im
  // Main per gray-matter geparst) oder faellt auf das Legacy-Schema zurueck,
  // das die alten Hardcoded-Listen abbildet. Templates ohne `## Vorlage`-
  // Heading bekommen ihren ganzen Inhalt als Body — der Filler ignoriert
  // Tokens ausserhalb des Schemas sowieso.
  const schema: TemplateSchema = useMemo(
    () => selected?.schema ?? LEGACY_TEMPLATE_SCHEMA,
    [selected],
  );

  const usedVariables = useMemo(
    () => (selected ? findVariablesInTemplate(selectedBody) : []),
    [selected, selectedBody],
  );

  // Anhand des aktiven Templates: welche Server-Pfade muss der Main aufloesen?
  // Templates ohne db.*/docs.*-Pfade triggern KEINEN IPC-Call.
  const serverAutoPaths = useMemo(
    () => collectServerAutoPaths(schema, usedVariables),
    [schema, usedVariables],
  );

  // Phase-2 Season-23: Server-Auto-Vars laden, wenn das aktive Template
  // Server-Pfade braucht. Triggert pro Template-Wechsel; idempotent
  // (read-only IPC, kein StrictMode-Guard noetig).
  useEffect(() => {
    if (serverAutoPaths.length === 0) {
      setServerAutoVars({});
      return;
    }
    let cancelled = false;
    void window.api.templates
      .resolveAutoVars({ projectId: project.id, paths: serverAutoPaths })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setServerAutoVars(result.data);
        // Result-Fehlerfall (!result.ok) wird bewusst nicht als UI-Error
        // gemeldet — Tokens bleiben dann literal im Prompt stehen, was den User
        // sichtbar auf die fehlende Quelle hinweist.
      })
      .catch(() => {
        // Echte Bridge-Rejection (kein Result-Objekt): serverAutoVars leeren,
        // damit alle Tokens literal bleiben statt einem stale-Stand.
        if (!cancelled) setServerAutoVars({});
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, serverAutoPaths]);

  const ctx = useMemo(
    () =>
      buildResolverContext({
        project,
        frontmatter,
        date: new Date(),
        serverAutoVars,
        userInputs: userVars,
      }),
    [project, frontmatter, serverAutoVars, userVars],
  );

  const fill = useMemo(() => {
    if (!selected) return null;
    return fillTemplateVariables(selectedBody, schema, ctx);
  }, [selected, selectedBody, schema, ctx]);

  // Sichtbare Auto-Vars in der Sidebar: alle Tokens, die im Body vorkommen,
  // im Schema einen `auto`-Eintrag haben — Reihenfolge folgt dem Body
  // (findVariablesInTemplate). Pfade, die noch nicht aufloesbar sind (Server
  // pending, Frontmatter-Feld fehlt), bleiben sichtbar mit em-dash, damit der
  // User sieht, was gelten WIRD wenn er sendet.
  const visibleAutoVars = useMemo(
    () =>
      usedVariables.filter((name) => {
        const spec = schema.variables[name];
        return spec !== undefined && 'auto' in spec;
      }),
    [usedVariables, schema],
  );

  const visibleInputs = useMemo(
    () =>
      usedVariables.filter((name) => {
        const spec = schema.variables[name];
        return spec !== undefined && 'input' in spec;
      }),
    [usedVariables, schema],
  );

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
      let result: Awaited<ReturnType<typeof window.api.templates.allocateSeasonForSession>>;
      try {
        result = await window.api.templates.allocateSeasonForSession({
          sessionId: activeSessionId,
        });
      } catch (err) {
        // Bridge-Reject: wie beim !ok-Fall hart stoppen, Modal bleibt offen.
        flashToast(
          `Season-Nummer konnte nicht alloziert werden: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      if (!result.ok) {
        // Hard-Stop: ohne korrekte Season-Nummer abschicken ist schlimmer als
        // gar nicht abschicken (die Nummer landet sonst stale im Prompt und im
        // git-Commit-Titel danach). Toast informiert den User; Modal bleibt
        // offen, damit er reagieren kann.
        flashToast(`Season-Nummer konnte nicht alloziert werden: ${result.error}`);
        return;
      }
      const allocated = String(result.data.seasonNumber);
      // Phase-2 Season-23: Re-Fill mit der frisch allozierten Nummer ueber
      // einen Context-Override. Project-Row hat die alte Nummer; wir bauen
      // einen synthetischen Project-Snapshot mit der finalen Zahl, damit der
      // Auto-Pfad `project.next_season_number` den richtigen Wert sieht.
      const overrideCtx = buildResolverContext({
        project: { ...project, next_season_number: result.data.seasonNumber },
        frontmatter,
        date: new Date(),
        serverAutoVars,
        userInputs: userVars,
      });
      finalText = fillTemplateVariables(selectedBody, schema, overrideCtx).filled;
      flashToast(
        result.data.freshlyAssigned
          ? `Session als Season #${allocated} markiert`
          : `Session war bereits Season #${allocated}`,
      );
      // Phase-2 Season-21: nur ein frisch alloziertes Schreibevent erhoeht
      // MAX(season_number) — wenn die Session schon eine Nummer hatte, bleibt
      // der Renderer-Store-Stand korrekt.
      if (result.data.freshlyAssigned) {
        void useProjectStore.getState().reload();
      }
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
    let result: Awaited<ReturnType<typeof window.api.fs.write>>;
    try {
      result = await window.api.fs.write({
        projectId: project.id,
        relPath,
        content: stub,
      });
    } catch (err) {
      // Bridge-Reject: Fehler im Inline-Form anzeigen statt still haengen.
      setNewError(err instanceof Error ? err.message : String(err));
      return;
    }
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
                      {visibleAutoVars.map((name) => {
                        const spec = schema.variables[name];
                        if (!spec || !('auto' in spec)) return null;
                        const value = resolveAutoPath(spec.auto, ctx);
                        return (
                          <AutoVarRow
                            key={name}
                            label={formatVariableLabel(name, spec)}
                            value={value ?? ''}
                          />
                        );
                      })}
                    </dl>
                  </>
                )}
                {visibleInputs.length > 0 && (
                  <>
                    <div className="td-templates-section-title">Eingaben</div>
                    {visibleInputs.map((name) => {
                      const spec = schema.variables[name];
                      if (!spec || !('input' in spec)) return null;
                      const required = spec.required === true;
                      const multiline = spec.input === 'textarea';
                      return (
                        <UserInput
                          key={name}
                          name={name}
                          label={formatVariableLabel(name, spec)}
                          required={required}
                          multiline={multiline}
                          value={userVars[name] ?? ''}
                          onChange={(val) =>
                            setUserVars((prev) => ({ ...prev, [name]: val }))
                          }
                        />
                      );
                    })}
                  </>
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
  // Mehrzeilig: Snippet zeigt Anzahl Eintrage (Eintrag = Bullet-Zeile) +
  // Zeichen-Count + die erste nicht-leere Zeile als Vorschau. Erkennung gegen
  // `/^\s*[-*]\s/`, damit auch `*`- und eingerueckte Bullets als Eintrag zaehlen.
  const bulletCount = lines.filter((l) => /^\s*[-*]\s/.test(l)).length;
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

// Phase-2 Season-4 (M1) / Season-23: Stub fuer ein frisch angelegtes Template.
// Frontmatter deklariert die typischen Tokens, damit das Modal direkt Inputs
// rendert und Auto-Vars aufloesen kann. Body folgt der SEASON_PROMPT.md-
// Konvention (`## Vorlage`-Heading + Code-Fence) — Body-Extraktor erkennt
// die Struktur und pastet ausschliesslich den Code-Fence-Inhalt an die PTY.
export function createTemplateStub(name: string): string {
  const title = name.replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
  return [
    '---',
    'variables:',
    '  PROJEKT_NAME:       { auto: project.name }',
    '  DATUM:              { auto: today }',
    '  FEATURE_NAME:       { input: text,     label: "Feature",  required: true }',
    '  AUFGABE:            { input: textarea, label: "Aufgabe",  required: true }',
    '  HINWEISE:           { input: textarea, label: "Hinweise (optional)" }',
    '---',
    '',
    `# ${title}`,
    '',
    'Kurzbeschreibung des Templates. Wird vom Modal NICHT in den Prompt eingefuegt — nur der Code-Block unter `## Vorlage` landet im Terminal.',
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
