// Bridge-API-Shape (window.api) — aggregiert alle Domain-IPC-Verträge.

import type { IpcResult, WindowAction } from './core';
import type { AppSettings, ModelFetchResult } from './settings';
import type {
  PtyCreateInput,
  PtyDataEvent,
  PtyExitEvent,
  PtyKillInput,
  PtyResizeInput,
  PtyTuiStateInput,
  PtyWriteInput,
  SessionArchiveInput,
  SessionCloseInput,
  SessionHistoryEntry,
  SessionHistoryInput,
  SessionResumeInput,
  SessionRow,
  SessionStatusPushEvent,
  SessionUpdateInput,
  TerminalLoadBufferInput,
  TerminalLoadBufferResult,
  TerminalSaveBufferInput,
} from './session';
import type {
  ClaudeMdParseResult,
  ProjectReadCfgInput,
  ProjectRemoveInput,
  ProjectRow,
} from './project';
import type {
  AppPickFolderInput,
  AppPickFolderResult,
  FsChangedEvent,
  FsClearScreenshotsResult,
  FsListTreeInput,
  FsReadInput,
  FsReadResult,
  FsReadWorktreeInput,
  FsSaveScreenshotInput,
  FsSaveScreenshotResult,
  FsScreenshotsSummaryResult,
  FsSetWatchedProjectInput,
  FsTreeNode,
  FsWriteInput,
  FsWriteResult,
} from './fs';
import type {
  GitDiffInput,
  GitDiffResult,
  GitListBranchesInput,
  GitListBranchesResult,
  GitSessionDiffInput,
  GitSessionDiffResult,
  GitShowInput,
  GitShowResult,
  GitShowStagedInput,
  GitShowStagedResult,
  GitStatusInput,
  GitStatusResult,
  GitWorktreeDiffInput,
  GitWorktreeDiffResult,
  GitWorktreeListInput,
  GitWorktreeListResult,
  GitWorktreeRemoveInput,
  GitWorktreeRemoveResult,
  GitWorktreeStatusInput,
  GitWorktreeStatusResult,
} from './git';
import type {
  FsListTemplatesInput,
  TemplateFile,
  TemplatesAllocateSeasonForSessionInput,
  TemplatesAllocateSeasonForSessionResult,
  TemplatesResolveAutoVarsInput,
  TemplatesResolveAutoVarsResult,
} from './templates';
import type {
  DocsOnDemandStatusInput,
  DocsOnDemandStatusResult,
  DocsSyncStatusInput,
  DocsSyncStatusResult,
} from './docs';
import type {
  UsageContextInput,
  UsageContextResult,
  UsageHeatmapResult,
  UsageUpdateEvent,
  UsageWindowInput,
  UsageWindowResult,
} from './usage';
import type {
  StatsHeatmapInput,
  StatsHeatmapResult,
  StatsModelsInput,
  StatsModelsResult,
  StatsOverviewInput,
  StatsOverviewResult,
} from './stats';
import type { UpdaterState, UpdaterStatePushEvent } from './updater';

// Bridge-API-Shape, die der Renderer über window.api erhält.
export interface RendererApi {
  settings: {
    get: () => Promise<IpcResult<AppSettings>>;
    set: (patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>;
  };
  app: {
    getVersion: () => Promise<IpcResult<string>>;
    openDataFolder: () => Promise<IpcResult<string>>;
    // Sprint 8 (Architektur 6.0 Header-Bar): Window-Controls aus dem Renderer
    // triggern, weil die Header-Bar eigene Buttons rendert (-webkit-app-region:
    // no-drag).
    windowAction: (action: WindowAction) => Promise<IpcResult<null>>;
    // Sprint 8: Health-Check für die claude-Binary. Liefert ok=true mit dem
    // resolved-Pfad oder ok=false mit User-freundlicher Hinweistext.
    claudeHealth: () => Promise<
      IpcResult<{ resolved: string; healthy: true } | { resolved: null; healthy: false; hint: string }>
    >;
    // Phase-2 Season-18: generischer Ordner-Picker. Der First-Start-Wizard
    // ruft ihn als ersten Schritt; `canceled=true` heisst der User hat den
    // Dialog geschlossen, ohne einen Pfad zu waehlen — der Wizard bleibt
    // dann offen.
    pickFolder: (input?: AppPickFolderInput) => Promise<IpcResult<AppPickFolderResult>>;
  };
  pty: {
    create: (input: PtyCreateInput) => Promise<IpcResult<SessionRow>>;
    write: (input: PtyWriteInput) => Promise<IpcResult<null>>;
    resize: (input: PtyResizeInput) => Promise<IpcResult<null>>;
    kill: (input: PtyKillInput) => Promise<IpcResult<null>>;
    // Phase-2 Season-1: Renderer pusht TUI-detektierten Status. Rückgabe ist
    // null bei Erfolg (Status gesetzt oder bereits aktuell), Error-Code bei
    // verweigertem Lifecycle-Übergang.
    pushTuiState: (input: PtyTuiStateInput) => Promise<IpcResult<null>>;
    // Listener-Registrierung. Rückgabewert ist die Unsubscribe-Funktion.
    onData: (handler: (event: PtyDataEvent) => void) => () => void;
    onExit: (handler: (event: PtyExitEvent) => void) => () => void;
  };
  sessions: {
    update: (input: SessionUpdateInput) => Promise<IpcResult<SessionRow>>;
    close: (input: SessionCloseInput) => Promise<IpcResult<SessionRow>>;
    resume: (input: SessionResumeInput) => Promise<IpcResult<SessionRow>>;
    history: (input: SessionHistoryInput) => Promise<IpcResult<SessionHistoryEntry[]>>;
    archive: (input: SessionArchiveInput) => Promise<IpcResult<SessionRow>>;
    // Phase-2 Season-1: Main pushed Status-Änderungen aktiv; Renderer-Store
    // abonniert und ruft setStatus auf, ohne selbst pollen zu müssen.
    onStatusPush: (handler: (event: SessionStatusPushEvent) => void) => () => void;
  };
  // Phase-2 Season-33: Terminal-Buffer-Persistierung — eigener Namespace,
  // damit `sessions.*` nicht mit type-spezifischen Calls vermischt wird.
  // Beide Pfade werden im Renderer auf type='terminal' gegated; der Main
  // doppelt das Gate als Defense-in-Depth.
  terminal: {
    saveBuffer: (input: TerminalSaveBufferInput) => Promise<IpcResult<null>>;
    loadBuffer: (input: TerminalLoadBufferInput) => Promise<IpcResult<TerminalLoadBufferResult>>;
  };
  // Phase-2 Season-34 (Variante D): optionaler Abruf der bei Anthropic
  // verfuegbaren Modelle. Liefert `available=false`, wenn kein API-Key gesetzt
  // ist (Abo-/OAuth-Pfad) — kein Fehler, sondern ein Hinweis-Zustand.
  models: {
    fetchAvailable: () => Promise<IpcResult<ModelFetchResult>>;
  };
  templates: {
    // Phase-2 Season-4: Auto-Variablen, die DB- oder FS-Zugriff brauchen.
    // Renderer kombiniert das Ergebnis mit den lokalen Auto-Variablen aus
    // buildAutoVariables() im Modal.
    resolveAutoVars: (
      input: TemplatesResolveAutoVarsInput,
    ) => Promise<IpcResult<TemplatesResolveAutoVarsResult>>;
    // Phase-2 Season-11: vom Templates-Send aufgerufen, wenn das Template
    // {{NEXT_SEASON_NR}} verwendet. Idempotent — gibt die bereits zugewiesene
    // Nummer zurueck, falls die Session schon eine hatte.
    allocateSeasonForSession: (
      input: TemplatesAllocateSeasonForSessionInput,
    ) => Promise<IpcResult<TemplatesAllocateSeasonForSessionResult>>;
  };
  // Phase-2 Season-21: Docs-Sync-Session — Status der vier Doku-Files
  // (CHANGELOG/FEATURES/TECH_SCHULDEN/ENTSCHEIDUNGEN) fuers Modal.
  docs: {
    syncStatus: (input: DocsSyncStatusInput) => Promise<IpcResult<DocsSyncStatusResult>>;
    // Phase-2 Season-22: Status + Body der On-Demand-Files aus CLAUDE.md.
    onDemandStatus: (
      input: DocsOnDemandStatusInput,
    ) => Promise<IpcResult<DocsOnDemandStatusResult>>;
  };
  fs: {
    listTemplates: (input: FsListTemplatesInput) => Promise<IpcResult<TemplateFile[]>>;
    // Sprint 7: Markdown-Editor liest und schreibt nur projekt-relativ.
    read: (input: FsReadInput) => Promise<IpcResult<FsReadResult>>;
    // Season 37 (Worktree-Support): liest eine Datei aus dem Worktree-
    // Verzeichnis einer Session (sessions.worktree_path). „doc"-Seite des
    // Worktree-Diff-Modus im DiffViewer.
    readWorktree: (input: FsReadWorktreeInput) => Promise<IpcResult<FsReadResult>>;
    write: (input: FsWriteInput) => Promise<IpcResult<FsWriteResult>>;
    // Sprint 7, Phase 5: hierarchischer Datei-Browser-Tree für den Right-Pane.
    listTree: (input: FsListTreeInput) => Promise<IpcResult<FsTreeNode[]>>;
    // Phase-2 Season-2: Screenshot ins userData/screenshots/ ablegen,
    // absoluten Pfad zurückbekommen (wird im Terminal als Text gepastet,
    // damit claude-code das Bild via Read-Tool erreichen kann).
    saveScreenshot: (
      input: FsSaveScreenshotInput,
    ) => Promise<IpcResult<FsSaveScreenshotResult>>;
    // Phase-2 Season-17: liefert die aktuelle Anzeige fuer den Settings-
    // Manual-Clear-Block ohne FS-Mutation.
    screenshotsSummary: () => Promise<IpcResult<FsScreenshotsSummaryResult>>;
    // Phase-2 Season-17: loescht alle Files im <userData>/screenshots/.
    // Im UI hinter einem Doppel-Confirm; der IPC selbst hat keinen Confirm-
    // Schritt, der Caller traegt die Verantwortung.
    clearScreenshots: () => Promise<IpcResult<FsClearScreenshotsResult>>;
    // Phase-2 Season-2: Bridge zu Electron's webUtils.getPathForFile —
    // File.path wurde in Electron 32 entfernt. Liefert leeren String,
    // wenn das File keine Disk-Repräsentation hat (z.B. Clipboard-
    // Image oder Browser-Drag).
    getPathForFile: (file: File) => string;
    // Phase-2 Season-29 (Multi-Tab-Diff Auto-Refresh): aktives Projekt
    // beim Main fuer den chokidar-Watcher setzen. Renderer ruft beim
    // Projekt-Wechsel; null stoppt den Watcher.
    setWatchedProject: (input: FsSetWatchedProjectInput) => Promise<IpcResult<null>>;
    // Push-Subscription fuer Datei-Aenderungen im aktiven Projekt.
    // Liefert nur Paths, der Caller refetcht selbst (Diff + Editor).
    onChanged: (handler: (event: FsChangedEvent) => void) => () => void;
  };
  git: {
    // Sprint 7: Branch + geänderte Files für Pre-Commit-Panel + Diff-Tab.
    status: (input: GitStatusInput) => Promise<IpcResult<GitStatusResult>>;
    // Working-Tree-Diff. filePath optional (= ganzer Tree).
    diff: (input: GitDiffInput) => Promise<IpcResult<GitDiffResult>>;
    // Datei-Inhalt am Ref (Default 'HEAD'); für Diff-Viewer (Phase 6).
    show: (input: GitShowInput) => Promise<IpcResult<GitShowResult>>;
    // Phase-2 Season-29 (Multi-Tab-Diff): Index-Version einer Datei
    // (`git show :<relPath>`) fuer den 'staged'-Modus.
    showStaged: (input: GitShowStagedInput) => Promise<IpcResult<GitShowStagedResult>>;
    // Phase-2 Season-29 (Multi-Tab-Diff): Aenderungen seit Session-Start.
    // Main resolved sessions.start_commit_sha + Branch + Diff-Counts.
    sessionDiff: (input: GitSessionDiffInput) => Promise<IpcResult<GitSessionDiffResult>>;
    // Season 37 (Worktree-Support): lokale Branch-Liste fuers Modal-Dropdown.
    listBranches: (input: GitListBranchesInput) => Promise<IpcResult<GitListBranchesResult>>;
    // Season 37: bestehende Worktrees eines Projekts (Uebersicht im Modal).
    worktreeList: (input: GitWorktreeListInput) => Promise<IpcResult<GitWorktreeListResult>>;
    // Season 37: Worktree-Diff vs. Basis-Branch (main/master).
    worktreeDiff: (input: GitWorktreeDiffInput) => Promise<IpcResult<GitWorktreeDiffResult>>;
    // Season 37: Worktree-Cleanup beim Archivieren (mit Dirty-Rueckfrage).
    worktreeRemove: (
      input: GitWorktreeRemoveInput,
    ) => Promise<IpcResult<GitWorktreeRemoveResult>>;
    // Season 37: Working-Tree-Status des Worktrees einer Session (Pre-Commit).
    worktreeStatus: (
      input: GitWorktreeStatusInput,
    ) => Promise<IpcResult<GitWorktreeStatusResult>>;
  };
  projects: {
    list: () => Promise<IpcResult<ProjectRow[]>>;
    // project:add ohne Args → Main öffnet dialog.showOpenDialog selbst und liefert
    // entweder den hinzugefügten Project-Row zurück, oder null bei Cancel, oder ein
    // Result-Err, falls der gewählte Ordner keine CLAUDE.md enthält bzw. der Pfad
    // bereits existiert.
    add: () => Promise<IpcResult<ProjectRow | null>>;
    // Re-Scan des konfigurierten workspace_path. Liefert die finale Liste — neue Projekte
    // wurden bereits in der DB persistiert, der Renderer aktualisiert seinen Store anhand
    // der zurückgegebenen Liste.
    scanWorkspace: () => Promise<IpcResult<ProjectRow[]>>;
    readClaudeMd: (input: ProjectReadCfgInput) => Promise<IpcResult<ClaudeMdParseResult>>;
    // Phase-2 Season-8: Projekt aus der Liste entfernen. Returnt die finale,
    // sortierte Liste (analog scanWorkspace) — der Store ersetzt seinen Stand
    // ohne separaten list-Call. Sessions hängen nach dem Call am Legacy-Bucket.
    remove: (input: ProjectRemoveInput) => Promise<IpcResult<ProjectRow[]>>;
  };
  usage: {
    // 5h / weekly_all / weekly_design / weekly_sonnet etc. — eine Bar pro Aufruf.
    window: (input: UsageWindowInput) => Promise<IpcResult<UsageWindowResult>>;
    // Per-Session-Kontext-Bar.
    context: (input: UsageContextInput) => Promise<IpcResult<UsageContextResult>>;
    // Phase-2-Stub.
    heatmap: () => Promise<IpcResult<UsageHeatmapResult>>;
    // Renderer wird über neue Tokens benachrichtigt: 'global' = bestimmte limit_bar
    // wurde aktualisiert, 'context' = Per-Session-Kontext-Bar wurde aktualisiert.
    onUpdate: (handler: (event: UsageUpdateEvent) => void) => () => void;
  };
  // Phase-2 Season-12: Stats-Cards aus messages + sessions aggregiert.
  // Phase-2 Season-13: Aktivitaets-Heatmap als zweiter Channel parallel.
  // Phase-2 Season-14: Per-Modell-Aufschluesselung als dritter Channel.
  stats: {
    overview: (input: StatsOverviewInput) => Promise<IpcResult<StatsOverviewResult>>;
    heatmap: (input: StatsHeatmapInput) => Promise<IpcResult<StatsHeatmapResult>>;
    models: (input: StatsModelsInput) => Promise<IpcResult<StatsModelsResult>>;
  };
  // Phase-2 Season-26: Auto-Update via electron-updater. `getState` ist der
  // synchrone Mount-Sync (statt nur auf den naechsten Push-Tick zu warten),
  // `check` triggert den manuellen Re-Check aus dem Settings-About-Tab,
  // `startDownload` und `quitAndInstall` werden vom Banner gefeuert.
  updater: {
    getState: () => Promise<IpcResult<UpdaterState>>;
    check: () => Promise<IpcResult<UpdaterState>>;
    startDownload: () => Promise<IpcResult<UpdaterState>>;
    quitAndInstall: () => Promise<IpcResult<null>>;
    onStatePush: (handler: (event: UpdaterStatePushEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
