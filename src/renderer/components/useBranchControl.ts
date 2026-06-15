import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GitBranchOverviewResult,
  GitCheckoutResult,
  GitFetchResult,
  GitPullResult,
} from '@shared/types';

// Season 38 (Pull/Fetch/Branch-Switch): gemeinsamer Hook fuer die Branch-
// Steuerung des Haupt-Checkouts. Wird vom Sidebar-BranchesPanel und dem
// TitleBar-Dropdown genutzt — beide laden dieselbe Uebersicht und teilen die
// Aktionslogik. UI-Entscheidungen (Stash-Rueckfrage, Konflikt-Anzeige) bleiben
// in den Komponenten; der Hook liefert nur das rohe Ergebnis zurueck.
//
// Synchronisierung ohne geteilten Store: nach einer mutierenden Aktion feuert
// der Hook das bestehende `td-git-refresh`-CustomEvent (TitleBar-Branch-Badge +
// andere Hook-Instanzen laden dann neu) und reloadet die eigene Uebersicht.

export interface BranchControl {
  overview: GitBranchOverviewResult | null;
  loading: boolean;
  error: string | null;
  // True, solange eine mutierende Aktion (Switch/Fetch/Pull) laeuft.
  busy: boolean;
  reload: () => void;
  fetch: () => Promise<GitFetchResult | null>;
  pull: () => Promise<GitPullResult | null>;
  switchTo: (branch: string, autoStash: boolean) => Promise<GitCheckoutResult | null>;
}

// Read-only-Refresh-Signal fuer die Branch-Anzeige (existiert seit Sprint 8 fuer
// die TitleBar). Nach einem Switch/Pull feuern wir es erneut.
function fireGitRefresh() {
  window.dispatchEvent(new CustomEvent('td-git-refresh'));
}

export function useBranchControl(projectId: string | null): BranchControl {
  const [overview, setOverview] = useState<GitBranchOverviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Seq-Guard: bei schnellem Project-Wechsel/Refresh gewinnt der juengste Load.
  const loadSeq = useRef(0);

  const reload = useCallback(() => {
    if (!projectId) {
      setOverview(null);
      setError(null);
      return;
    }
    const mySeq = ++loadSeq.current;
    setLoading(true);
    void window.api.git.branchOverview({ projectId }).then((res) => {
      if (loadSeq.current !== mySeq) return;
      setLoading(false);
      if (res.ok) {
        setOverview(res.data);
        setError(null);
      } else {
        setOverview(null);
        setError(res.error);
      }
    });
  }, [projectId]);

  // Initial + bei Project-Wechsel laden.
  useEffect(() => {
    reload();
  }, [reload]);

  // Auf externes Branch-Refresh-Signal reagieren (z.B. nach einem Switch aus
  // dem TitleBar-Dropdown, waehrend das Sidebar-Panel offen ist).
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener('td-git-refresh', handler);
    return () => window.removeEventListener('td-git-refresh', handler);
  }, [reload]);

  const fetch = useCallback(async (): Promise<GitFetchResult | null> => {
    if (!projectId) return null;
    setBusy(true);
    try {
      const res = await window.api.git.fetch({ projectId });
      if (res.ok) {
        // ahead/behind kann sich geaendert haben → Uebersicht neu laden.
        fireGitRefresh();
        return res.data;
      }
      setError(res.error);
      return null;
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  const pull = useCallback(async (): Promise<GitPullResult | null> => {
    if (!projectId) return null;
    setBusy(true);
    try {
      const res = await window.api.git.pull({ projectId });
      if (res.ok) {
        fireGitRefresh();
        return res.data;
      }
      setError(res.error);
      return null;
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  const switchTo = useCallback(
    async (branch: string, autoStash: boolean): Promise<GitCheckoutResult | null> => {
      if (!projectId) return null;
      setBusy(true);
      try {
        const res = await window.api.git.checkout({ projectId, branch, autoStash });
        if (res.ok) {
          // Nur bei echtem Wechsel das globale Refresh feuern (dirty/elsewhere
          // aendern den Branch nicht).
          if (res.data.status === 'switched') fireGitRefresh();
          return res.data;
        }
        setError(res.error);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [projectId],
  );

  return { overview, loading, error, busy, reload, fetch, pull, switchTo };
}
