import { create } from 'zustand';
import { useEffect } from 'react';
import type { GitStatusResult } from '@shared/types';
import { useUiStore } from './ui';

// useGitStatusStore (Bereich-PANELS-Review 2.2, Variante A).
//
// Gemeinsamer git:status-Cache pro Projekt. Vorher fetchten EditorPane
// (useGitStatus) UND RightPaneFilesPanel je unabhaengig `git:status` und
// re-fetchten beide bei jedem fs:changed-Push — pro Datei-Event also zwei
// parallele git-Aufrufe fuers selbe Projekt. Jetzt haelt dieser Store den
// Stand zentral; beide Panels lesen daraus und der Fetch laeuft genau einmal.
//
// Konvention wie useUsageStore: das IPC-Setup (Project-Wechsel + fs:changed →
// refresh) macht der Renderer-Bootstrap (App.tsx) einmalig ueber den Hook
// `useGitStatusSync()`. Der Store selbst kennt nur die refresh-Aktion.

export interface GitStatusEntry {
  status: GitStatusResult | null;
  loading: boolean;
  loadError: string | null;
  // false nur bei NOT_A_GIT_REPO; jeder andere Fehler laesst hasGit=true und
  // fuellt loadError (analog zum frueheren useGitStatus-Verhalten).
  hasGit: boolean;
}

// Modul-stabile Konstante fuer Projekte ohne (noch) geladenen Eintrag — wichtig
// fuer referenz-stabile Zustand-Selektoren (kein neues Objekt pro Render).
export const EMPTY_GIT_STATUS_ENTRY: GitStatusEntry = {
  status: null,
  loading: false,
  loadError: null,
  hasGit: true,
};

interface GitStatusStore {
  byProject: Record<string, GitStatusEntry>;
  refresh: (projectId: string) => Promise<void>;
}

// Per-Projekt-Seq-Guard gegen Races: zappt der User schnell zwischen Projekten
// oder feuern mehrere fs:changed-Pushes kurz hintereinander, gewinnt pro
// Projekt nur die juengste Antwort.
const seqByProject = new Map<string, number>();

export const useGitStatusStore = create<GitStatusStore>((set) => ({
  byProject: {},

  refresh: async (projectId: string) => {
    const mySeq = (seqByProject.get(projectId) ?? 0) + 1;
    seqByProject.set(projectId, mySeq);
    set((s) => ({
      byProject: {
        ...s.byProject,
        [projectId]: {
          ...(s.byProject[projectId] ?? EMPTY_GIT_STATUS_ENTRY),
          loading: true,
          loadError: null,
        },
      },
    }));

    let entry: GitStatusEntry;
    try {
      const result = await window.api.git.status({ projectId });
      if (seqByProject.get(projectId) !== mySeq) return; // stale — neuere Anfrage gewann
      if (result.ok) {
        entry = { status: result.data, loading: false, loadError: null, hasGit: true };
      } else if (result.code === 'NOT_A_GIT_REPO') {
        entry = { status: null, loading: false, loadError: null, hasGit: false };
      } else {
        entry = { status: null, loading: false, loadError: result.error, hasGit: true };
      }
    } catch (e) {
      if (seqByProject.get(projectId) !== mySeq) return;
      entry = {
        status: null,
        loading: false,
        loadError: e instanceof Error ? e.message : String(e),
        hasGit: true,
      };
    }

    set((s) => ({ byProject: { ...s.byProject, [projectId]: entry } }));
  },
}));

// Einmalig im App-Bootstrap aufrufen: laedt git:status fuers aktive Projekt und
// re-fetcht bei jedem fs:changed-Push. Dies ist der EINZIGE Schreib-Trigger —
// die Panels lesen nur noch reaktiv aus dem Store.
export function useGitStatusSync(): void {
  const refresh = useGitStatusStore((s) => s.refresh);
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  // Project-Wechsel → git:status fuers neue Projekt laden.
  useEffect(() => {
    if (!activeProjectId) return;
    void refresh(activeProjectId);
  }, [activeProjectId, refresh]);

  // fs:changed-Push aus dem Season-29-Watcher → betroffenes Projekt re-fetchen.
  // Der Main watcht immer nur das aktive Projekt (fs.setWatchedProject), daher
  // traegt der Event genau dessen projectId.
  useEffect(() => {
    return window.api.fs.onChanged((event) => {
      void refresh(event.projectId);
    });
  }, [refresh]);
}
