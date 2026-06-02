import { useEffect, useState, useRef, useMemo } from 'react';
import type {
  CustomModel,
  GitWorktreeEntry,
  PtyWorktreeOption,
  SessionType,
  DocsSyncFileStatus,
  DocsOnDemandFileStatus,
} from '@shared/types';
import {
  DOCS_SYNC_FILES,
  buildDocsSyncPrompt,
  buildContextPreamble,
  type DocsSyncFileDescriptor,
  type ContextPreambleItem,
} from '@shared/docs-sync';
import { buildModelOptions, resolveModelSelectValue } from '@shared/models';
import { sanitizeBranchName } from '@shared/worktree';

// NewSessionModal: Sprint-3-Pflicht aus Architektur 6.0.1.
//
// Felder: Title (Pflicht), Type (5 Buttons), Modell (Dropdown mit human-readable Labels;
// die Model-IDs sind die internen claude-Werte). Default-Modell kommt aus settings.default_model;
// Architektur 6.2 verlangt diese Default-Hierarchie (Per-Projekt > Global), die Per-Projekt-
// Hierarchie aus CLAUDE.md kommt mit Sprint 4 — bis dahin reicht das globale Setting.
//
// Phase-2 Season-5: zusätzlicher 5. Button „Eigene Art" blendet ein Freitext-Feld
// ein, dessen Inhalt als custom_type_label mitgesendet wird.
//
// Phase-2 Season-21: Typ „Docs-Sync" zeigt einen Status-Block mit den vier
// Doku-Files (CHANGELOG/FEATURES/TECH_SCHULDEN/ENTSCHEIDUNGEN). Pro File eine
// Checkbox + Status-Marker; ausgewaehlte Files werden beim Submit in einen
// vorbereiteten Prompt eingebaut, den der TabContainer nach erfolgreichem
// Spawn an die frische Session sendet.
//
// Phase-2 Season-22: Fuer alle anderen Session-Arten (Feature/Bug/Review/
// Custom) ein zweiter Block „On-Demand-Kontext laden". Listet die On-Demand-
// Files aus dem CLAUDE.md-Frontmatter mit Status-Marker und Checkbox; vor-
// ausgewaehlt sind Files mit frischer Summary. Beim Submit baut das Modal
// aus den Body-Inhalten der Summaries eine Praeambel, die genauso wie der
// Docs-Sync-Prompt nach Spawn via Bracketed-Paste an die Session geht.

const SESSION_TYPES: SessionType[] = [
  'feature',
  'bug',
  'review',
  'docs-sync',
  'custom',
  // Phase-2 Season-31: sechster Button — Terminal spawnt PowerShell statt
  // claude. Bewusst in derselben Reihe ohne eigenen "Ohne Agent"-Block: visuell
  // konsistent mit den anderen Typen, der Skip-Charakter ergibt sich aus dem
  // Wegfall von Modell-Dropdown und On-Demand-Kontext-Block.
  'terminal',
];
const TYPE_LABELS: Record<SessionType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  review: 'Review',
  'docs-sync': 'Docs-Sync',
  custom: 'Eigene Art',
  terminal: 'Terminal',
};

// Phase-2 Season-5: gleiche Cap wie das zod-Schema (PtyCreateInputSchema.customTypeLabel).
// Im Verlauf-Panel rendert das Label in eine schmale Spalte — 60 Zeichen reichen, mehr
// würde nur per Tooltip lesbar.
const CUSTOM_TYPE_LABEL_MAX = 60;

interface Props {
  defaultModel: string;
  // Phase-2 Season-34: User-erweiterte Modell-Liste aus den Settings. Die
  // Built-in-IDs liefert `buildModelOptions` selbst; hier reicht der Custom-
  // Slot durch, damit das Modal dieselbe Vereinigung wie der Settings-Tab
  // anzeigt.
  customModels: ReadonlyArray<CustomModel>;
  // Sprint 6 (Q6 Variante B): Vorschau der nächsten Season-Nummer für das aktive Projekt.
  // Kommt aus useProjectStore (project.next_season_number) — im Modal nur für die
  // Anzeige, der echte Increment passiert atomar im Main beim pty:create. Lücken
  // (Modal abgebrochen, Spawn-Fehler) sind explizit akzeptiert (Architektur 6.6).
  nextSeasonPreview: number | null;
  // Phase-2 Season-21: aktives Projekt — gebraucht fuer den docs:sync-status-IPC,
  // wenn der User auf den Docs-Sync-Tab klickt. Bleibt null bis das Modal mit
  // einem aktiven Projekt geoeffnet wird (TabContainer rendert das Modal sowieso
  // nur in diesem Fall).
  projectId: string | null;
  onCancel: () => void;
  onCreate: (input: {
    title: string;
    type: SessionType;
    model: string;
    // Phase-2 Season-5: nur gesetzt bei type='custom'.
    customTypeLabel?: string | null;
    // Phase-2 Season-21: nur gesetzt bei type='docs-sync'. Wird vom
    // TabContainer nach erfolgreichem PTY-Spawn via Bracketed-Paste an die
    // frische Session gesendet.
    initialPrompt?: string | null;
    // Season 37 (Worktree-Support): nur gesetzt, wenn der User die Worktree-
    // Option waehlt. Der Main legt den Worktree an und spawnt die Session dort.
    worktree?: PtyWorktreeOption | null;
  }) => void;
}

export function NewSessionModal({
  defaultModel,
  customModels,
  nextSeasonPreview,
  projectId,
  onCancel,
  onCreate,
}: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<SessionType>('feature');
  const [model, setModel] = useState(defaultModel);
  const modelOptions = useMemo(() => buildModelOptions(customModels), [customModels]);
  // Phase-2 Season-5: separates State-Feld, damit ein Wechsel zwischen 'custom'
  // und einem festen Typ den eingegebenen Label-Text nicht verliert.
  const [customLabel, setCustomLabel] = useState('');
  // Phase-2 Season-21: Auswahl der Docs-Sync-Files. Initial alle vier
  // angewaehlt — der haeufige Fall ist „komplett synchronisieren". Wechsel
  // zwischen Typen behaelt die Auswahl, damit ein versehentlicher Type-
  // Wechsel die Auswahl nicht zurueckwirft.
  const [docsSyncSelection, setDocsSyncSelection] = useState<Set<string>>(
    () => new Set(DOCS_SYNC_FILES.map((f) => f.sourcePath)),
  );
  const [docsSyncStatus, setDocsSyncStatus] = useState<DocsSyncFileStatus[] | null>(
    null,
  );
  const [docsSyncLoading, setDocsSyncLoading] = useState(false);
  // Phase-2 Season-22: On-Demand-Kontext-Block. Status kommt aus dem zweiten
  // IPC (`docs:on-demand-status`); Auswahl ist ein Set ueber relPath. Initial
  // null, damit „lädt…" angezeigt wird, bis die Antwort da ist.
  const [onDemandStatus, setOnDemandStatus] = useState<DocsOnDemandFileStatus[] | null>(
    null,
  );
  const [onDemandLoading, setOnDemandLoading] = useState(false);
  const [onDemandSelection, setOnDemandSelection] = useState<Set<string>>(
    () => new Set(),
  );
  // Season 37 (Worktree-Support): Worktree-Optionen. enabled steuert den ganzen
  // Block; mode unterscheidet neuen Branch von bestehendem. branchInput haelt
  // den Namen (neuer Branch) bzw. die Auswahl (bestehender Branch).
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);
  const [worktreeMode, setWorktreeMode] = useState<'new' | 'existing'>('new');
  const [worktreeBranchNew, setWorktreeBranchNew] = useState('');
  const [worktreeBranchExisting, setWorktreeBranchExisting] = useState('');
  // Git-Status fuer den Worktree-Block: Branch-Liste + bestehende Worktrees.
  // hasGit=false → das Projekt ist kein Repo, der Block bleibt mit Hinweis aus.
  const [worktreeGit, setWorktreeGit] = useState<{
    hasGit: boolean;
    branches: string[];
    current: string;
    worktrees: GitWorktreeEntry[];
  } | null>(null);
  const [worktreeLoading, setWorktreeLoading] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const customLabelRef = useRef<HTMLInputElement>(null);

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

  // Phase-2 Season-5: Wechsel auf 'custom' setzt den Fokus aufs Label-Feld, damit
  // der nächste Tastendruck direkt die freie Bezeichnung tippt.
  useEffect(() => {
    if (type === 'custom') {
      customLabelRef.current?.focus();
    }
  }, [type]);

  // Phase-2 Season-21: Status der vier Doku-Files laden, sobald docs-sync
  // gewaehlt wird. Memory-Guard nicht noetig — der IPC ist ein read-only
  // Status-Abfrage ohne Server-Side-Effect.
  useEffect(() => {
    if (type !== 'docs-sync' || !projectId) return;
    let cancelled = false;
    setDocsSyncLoading(true);
    void window.api.docs.syncStatus({ projectId }).then((result) => {
      if (cancelled) return;
      setDocsSyncLoading(false);
      if (result.ok) {
        setDocsSyncStatus(result.data.files);
      } else {
        // Bei Fehler den Block leer halten — die Checkboxen bleiben aus der
        // Default-Auswahl (alle vier), der Submit ist weiter moeglich, nur
        // ohne Status-Marker.
        setDocsSyncStatus(null);
      }
    });
    return () => {
      cancelled = true;
      // Loading-Marker zuruecksetzen, falls der Effekt vor Antwort des IPC
      // abgebrochen wird (z.B. Wechsel weg von docs-sync) — sonst bliebe das
      // Badge auf „laedt…" haengen.
      setDocsSyncLoading(false);
    };
  }, [type, projectId]);

  // Phase-2 Season-22: On-Demand-Status fuer alle anderen Session-Arten laden.
  // Wird einmal beim ersten Wechsel auf einen non-docs-sync-Typ gefetcht und
  // dann gecached — der User wechselt typischerweise mehrfach zwischen
  // Feature/Bug/Review, ohne dass sich die On-Demand-Files-Liste aendert.
  // Phase-2 Season-31: Terminal-Sessions sind Quick-Shells — kein claude-Prompt,
  // also auch kein Praeambel-Block. IPC bleibt ungerufen.
  useEffect(() => {
    if (type === 'docs-sync' || type === 'terminal' || !projectId) return;
    if (onDemandStatus !== null) return; // bereits geladen
    let cancelled = false;
    setOnDemandLoading(true);
    void window.api.docs.onDemandStatus({ projectId }).then((result) => {
      if (cancelled) return;
      setOnDemandLoading(false);
      if (result.ok) {
        setOnDemandStatus(result.data.files);
        // Default-Auswahl: alle Files mit frischer Summary. Veraltete
        // werden bewusst NICHT vorausgewaehlt — der User soll explizit
        // entscheiden, einen Stale-Body in den Kontext zu uebernehmen.
        const fresh = result.data.files
          .filter((f) => f.state === 'fresh')
          .map((f) => f.sourcePath);
        setOnDemandSelection(new Set(fresh));
      } else {
        setOnDemandStatus([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [type, projectId, onDemandStatus]);

  // Season 37: Terminal-Sessions bekommen keinen Worktree — beim Wechsel auf
  // 'terminal' die Auswahl zuruecksetzen, damit kein verborgener Worktree-State
  // beim Submit mitfaehrt.
  useEffect(() => {
    if (type === 'terminal' && worktreeEnabled) {
      setWorktreeEnabled(false);
    }
  }, [type, worktreeEnabled]);

  // Season 37: Branch-Liste + bestehende Worktrees laden, sobald der User den
  // Worktree-Block aktiviert. Read-only IPC (kein Server-Side-Effect) → kein
  // useRef-Guard noetig. Einmal laden und cachen.
  useEffect(() => {
    if (!worktreeEnabled || !projectId || type === 'terminal') return;
    if (worktreeGit !== null) return;
    let cancelled = false;
    setWorktreeLoading(true);
    void Promise.all([
      window.api.git.listBranches({ projectId }),
      window.api.git.worktreeList({ projectId }),
    ]).then(([branchesRes, worktreesRes]) => {
      if (cancelled) return;
      setWorktreeLoading(false);
      const hasGit = branchesRes.ok ? branchesRes.data.hasGit : false;
      setWorktreeGit({
        hasGit,
        branches: branchesRes.ok ? branchesRes.data.branches : [],
        current: branchesRes.ok ? branchesRes.data.current : '',
        worktrees: worktreesRes.ok ? worktreesRes.data.worktrees : [],
      });
      // Default-Auswahl fuer den „bestehenden Branch"-Modus: erster Branch, der
      // nicht der aktuelle und nicht bereits in einem Worktree ausgecheckt ist.
      if (branchesRes.ok) {
        const checkedOut = new Set(
          (worktreesRes.ok ? worktreesRes.data.worktrees : [])
            .map((w) => w.branch)
            .filter((b): b is string => b !== null),
        );
        const firstFree = branchesRes.data.branches.find(
          (b) => b !== branchesRes.data.current && !checkedOut.has(b),
        );
        if (firstFree) setWorktreeBranchExisting(firstFree);
      }
    });
    return () => {
      cancelled = true;
      setWorktreeLoading(false);
    };
  }, [worktreeEnabled, projectId, type, worktreeGit]);

  const trimmedCustomLabel = customLabel.trim();

  // Phase-2 Season-21: Submit-Validierung. Docs-Sync braucht mindestens eine
  // angewaehlte Datei, sonst waere der Prompt leer und die frische Session
  // bekaeme keinen sinnvollen ersten Input.
  const selectedDocsSyncFiles = useMemo<DocsSyncFileDescriptor[]>(
    () => DOCS_SYNC_FILES.filter((f) => docsSyncSelection.has(f.sourcePath)),
    [docsSyncSelection],
  );

  // Season 37: aktiver, gueltiger Worktree-Branch (je nach Modus).
  const worktreeActive = worktreeEnabled && type !== 'terminal';
  const worktreeBranch =
    worktreeMode === 'new' ? worktreeBranchNew.trim() : worktreeBranchExisting;
  const worktreeValid =
    !worktreeActive || (worktreeGit?.hasGit === true && worktreeBranch.length > 0);

  // Season 37: Branches, die als „bestehender Branch" auscheckbar sind — ohne
  // den aktuellen (im Haupt-Checkout aktiv) und ohne bereits in einem anderen
  // Worktree ausgecheckte. Plus die Linked-Worktrees fuer die Uebersicht.
  const linkedWorktrees = (worktreeGit?.worktrees ?? []).filter((w) => !w.isMain);
  const checkedOutBranches = new Set(
    (worktreeGit?.worktrees ?? [])
      .map((w) => w.branch)
      .filter((b): b is string => b !== null),
  );
  const existingBranchOptions = (worktreeGit?.branches ?? []).filter(
    (b) => b !== worktreeGit?.current && !checkedOutBranches.has(b),
  );

  const canSubmit =
    title.trim().length > 0 &&
    (type !== 'custom' || trimmedCustomLabel.length > 0) &&
    (type !== 'docs-sync' || selectedDocsSyncFiles.length > 0) &&
    worktreeValid;

  const toggleDocsSyncFile = (sourcePath: string) => {
    setDocsSyncSelection((prev) => {
      const next = new Set(prev);
      if (next.has(sourcePath)) next.delete(sourcePath);
      else next.add(sourcePath);
      return next;
    });
  };

  // Phase-2 Season-22: Toggle fuer die On-Demand-Kontext-Liste. Wird nur fuer
  // non-docs-sync-Typen gerendert.
  const toggleOnDemandFile = (sourcePath: string) => {
    setOnDemandSelection((prev) => {
      const next = new Set(prev);
      if (next.has(sourcePath)) next.delete(sourcePath);
      else next.add(sourcePath);
      return next;
    });
  };

  // Phase-2 Season-22: ausgewaehlte Files mit ihrem Summary-Body fuer den
  // Praeambel-Builder. Files ohne Body (state='missing-source'/'missing-
  // summary') werden ausgefiltert — der User kann sie zwar anklicken, aber
  // ohne Body koennen sie nicht zur Praeambel beitragen.
  const onDemandPreambleItems = useMemo<ContextPreambleItem[]>(() => {
    if (!onDemandStatus) return [];
    const items: ContextPreambleItem[] = [];
    for (const file of onDemandStatus) {
      if (!onDemandSelection.has(file.sourcePath)) continue;
      if (file.summaryBody === null) continue;
      items.push({ relPath: file.sourcePath, summaryBody: file.summaryBody });
    }
    return items;
  }, [onDemandStatus, onDemandSelection]);

  const submit = () => {
    if (!canSubmit) return;
    // Phase-2 Season-22: zwei moegliche Praeambel-Quellen, die sich gegen-
    // seitig ausschliessen. docs-sync ⇒ Docs-Sync-Prompt; alle anderen ⇒
    // Kontext-Praeambel (oder null, wenn nichts ausgewaehlt/verfuegbar).
    // Phase-2 Season-31: Terminal-Sessions kriegen weder Praeambel noch echtes
    // Modell — der Sentinel 'none' erfuellt die zod-Pflicht (min(1)) und wird
    // im Spawn-Branch in pty.ts ignoriert, weil dort current_model bei
    // type='terminal' fix auf null geschrieben wird.
    let preamble: string | null = null;
    if (type === 'docs-sync') {
      preamble = buildDocsSyncPrompt(selectedDocsSyncFiles);
    } else if (type !== 'terminal' && onDemandPreambleItems.length > 0) {
      preamble = buildContextPreamble(onDemandPreambleItems);
    }
    // Season 37: Worktree-Option nur, wenn aktiv + gueltiger Branch.
    const worktreeOption: PtyWorktreeOption | null =
      worktreeActive && worktreeBranch.length > 0
        ? { branch: worktreeBranch, mode: worktreeMode, baseRef: null }
        : null;
    onCreate({
      title: title.trim(),
      type,
      model: type === 'terminal' ? 'none' : model,
      customTypeLabel: type === 'custom' ? trimmedCustomLabel : null,
      initialPrompt: preamble,
      worktree: worktreeOption,
    });
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

          {type === 'custom' && (
            <label className="td-field">
              <span>Bezeichnung</span>
              <input
                ref={customLabelRef}
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="z.B. Refactor, Spike, Hotfix"
                maxLength={CUSTOM_TYPE_LABEL_MAX}
              />
            </label>
          )}

          {type === 'docs-sync' && (
            <div className="td-field">
              <span>Doku-Dateien</span>
              <div className="td-docs-sync-list">
                {DOCS_SYNC_FILES.map((file) => {
                  const status = docsSyncStatus?.find((s) => s.sourcePath === file.sourcePath);
                  const checked = docsSyncSelection.has(file.sourcePath);
                  return (
                    <label
                      key={file.sourcePath}
                      className={`td-docs-sync-row${checked ? ' selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDocsSyncFile(file.sourcePath)}
                      />
                      <span className="td-docs-sync-name">{file.name}</span>
                      <DocsSyncStatusBadge status={status} loading={docsSyncLoading} />
                    </label>
                  );
                })}
              </div>
              <span className="td-form-meta td-docs-sync-hint">
                Ausgewählte Dateien werden komprimiert nach{' '}
                <code>docs/SUMMARIES/</code> abgelegt.
              </span>
            </div>
          )}

          {/* Phase-2 Season-22: On-Demand-Kontext-Block fuer alle anderen
              Session-Arten. Nutzt dieselben CSS-Klassen wie der Docs-Sync-
              Block (visuell identisch — Checkbox-Reihe mit Status-Marker).
              Phase-2 Season-31: Terminal-Sessions ueberspringen den Block —
              eine PowerShell konsumiert keinen Praeambel-Text. */}
          {type !== 'docs-sync' &&
            type !== 'terminal' &&
            ((onDemandStatus !== null && onDemandStatus.length > 0) || onDemandLoading) && (
              <div className="td-field">
                <span>Kontext laden</span>
                <div className="td-docs-sync-list">
                  {onDemandLoading && (!onDemandStatus || onDemandStatus.length === 0) && (
                    <div className="td-docs-sync-row">
                      <span className="td-docs-sync-state td-docs-sync-state-loading">
                        On-Demand-Files werden geladen…
                      </span>
                    </div>
                  )}
                  {onDemandStatus &&
                    sortOnDemandByState(onDemandStatus).map((file) => {
                      const checked = onDemandSelection.has(file.sourcePath);
                      const canSelect =
                        file.state === 'fresh' || file.state === 'stale';
                      return (
                        <label
                          key={file.sourcePath}
                          className={`td-docs-sync-row${checked ? ' selected' : ''}`}
                          title={file.sourcePath}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canSelect}
                            onChange={() => toggleOnDemandFile(file.sourcePath)}
                          />
                          <span className="td-docs-sync-name">{file.name}</span>
                          <OnDemandStatusBadge status={file} />
                        </label>
                      );
                    })}
                </div>
                <span className="td-form-meta td-docs-sync-hint">
                  Ausgewählte Summaries werden als Präambel in die Session
                  geladen. Fehlende oder veraltete Summaries erzeugen eine
                  neue Docs-Sync-Session.
                </span>
              </div>
            )}

          {type === 'feature' && nextSeasonPreview !== null && (
            <div className="td-field td-form-hint">
              <span />
              <span className="td-form-meta">
                Diese Season wäre <strong>#{nextSeasonPreview}</strong>.
              </span>
            </div>
          )}

          {/* Phase-2 Season-31: Terminal-Sessions kennen kein Modell — die
              Shell ignoriert --model. Statt das Feld leer zu rendern, blenden
              wir es komplett aus; das Submit setzt den Schema-Pflicht-Wert
              ueber einen Sentinel-String, den der Spawn-Branch in pty.ts
              ignoriert (current_model wird dort auf null geschrieben). */}
          {type !== 'terminal' && (
            <label className="td-field">
              <span>Modell</span>
              <select
                value={resolveModelSelectValue(model, modelOptions)}
                onChange={(e) => setModel(e.target.value)}
              >
                {modelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}{opt.isCustom ? ' · custom' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Season 37 (Worktree-Support): optionaler Block, eine Session in
              einem eigenen Git-Worktree (paralleler Branch im Sibling-Ordner)
              laufen zu lassen. Nicht fuer Terminal-Quick-Shells. */}
          {type !== 'terminal' && (
            <div className="td-field td-worktree-field">
              <label className="td-worktree-toggle">
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={(e) => setWorktreeEnabled(e.target.checked)}
                />
                <span>In Git-Worktree arbeiten</span>
              </label>
              {worktreeEnabled && (
                <div className="td-worktree-block">
                  {worktreeLoading && !worktreeGit && (
                    <span className="td-form-meta">Branches werden geladen…</span>
                  )}
                  {worktreeGit && !worktreeGit.hasGit && (
                    <span className="td-form-meta td-worktree-warn">
                      Dieses Projekt ist kein Git-Repository — Worktree nicht möglich.
                    </span>
                  )}
                  {worktreeGit?.hasGit && (
                    <>
                      <div className="td-radio-row td-worktree-mode">
                        <button
                          type="button"
                          className={`td-radio ${worktreeMode === 'new' ? 'active' : ''}`}
                          onClick={() => setWorktreeMode('new')}
                        >
                          Neuer Branch
                        </button>
                        <button
                          type="button"
                          className={`td-radio ${worktreeMode === 'existing' ? 'active' : ''}`}
                          onClick={() => setWorktreeMode('existing')}
                        >
                          Bestehender Branch
                        </button>
                      </div>
                      {worktreeMode === 'new' ? (
                        <>
                          <input
                            type="text"
                            value={worktreeBranchNew}
                            onChange={(e) => setWorktreeBranchNew(e.target.value)}
                            placeholder="z.B. experiment/foo"
                            maxLength={100}
                          />
                          <span className="td-form-meta">
                            Neuer Branch, abgezweigt von{' '}
                            <code>{worktreeGit.current || 'HEAD'}</code>.
                            {worktreeBranchNew.trim().length > 0 && (
                              <>
                                {' '}Branch:{' '}
                                <code>{sanitizeBranchName(worktreeBranchNew)}</code>
                              </>
                            )}
                          </span>
                        </>
                      ) : existingBranchOptions.length > 0 ? (
                        <>
                          <select
                            value={worktreeBranchExisting}
                            onChange={(e) => setWorktreeBranchExisting(e.target.value)}
                          >
                            {existingBranchOptions.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                          <span className="td-form-meta">
                            Bestehender Branch wird in einen eigenen Worktree
                            ausgecheckt.
                          </span>
                        </>
                      ) : (
                        <span className="td-form-meta td-worktree-warn">
                          Kein freier Branch — alle sind bereits ausgecheckt.
                        </span>
                      )}
                      {linkedWorktrees.length > 0 && (
                        <div className="td-worktree-existing">
                          <span className="td-form-meta">Bestehende Worktrees:</span>
                          <ul>
                            {linkedWorktrees.map((w) => (
                              <li key={w.path} title={w.path}>
                                <code>{w.branch ?? '(detached)'}</code>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

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

// Status-Badge fuer eine einzelne Doku-Datei. Vier Zustaende:
//   - missing-source: Original-Datei fehlt im Projekt
//   - missing-summary: Original existiert, Summary noch nicht
//   - stale: Original wurde seit der letzten Sync veraendert
//   - fresh: Hash-Match, Summary ist aktuell
// Bei laufendem IPC-Call zeigen wir „lädt…" als Platzhalter.
function DocsSyncStatusBadge({
  status,
  loading,
}: {
  status: DocsSyncFileStatus | undefined;
  loading: boolean;
}) {
  if (loading || !status) {
    return <span className="td-docs-sync-state td-docs-sync-state-loading">lädt…</span>;
  }
  switch (status.state) {
    case 'fresh':
      return (
        <span
          className="td-docs-sync-state td-docs-sync-state-fresh"
          title={status.summarizedAt ? `Zuletzt: ${formatSummaryTimestamp(status.summarizedAt)}` : undefined}
        >
          ✅ aktuell
        </span>
      );
    case 'stale':
      return (
        <span
          className="td-docs-sync-state td-docs-sync-state-stale"
          title={status.summarizedAt ? `Zuletzt: ${formatSummaryTimestamp(status.summarizedAt)}` : undefined}
        >
          🟡 veraltet
        </span>
      );
    case 'missing-summary':
      return (
        <span className="td-docs-sync-state td-docs-sync-state-missing">
          ⛔ keine Summary
        </span>
      );
    case 'missing-source':
      return (
        <span className="td-docs-sync-state td-docs-sync-state-missing">
          ⚠️ Datei fehlt
        </span>
      );
    default:
      // Defensiv: ein unbekannter State aus dem IPC (z.B. nach Schema-Erweiterung
      // im Main ohne Renderer-Sync) zeigt einen neutralen Marker statt nichts.
      return (
        <span className="td-docs-sync-state td-docs-sync-state-missing">
          ❔ unbekannt
        </span>
      );
  }
}

// ISO-8601 → lesbares Datum (z.B. „2026-05-17"). Bei unparsbaren Strings den
// rohen Wert zeigen — das passiert nur, wenn Claude den Frontmatter mit einem
// abweichenden Format geschrieben hat (defensiv).
function formatSummaryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

// Phase-2 Season-22: Sortier-Reihenfolge fuer den On-Demand-Block. Stable
// sort entlang der Status-Prioritaet: fresh zuerst (laedt sofort), stale
// danach (sichtbar als „kann veraltet sein"), missing-summary als Hinweis
// „lohnt eine Docs-Sync", missing-source ganz nach hinten (Datei existiert
// nicht mehr im Projekt). Innerhalb derselben Status-Gruppe bleibt die
// CLAUDE.md-Reihenfolge erhalten — das ist die User-definierte Prioritaet.
const STATE_ORDER: Record<DocsOnDemandFileStatus['state'], number> = {
  fresh: 0,
  stale: 1,
  'missing-summary': 2,
  'missing-source': 3,
};

function sortOnDemandByState(
  files: DocsOnDemandFileStatus[],
): DocsOnDemandFileStatus[] {
  return [...files].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

// Phase-2 Season-22: Status-Marker fuer den On-Demand-Block. Vier Zustaende
// analog zum Docs-Sync-Badge, aber mit eigener Wortwahl, weil die Bedeutung
// hier „kann ich als Praeambel laden?" ist, nicht „muss ich neu syncen?".
function OnDemandStatusBadge({ status }: { status: DocsOnDemandFileStatus }) {
  switch (status.state) {
    case 'fresh':
      return (
        <span
          className="td-docs-sync-state td-docs-sync-state-fresh"
          title={status.summarizedAt ? `Zuletzt: ${formatSummaryTimestamp(status.summarizedAt)}` : undefined}
        >
          ✅ Summary aktuell
        </span>
      );
    case 'stale':
      return (
        <span
          className="td-docs-sync-state td-docs-sync-state-stale"
          title={status.summarizedAt ? `Zuletzt: ${formatSummaryTimestamp(status.summarizedAt)}` : undefined}
        >
          🟡 Summary veraltet
        </span>
      );
    case 'missing-summary':
      return (
        <span
          className="td-docs-sync-state td-docs-sync-state-missing"
          title="Noch keine Summary — eine Docs-Sync-Session anlegen, um sie zu erzeugen."
        >
          ⛔ keine Summary
        </span>
      );
    case 'missing-source':
      return (
        <span
          className="td-docs-sync-state td-docs-sync-state-missing"
          title="Die in CLAUDE.md referenzierte Datei existiert nicht im Projekt."
        >
          ⚠️ Datei fehlt
        </span>
      );
    default:
      // Defensiv: unbekannter State aus dem IPC -> neutraler Marker statt nichts.
      return (
        <span className="td-docs-sync-state td-docs-sync-state-missing">
          ❔ unbekannt
        </span>
      );
  }
}
