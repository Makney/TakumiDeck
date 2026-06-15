import type {
  GitBranchInfo,
  GitBranchOverviewResult,
  GitBranchTrackInfo,
  GitWorktreeEntry,
} from '@shared/types';

// Season 38 (Pull/Fetch/Branch-Switch): Pure-Helper rund um die Branch-
// Uebersicht. Bewusst getrennt vom simple-git-Driver, damit Parser + Aggregation
// ohne realen Git-Roundtrip testbar bleiben (Pattern wie parseWorktreeListPorcelain).

// Parst eine einzelne `git for-each-ref`-Zeile im Format
//   <name>\t<upstream>\t<track>
// wobei <track> z.B. "[ahead 1]", "[behind 2]", "[ahead 1, behind 2]", "[gone]"
// oder leer ist. Liefert null fuer Leerzeilen / Zeilen ohne Namen.
export function parseBranchTrackLine(line: string): GitBranchTrackInfo | null {
  const trimmed = line.replace(/\r$/, '');
  if (trimmed.trim().length === 0) return null;
  // Genau zwei Tab-Trenner → drei Felder. Fehlende Trailing-Felder sind leer.
  const parts = trimmed.split('\t');
  const name = (parts[0] ?? '').trim();
  if (name.length === 0) return null;
  const upstreamRaw = (parts[1] ?? '').trim();
  const trackRaw = parts[2] ?? '';
  const aheadMatch = /ahead (\d+)/.exec(trackRaw);
  const behindMatch = /behind (\d+)/.exec(trackRaw);
  return {
    name,
    // Kein Upstream gesetzt → leeres Feld → null. "[gone]" laesst den Upstream-
    // Namen trotzdem gesetzt (Remote-Branch wurde geloescht, Tracking bleibt).
    upstream: upstreamRaw.length > 0 ? upstreamRaw : null,
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1] ?? '0', 10) : 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1] ?? '0', 10) : 0,
  };
}

// Parst die komplette `git for-each-ref`-Ausgabe (mehrere Zeilen). Exportiert
// fuer Tests + den Driver.
export function parseBranchTrackLines(raw: string): GitBranchTrackInfo[] {
  const out: GitBranchTrackInfo[] = [];
  for (const line of raw.split('\n')) {
    const parsed = parseBranchTrackLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

// Baut die Branch-Uebersicht fuer die IPC-Antwort aus den drei Roh-Quellen:
//   - current/mainClean kommen aus dem status()-Aufruf (Haupt-Checkout)
//   - track:    per-Branch Upstream + ahead/behind (for-each-ref)
//   - worktrees: um zu markieren, welcher Branch in einem Linked-Worktree belegt ist
//   - hasRemote: ob ueberhaupt ein Remote konfiguriert ist
//
// detached wird abgeleitet: steht der current-String fuer keinen lokalen Branch,
// ist HEAD detached (status() liefert dann eine Short-SHA als „branch").
export function buildBranchOverview(args: {
  current: string;
  mainClean: boolean;
  hasRemote: boolean;
  track: GitBranchTrackInfo[];
  worktrees: GitWorktreeEntry[];
}): GitBranchOverviewResult {
  const { current, mainClean, hasRemote, track, worktrees } = args;
  // Linked-Worktrees (isMain=false) belegen ihren Branch — Map name → Pfad.
  const linkedByBranch = new Map<string, string>();
  for (const wt of worktrees) {
    if (!wt.isMain && wt.branch !== null) {
      linkedByBranch.set(wt.branch, wt.path);
    }
  }
  const branches: GitBranchInfo[] = track
    .map((t) => ({
      name: t.name,
      isCurrent: t.name === current,
      upstream: t.upstream,
      ahead: t.ahead,
      behind: t.behind,
      checkedOutPath: linkedByBranch.get(t.name) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const detached = !track.some((t) => t.name === current);
  return {
    hasGit: true,
    current,
    detached,
    mainClean,
    hasRemote,
    branches,
  };
}
