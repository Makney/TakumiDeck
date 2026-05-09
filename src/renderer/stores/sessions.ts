import { create } from 'zustand';
import type { SessionStatus, SessionType } from '@shared/types';

// Renderer-State der aktiven Tabs (Zustand-Store, Sprint 3).
//
// Wichtig: sessionId wird in addTab() generiert, NICHT im TerminalTab-useEffect — sonst
// würde React StrictMode beim Double-Mount eine zweite UUID erzeugen und einen zweiten
// claude-Prozess spawnen (die SEASON_LOG.md-Falle aus Sprint 2). Der Store ist die Quelle
// der Wahrheit; TerminalTab bekommt die ID als Prop.
//
// Tab-Persistenz folgt Variante A: alle xterm-Instanzen bleiben dauerhaft mounted; der
// Store hält pro Tab nur Metadaten (status, notesDraft), kein xterm-Objekt.

export interface SessionTab {
  sessionId: string;
  // Sprint-4-Feld: jeder Tab gehört genau einem Projekt. Wird beim addTab gesetzt
  // (entweder aus dem aktiven Projekt der Sidebar oder explizit). Erlaubt der
  // Tab-Bar, beim Wechsel des aktiven Projekts nur die zugehörigen Tabs anzuzeigen.
  projectId: string;
  title: string;
  type: SessionType;
  model: string;
  cwd: string;
  status: SessionStatus;
  // Renderer-Draft der Notizen (vor dem nächsten Debounce-Save).
  notesDraft: string;
  // Server-bestätigter Stand (z.B. nach Resume neu geladen aus DB).
  notesSaved: string;
}

export interface AddTabInput {
  sessionId?: string;
  projectId: string;
  title: string;
  type: SessionType;
  model: string;
  cwd: string;
  initialNotes?: string;
}

interface SessionStoreState {
  tabs: SessionTab[];
  activeId: string | null;

  addTab: (input: AddTabInput) => SessionTab;
  closeTab: (sessionId: string) => void;
  // Setzt den aktiven Tab. `null` blendet alle Terminals aus (Empty-State).
  // Übergebene IDs werden nur akzeptiert, wenn sie existieren — schützt gegen
  // stale Activations nach Tab-Schließen.
  setActive: (sessionId: string | null) => void;
  // Navigations-Methoden nehmen den Projekt-Filter als Argument — der Renderer
  // weiß, welches Projekt gerade aktiv ist, der Store bleibt projekt-agnostisch.
  nextTab: (projectId: string) => void;
  prevTab: (projectId: string) => void;
  setStatus: (sessionId: string, status: SessionStatus) => void;
  setModel: (sessionId: string, model: string) => void;
  setNotesDraft: (sessionId: string, notes: string) => void;
  setNotesSaved: (sessionId: string, notes: string) => void;
}

// Sprint-4-Selector: liefert die Tabs eines Projekts in Insert-Reihenfolge.
// Wird sowohl von der Tab-Bar als auch von Navigations-Helpern unten konsumiert.
export function selectTabsForProject(
  tabs: SessionTab[],
  projectId: string,
): SessionTab[] {
  return tabs.filter((t) => t.projectId === projectId);
}

// Hilfsfunktion: findet den Index, der nach dem Schließen aktiv werden soll.
// Wenn der geschlossene Tab nicht der aktive war, bleibt der aktive bestehen — sonst
// rotiert die Auswahl auf den linken Nachbarn IM SELBEN PROJEKT (oder null, wenn das
// geschlossene Tab das letzte Tab des Projekts war — dann schaltet das Sprint-4-Layout
// auf den Empty-State des aktiven Projekts zurück, statt sichtbar in ein anderes
// Projekt zu springen).
export function pickNextActive(
  tabs: SessionTab[],
  removedSessionId: string,
  previousActiveId: string | null,
): string | null {
  const removed = tabs.find((t) => t.sessionId === removedSessionId);
  if (!removed) return previousActiveId;
  if (previousActiveId !== removedSessionId) return previousActiveId;
  const sameProject = selectTabsForProject(tabs, removed.projectId);
  const removedIndexInProject = sameProject.findIndex((t) => t.sessionId === removedSessionId);
  if (removedIndexInProject < 0 || sameProject.length <= 1) return null;
  const neighbor =
    removedIndexInProject > 0
      ? sameProject[removedIndexInProject - 1]
      : sameProject[removedIndexInProject + 1];
  return neighbor?.sessionId ?? null;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  tabs: [],
  activeId: null,

  addTab: (input) => {
    const sessionId = input.sessionId ?? crypto.randomUUID();
    const tab: SessionTab = {
      sessionId,
      projectId: input.projectId,
      title: input.title,
      type: input.type,
      model: input.model,
      cwd: input.cwd,
      status: 'running',
      notesDraft: input.initialNotes ?? '',
      notesSaved: input.initialNotes ?? '',
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      // Neuer Tab wird automatisch aktiviert — entspricht der UX-Erwartung beim +-Button.
      activeId: sessionId,
    }));
    return tab;
  },

  closeTab: (sessionId) => {
    const { tabs, activeId } = get();
    const nextActive = pickNextActive(tabs, sessionId, activeId);
    set({
      tabs: tabs.filter((t) => t.sessionId !== sessionId),
      activeId: nextActive,
    });
  },

  setActive: (sessionId) => {
    if (sessionId === null) {
      set({ activeId: null });
      return;
    }
    if (!get().tabs.some((t) => t.sessionId === sessionId)) return;
    set({ activeId: sessionId });
  },

  nextTab: (projectId) => {
    const { tabs, activeId } = get();
    const inProject = selectTabsForProject(tabs, projectId);
    if (inProject.length < 2 || activeId == null) return;
    const idx = inProject.findIndex((t) => t.sessionId === activeId);
    if (idx < 0) return;
    const next = inProject[(idx + 1) % inProject.length];
    if (next) set({ activeId: next.sessionId });
  },

  prevTab: (projectId) => {
    const { tabs, activeId } = get();
    const inProject = selectTabsForProject(tabs, projectId);
    if (inProject.length < 2 || activeId == null) return;
    const idx = inProject.findIndex((t) => t.sessionId === activeId);
    if (idx < 0) return;
    const prev = inProject[(idx - 1 + inProject.length) % inProject.length];
    if (prev) set({ activeId: prev.sessionId });
  },

  setStatus: (sessionId, status) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.sessionId === sessionId ? { ...t, status } : t)),
    }));
  },

  setModel: (sessionId, model) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.sessionId === sessionId ? { ...t, model } : t)),
    }));
  },

  setNotesDraft: (sessionId, notes) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.sessionId === sessionId ? { ...t, notesDraft: notes } : t)),
    }));
  },

  setNotesSaved: (sessionId, notes) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId ? { ...t, notesSaved: notes } : t,
      ),
    }));
  },
}));
