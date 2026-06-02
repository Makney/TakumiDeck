import path from 'node:path';

// Season 37 (Worktree-Support): Pure-Helper, der den Ziel-Pfad eines Worktrees
// aus Projekt-Pfad + Branch ableitet. Variante-B-Entscheidung: Worktrees liegen
// als Sibling-Ordner NEBEN dem Projekt (nicht im Projekt selbst), damit der
// Workspace-Scanner, der chokidar-Watcher und die Diff-Ignore-Listen sie nicht
// versehentlich als Teil des Projekts erfassen.
//
// Layout:  <parent>/<projektordner>-worktrees/<branch-slug>
// Beispiel: D:\Projekte\TakumiDeck  +  feature/foo
//        →  D:\Projekte\TakumiDeck-worktrees\feature-foo

// Git-Branch-Namen erlauben Zeichen (z.B. `/`), die kein sauberer Ordnername
// sind. Wir slugifizieren auf [A-Za-z0-9._-], ersetzen alles andere durch '-',
// kollabieren Mehrfach-Bindestriche und trimmen fuehrende/abschliessende '-'.
// Ein leeres Ergebnis faellt auf 'worktree' zurueck (defensiv — der Branch-Name
// ist im Schema bereits min(1), aber ein Name aus reinen Sonderzeichen koennte
// leer slugifizieren).
export function sanitizeBranchForPath(branch: string): string {
  const slug = branch
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'worktree';
}

// Container-Ordner, der alle Worktrees eines Projekts buendelt — Sibling neben
// dem Projekt-Verzeichnis.
export function worktreeContainerDir(projectPath: string): string {
  const parent = path.dirname(projectPath);
  const base = path.basename(projectPath);
  return path.join(parent, `${base}-worktrees`);
}

// Vollstaendiger Worktree-Pfad fuer einen Branch.
export function resolveWorktreePath(projectPath: string, branch: string): string {
  return path.join(worktreeContainerDir(projectPath), sanitizeBranchForPath(branch));
}
