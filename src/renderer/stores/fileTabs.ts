import { create } from 'zustand';

// Datei-Tab-Stack pro Projekt (Sprint 7, Q6 Variante B: Per-Projekt-Stack
// analog Sprint-4-Terminal-Tabs). Diff-Tab ist ein Sonderfall — immer ID 'diff',
// gibt es höchstens einmal pro Projekt, sitzt nach der Tab-Konvention ganz links.
//
// Sprint 8 (V5-A): Persistenz pro Projekt via localStorage. Nur die Tab-Liste
// (id, kind, relPath, label) + activeId — keine Buffer-Persistenz, savedContent
// wird beim App-Start per fs:read neu geladen. Damit überlebt der Tab-Stack
// einen App-Restart, ohne dass wir Konflikt-UX für extern editierte Files
// brauchen. Das Schema ist versioniert (`v: 1`), damit künftige Schema-Änderungen
// alte Persistenz-Daten still verwerfen können.
//
// Das Store-Modell:
//   - tabs[projectId] = Stack der Datei-Tabs
//   - activeId[projectId] = welcher Tab im Stack gerade sichtbar ist
//   - savedContent + draftContent pro file-Tab — damit Tab-Wechsel die Edit-
//     History nicht verschluckt.

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
  // Sprint 8: localStorage-Hydrate beim App-Start. Re-erzeugt die Tab-Liste pro
  // Projekt und triggert für jeden file-Tab einen fs:read im Hintergrund.
  hydrateFromStorage: () => void;
}

// Persistenz-Layout (Sprint 8). Schema-Version, damit künftige Tab-Felder einen
// klaren Migrations-Pfad haben (alte Daten werden bei Versions-Mismatch verworfen).
const STORAGE_KEY = 'td.fileTabs';
const STORAGE_VERSION = 1;

interface PersistedTab {
  id: string;
  kind: FileTabKind;
  relPath: string | null;
  label: string;
}

interface PersistedSnapshot {
  v: number;
  byProject: Record<
    string,
    {
      tabs: PersistedTab[];
      activeId: string | null;
    }
  >;
}

function readPersisted(): PersistedSnapshot | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== STORAGE_VERSION) return null;
    if (!parsed.byProject || typeof parsed.byProject !== 'object') return null;
    return parsed;
  } catch {
    // Korruptes JSON oder Quota-Fehler — Persistenz ist Komfort, kein
    // Korrektheitsbedarf, also still ignorieren.
    return null;
  }
}

function writePersisted(
  tabs: Record<string, FileTab[]>,
  activeId: Record<string, string | null>,
): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    const byProject: PersistedSnapshot['byProject'] = {};
    for (const [projectId, stack] of Object.entries(tabs)) {
      if (!stack || stack.length === 0) continue;
      byProject[projectId] = {
        tabs: stack.map((t) => ({
          id: t.id,
          kind: t.kind,
          relPath: t.relPath,
          label: t.label,
        })),
        activeId: activeId[projectId] ?? null,
      };
    }
    const snapshot: PersistedSnapshot = { v: STORAGE_VERSION, byProject };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // localStorage kann in seltenen Edge-Cases failen — still ignorieren.
  }
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
      persistCurrent(get);
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
    persistCurrent(get);
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
      persistCurrent(get);
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
    persistCurrent(get);
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
    persistCurrent(get);
  },

  setActive: (projectId, tabId) => {
    // Idempotent: kein State-Write, wenn der Wert schon stimmt — sonst würde
    // jeder setActive-Trigger eine Re-Render-Kaskade über alle Selectors lösen.
    if (get().activeId[projectId] === tabId) return;
    set((state) => ({
      activeId: { ...state.activeId, [projectId]: tabId },
    }));
    persistCurrent(get);
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
    // Dirty-Status wird NICHT persistiert — nach Restart sind Buffer eh leer.
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
    persistCurrent(get);
  },

  hydrateFromStorage: () => {
    const snapshot = readPersisted();
    if (!snapshot) return;
    // Hydrate-Semantik: nur leere Stores befüllen. Wenn der Store schon Tabs
    // hat (Hot-Reload, doppelter Hydrate-Call), nichts überschreiben.
    if (Object.keys(get().tabs).length > 0) return;

    const tabs: Record<string, FileTab[]> = {};
    const activeId: Record<string, string | null> = {};
    const filesToLoad: Array<{ projectId: string; tabId: string; relPath: string }> = [];

    for (const [projectId, entry] of Object.entries(snapshot.byProject)) {
      if (!Array.isArray(entry.tabs) || entry.tabs.length === 0) continue;
      const stack: FileTab[] = entry.tabs
        .filter((t) => t && (t.kind === 'diff' || (t.kind === 'file' && typeof t.relPath === 'string')))
        .map((t) => ({
          id: t.id,
          kind: t.kind,
          relPath: t.relPath,
          label: t.label,
          dirty: false,
          savedContent: null,
          // file-Tabs müssen ihren Inhalt beim Re-Open neu laden (V5-A: keine
          // Buffer-Persistenz). loading=true sorgt dafür, dass der Editor während
          // des fs:read den Skeleton zeigt.
          loading: t.kind === 'file',
          loadError: null,
        }));
      if (stack.length === 0) continue;
      tabs[projectId] = stack;
      // activeId nur übernehmen, wenn er noch zur Tab-Liste passt — sonst null.
      const persistedActive = entry.activeId;
      activeId[projectId] =
        persistedActive && stack.some((t) => t.id === persistedActive)
          ? persistedActive
          : stack[0]?.id ?? null;
      // file-Tabs für den Hintergrund-Re-Load notieren.
      for (const t of stack) {
        if (t.kind === 'file' && t.relPath) {
          filesToLoad.push({ projectId, tabId: t.id, relPath: t.relPath });
        }
      }
    }
    set({ tabs, activeId });

    // fs:read pro file-Tab im Hintergrund. Wenn der Tab inzwischen geschlossen
    // wurde (User schnell), wird das Result still verworfen.
    if (typeof window === 'undefined' || typeof window.api === 'undefined') return;
    for (const job of filesToLoad) {
      void window.api.fs
        .read({ projectId: job.projectId, relPath: job.relPath })
        .then((result) => {
          const stack = get().tabs[job.projectId];
          if (!stack || !stack.some((t) => t.id === job.tabId)) return;
          set((state) => {
            const cur = state.tabs[job.projectId] ?? [];
            const updated = cur.map((t) =>
              t.id === job.tabId
                ? {
                    ...t,
                    loading: false,
                    savedContent: result.ok ? result.data.content : null,
                    loadError: result.ok ? null : result.error,
                  }
                : t,
            );
            return { tabs: { ...state.tabs, [job.projectId]: updated } };
          });
        })
        .catch((e) => {
          // Ein hard-Fehler im fs:read bleibt loading=true — der Editor zeigt
          // dann ewig Skeleton, was UX-bremsend ist. Wir setzen loadError
          // explizit, damit der Editor einen Hinweis rendert.
          const stack = get().tabs[job.projectId];
          if (!stack || !stack.some((t) => t.id === job.tabId)) return;
          set((state) => {
            const cur = state.tabs[job.projectId] ?? [];
            const updated = cur.map((t) =>
              t.id === job.tabId
                ? {
                    ...t,
                    loading: false,
                    loadError: e instanceof Error ? e.message : String(e),
                  }
                : t,
            );
            return { tabs: { ...state.tabs, [job.projectId]: updated } };
          });
        });
    }
  },
}));

// Hilfsfunktion: aktuellen Store-Stand persistieren. Aufruf nach jeder Mutation,
// die die Tab-Identität / Reihenfolge / Active-Pointer ändert.
function persistCurrent(getter: () => FileTabsState): void {
  const state = getter();
  writePersisted(state.tabs, state.activeId);
}

// Stable Tab-ID-Bildung für 'file': Pfad-Prefix + relPath. Damit zwei verschiedene
// Files NIE dieselbe ID kriegen, und das Re-Öffnen desselben Files im selben
// Projekt deterministisch denselben Tab fokussiert.
export function fileTabId(relPath: string): string {
  return `file:${relPath}`;
}

// Test-Helper: localStorage-Persistenz manuell auslesen (für Hydrate-Tests).
export const __testing = {
  STORAGE_KEY,
  STORAGE_VERSION,
  readPersisted,
};
