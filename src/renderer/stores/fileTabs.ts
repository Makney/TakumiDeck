import { create } from 'zustand';

// Datei-Tab-Stack pro Projekt (Sprint 7, Q6 Variante B: Per-Projekt-Stack
// analog Sprint-4-Terminal-Tabs). Diff-Tab ist ein Sonderfall — immer ID 'diff',
// gibt es höchstens einmal pro Projekt, sitzt nach der Tab-Konvention ganz links.
//
// Das Store-Modell:
//   - tabs[projectId] = Stack der Datei-Tabs
//   - activeId[projectId] = welcher Tab im Stack gerade sichtbar ist
//   - savedContent + draftContent pro file-Tab — damit Tab-Wechsel die Edit-
//     History nicht verschluckt (Phase-3-Editor bleibt für jeden Tab gemounted
//     in der RightPane, aber die Inhalte leben hier zentral, sodass der
//     Render-Pfad die Auswahl nur per CSS-Toggle umschaltet).
//
// Persistenz: nur In-Memory beim App-Lauf. Beim App-Restart sind die Datei-Tabs
// weg (genau wie Terminal-Tabs in Sprint 4). DB-Schema-Touch wäre Phase-2-Material.

export type FileTabKind = 'diff' | 'file';

export interface FileTab {
  // Stable Tab-ID. Für 'file' = `file:${relPath}` (eindeutig pro Datei pro Projekt).
  // Für 'diff' = 'diff' (es gibt nur einen pro Projekt).
  id: string;
  kind: FileTabKind;
  // Pflicht für 'file'. Forward-Slash, projekt-relativ. null für 'diff'.
  relPath: string | null;
  // Anzeigename in der Tab-Pille.
  label: string;
  // Setzt der Editor via setDirty, sobald der Buffer vom saved-Stand abweicht.
  // Nur für 'file' relevant; 'diff' ist read-only und immer dirty=false.
  dirty: boolean;
  // Letzter persistierter Inhalt vom Server. Initial null = noch nicht geladen.
  // Nach erfolgreichem fs:read wird der Wert gesetzt; nach fs:write hochgehoben.
  savedContent: string | null;
  // Lade-Status: true zwischen openFile-Aufruf und fs:read-Antwort.
  loading: boolean;
  // fs:read-Fehler (z.B. FS_NOT_FOUND), null wenn sauber geladen.
  loadError: string | null;
}

interface FileTabsState {
  tabs: Record<string, FileTab[]>;
  activeId: Record<string, string | null>;

  // Datei-Tab öffnen oder fokussieren. Wenn schon offen → setActive. Sonst neuen
  // Tab anlegen, fs:read starten, Tab als loading markieren. Resolve nach fs:read.
  openFile: (projectId: string, relPath: string, label: string) => Promise<void>;
  // Diff-Tab öffnen oder fokussieren. Diff-Inhalt liefert Phase 6 dynamisch via
  // git:diff — der Tab selbst hat keinen savedContent.
  openDiffTab: (projectId: string) => void;
  // Tab schließen. Wenn der geschlossene Tab aktiv war, fokussiert die nächste
  // Tab-Position (links davon, fallback rechts, fallback null).
  closeTab: (projectId: string, tabId: string) => void;
  setActive: (projectId: string, tabId: string | null) => void;
  // Wird vom Editor-Component aufgerufen, wenn sich der Dirty-Status ändert
  // (für die M-Pille im Tab).
  setDirty: (projectId: string, tabId: string, dirty: boolean) => void;
  // Nach erfolgreichem fs:write: savedContent hochheben + dirty zurücksetzen.
  setSaved: (projectId: string, tabId: string, content: string) => void;
  // Tab-Bereinigung beim Project-Delete (Phase 2+; Sprint 7 nutzt es nicht aktiv).
  resetProject: (projectId: string) => void;
}

export const useFileTabsStore = create<FileTabsState>((set, get) => ({
  tabs: {},
  activeId: {},

  openFile: async (projectId, relPath, label) => {
    const id = fileTabId(relPath);
    const existing = (get().tabs[projectId] ?? []).find((t) => t.id === id);
    if (existing) {
      // Schon offen → nur fokussieren, kein erneuter fs:read.
      set((state) => ({
        activeId: { ...state.activeId, [projectId]: id },
      }));
      return;
    }
    // Neuen Tab anlegen, sofort als loading markieren.
    const newTab: FileTab = {
      id,
      kind: 'file',
      relPath,
      label,
      dirty: false,
      savedContent: null,
      loading: true,
      loadError: null,
    };
    set((state) => {
      const stack = state.tabs[projectId] ?? [];
      return {
        tabs: { ...state.tabs, [projectId]: [...stack, newTab] },
        activeId: { ...state.activeId, [projectId]: id },
      };
    });
    // fs:read starten. Result landet im Store, wenn der Tab noch existiert
    // (User kann ihn vor der Antwort wieder geschlossen haben).
    const result = await window.api.fs.read({ projectId, relPath });
    const stillExists = (get().tabs[projectId] ?? []).some((t) => t.id === id);
    if (!stillExists) return;
    set((state) => {
      const stack = state.tabs[projectId] ?? [];
      const updated = stack.map((t) =>
        t.id === id
          ? {
              ...t,
              loading: false,
              savedContent: result.ok ? result.data.content : null,
              loadError: result.ok ? null : result.error,
            }
          : t,
      );
      return { tabs: { ...state.tabs, [projectId]: updated } };
    });
  },

  openDiffTab: (projectId) => {
    const stack = get().tabs[projectId] ?? [];
    const exists = stack.some((t) => t.id === 'diff');
    if (exists) {
      set((state) => ({
        activeId: { ...state.activeId, [projectId]: 'diff' },
      }));
      return;
    }
    const diffTab: FileTab = {
      id: 'diff',
      kind: 'diff',
      relPath: null,
      label: 'Diff',
      dirty: false,
      savedContent: null,
      loading: false,
      loadError: null,
    };
    // Diff-Tab IMMER ganz links (Tab-Konvention aus PHASE1.md: „Diff als
    // spezieller Tab (immer ganz links)").
    set((state) => ({
      tabs: { ...state.tabs, [projectId]: [diffTab, ...stack] },
      activeId: { ...state.activeId, [projectId]: 'diff' },
    }));
  },

  closeTab: (projectId, tabId) => {
    const stack = get().tabs[projectId] ?? [];
    const idx = stack.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const wasActive = get().activeId[projectId] === tabId;
    const nextStack = stack.filter((t) => t.id !== tabId);
    let nextActive: string | null = get().activeId[projectId] ?? null;
    if (wasActive) {
      // Nachbar links bevorzugen, sonst rechts, sonst null.
      const neighbor = nextStack[Math.max(0, idx - 1)] ?? nextStack[0] ?? null;
      nextActive = neighbor?.id ?? null;
    }
    set((state) => ({
      tabs: { ...state.tabs, [projectId]: nextStack },
      activeId: { ...state.activeId, [projectId]: nextActive },
    }));
  },

  setActive: (projectId, tabId) => {
    // Idempotent: kein State-Write, wenn der Wert schon stimmt — sonst würde
    // jeder setActive-Trigger eine Re-Render-Kaskade über alle Selectors lösen.
    if (get().activeId[projectId] === tabId) return;
    set((state) => ({
      activeId: { ...state.activeId, [projectId]: tabId },
    }));
  },

  setDirty: (projectId, tabId, dirty) => {
    // Idempotent — KRITISCH: ohne dieses early-return kann der Editor seinen
    // onDirtyChange-Effect in einer Endlosschleife triggern (Render →
    // setDirty(false) → Store-Update → Render → setDirty(false) → ...).
    const stack = get().tabs[projectId];
    if (!stack) return;
    const tab = stack.find((t) => t.id === tabId);
    if (!tab || tab.dirty === dirty) return;
    set((state) => {
      const cur = state.tabs[projectId] ?? [];
      const updated = cur.map((t) => (t.id === tabId ? { ...t, dirty } : t));
      return { tabs: { ...state.tabs, [projectId]: updated } };
    });
  },

  setSaved: (projectId, tabId, content) => {
    // Idempotent: nur schreiben, wenn der Inhalt sich tatsächlich ändert ODER
    // dirty noch true ist (= Save eines unmodifizierten Buffers würde sonst
    // jedes Mal eine sinnlose Store-Mutation auslösen).
    const stack = get().tabs[projectId];
    if (!stack) return;
    const tab = stack.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.savedContent === content && !tab.dirty) return;
    set((state) => {
      const cur = state.tabs[projectId] ?? [];
      const updated = cur.map((t) =>
        t.id === tabId ? { ...t, savedContent: content, dirty: false } : t,
      );
      return { tabs: { ...state.tabs, [projectId]: updated } };
    });
  },

  resetProject: (projectId) => {
    set((state) => {
      const { [projectId]: _drop, ...restTabs } = state.tabs;
      const { [projectId]: _drop2, ...restActive } = state.activeId;
      return { tabs: restTabs, activeId: restActive };
    });
  },
}));

// Stable Tab-ID-Bildung für 'file': Pfad-Prefix + relPath. Damit zwei verschiedene
// Files NIE dieselbe ID kriegen, und das Re-Öffnen desselben Files im selben
// Projekt deterministisch denselben Tab fokussiert.
export function fileTabId(relPath: string): string {
  return `file:${relPath}`;
}
