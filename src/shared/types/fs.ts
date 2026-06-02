// Filesystem: Datei-Browser-Tree, read/write, Screenshots, Watcher, Ordner-Picker.

// Hierarchischer Tree-Knoten für den Right-Pane-Datei-Browser. Verzeichnisse
// haben children (rekursiv); Files haben kein children-Feld. Pfade sind
// Forward-Slash-getrennt und projekt-relativ — der Renderer gibt sie 1:1 an
// fs:read zurück, wenn der User auf eine Datei klickt.
export interface FsTreeNode {
  name: string;
  relPath: string;
  kind: 'file' | 'dir';
  // Pflicht bei kind=dir; optional bei file (= immer leer/undefined). Leeres
  // children-Array bei dir bedeutet entweder echtes Leere-Verzeichnis ODER
  // dass die maxDepth des Scans erreicht wurde — Renderer kann das nicht
  // unterscheiden, was im MVP akzeptabel ist.
  children?: FsTreeNode[];
}

export interface FsListTreeInput {
  projectId: string;
  // Optional: Tiefe override. Default 5 (gleiches Limit wie Workspace-Scanner).
  maxDepth?: number;
}

// --- Filesystem read/write (Sprint 7) ---------------------------------

export interface FsReadInput {
  projectId: string;
  relPath: string;
}

export interface FsWriteInput {
  projectId: string;
  relPath: string;
  content: string;
}

// Season 37 (Worktree-Support): liest eine Datei aus dem Worktree-Verzeichnis
// einer Session (statt aus dem Projekt-Root). Der Worktree-Diff-Modus im
// DiffViewer braucht den Working-Tree-Stand des Worktrees als „doc"-Seite.
// Server resolved sessionId → sessions.worktree_path; Renderer schickt nie
// einen freien Pfad. Ergebnis ist ein FsReadResult wie bei fs:read.
export interface FsReadWorktreeInput {
  sessionId: string;
  relPath: string;
}

export interface FsReadResult {
  // Voller Datei-Inhalt (UTF-8). Editor lädt diesen als Initial-Content.
  content: string;
  // Pfad relativ zum Projekt — Renderer behält ihn im Tab-State.
  relPath: string;
  // Absoluter Pfad (für Hover/Title-Anzeige); nie zur Re-Identifikation nutzen,
  // weil dasselbe File zwei Project-Backings haben kann.
  absolutePath: string;
}

export interface FsWriteResult {
  // Bytes geschrieben (UTF-8-Länge). Renderer nutzt das als Bestätigung, nicht
  // semantisch — der wichtige Effekt ist der Save selbst.
  bytesWritten: number;
}

// Phase-2 Season-2: Screenshot-Drop. Renderer übergibt Mime + base64-Bytes,
// Main schreibt die Datei in <userData>/screenshots/ und liefert den
// absoluten Pfad zurück, der dann ins Terminal gepastet wird.
export interface FsSaveScreenshotInput {
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  base64: string;
}

export interface FsSaveScreenshotResult {
  absolutePath: string;
  fileName: string;
  bytesWritten: number;
}

// Phase-2 Season-17: Summary fuer den Settings-Manual-Clear-Block (vor und
// nach dem Klick).
export interface FsScreenshotsSummaryResult {
  fileCount: number;
  totalBytes: number;
}

// Phase-2 Season-17: Bilanz nach Manual-Clear. `failures` zaehlt Einzel-Files,
// die der unlink-Pass nicht losgeworden ist (z.B. EBUSY), damit das UI eine
// dezente Warnung zeigen kann.
export interface FsClearScreenshotsResult {
  filesDeleted: number;
  bytesFreed: number;
  failures: number;
}

// Phase-2 Season-29 (Multi-Tab-Diff Auto-Refresh): Renderer-Signal an den
// Main, welches Projekt aktuell beobachtet werden soll. Pro App-Instanz
// laeuft genau ein chokidar-Watcher auf dem Projekt-Root; ein Wechsel der
// activeProjectId stoppt den alten Watcher und startet einen neuen. null
// stoppt nur. Bei has_git=0-Projekten startet der Watcher trotzdem — der
// Auto-Refresh ist nicht Git-spezifisch, sondern reagiert auf jede Datei-
// Aenderung im Working-Tree.
export interface FsSetWatchedProjectInput {
  projectId: string | null;
}

// Phase-2 Season-29: Push vom Main an den Renderer, wenn der chokidar-
// Watcher Aenderungen im aktiven Projekt detektiert hat. Liste der
// betroffenen Pfade (projektrelativ, Forward-Slash) plus die projectId,
// damit der Renderer einen stale Push aus einem laengst gewechselten
// Projekt verwerfen kann. Debounce 200 ms auf Main-Seite — bei einem
// Editor-Save kommen oft mehrere chokidar-Events binnen 50 ms, die zu
// einem einzigen Push gebuendelt werden.
export interface FsChangedEvent {
  projectId: string;
  paths: string[];
}

// Phase-2 Season-18: Ordner-Picker fuer den First-Start-Workspace-Wizard.
// `title` ist optional; wenn weg, nimmt der Handler einen Default. Es gibt
// bewusst kein `defaultPath` — der Wizard waehlt typischerweise sowieso
// einen frischen Pfad, und im Renderer wuerden Path-Pre-Fills die Sandbox-
// Grenze unnoetig aufweichen.
export interface AppPickFolderInput {
  title?: string;
}

// `canceled=true` heisst der User hat den Dialog geschlossen; `path` ist dann
// `null`. Im Erfolgsfall liefert `path` einen absoluten Pfad zurueck.
export interface AppPickFolderResult {
  canceled: boolean;
  path: string | null;
}
