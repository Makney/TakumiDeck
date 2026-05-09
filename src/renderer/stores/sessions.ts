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
  setActive: (sessionId: string) => void;
  nextTab: () => void;
  prevTab: () => void;
  setStatus: (sessionId: string, status: SessionStatus) => void;
  setModel: (sessionId: string, model: string) => void;
  setNotesDraft: (sessionId: string, notes: string) => void;
  setNotesSaved: (sessionId: string, notes: string) => void;
}

// Hilfsfunktion: findet den Index, der nach dem Schließen aktiv werden soll.
// Wenn der geschlossene Tab nicht der aktive war, bleibt der aktive bestehen — sonst
// rotiert die Auswahl auf den linken Nachbarn (oder den ersten, falls am Anfang gelöscht).
function pickNextActive(
  tabs: SessionTab[],
  removedSessionId: string,
  previousActiveId: string | null,
): string | null {
  const removedIndex = tabs.findIndex((t) => t.sessionId === removedSessionId);
  if (removedIndex < 0) return previousActiveId;
  if (previousActiveId !== removedSessionId) return previousActiveId;
  // Aktiver Tab wird geschlossen — Nachbar wählen.
  if (tabs.length <= 1) return null;
  // Linker Nachbar bevorzugt; wenn der entfernte Tab links außen liegt, der rechte.
  const neighbor = removedIndex > 0 ? tabs[removedIndex - 1] : tabs[removedIndex + 1];
  return neighbor?.sessionId ?? null;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  tabs: [],
  activeId: null,

  addTab: (input) => {
    const sessionId = input.sessionId ?? crypto.randomUUID();
    const tab: SessionTab = {
      sessionId,
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
    if (!get().tabs.some((t) => t.sessionId === sessionId)) return;
    set({ activeId: sessionId });
  },

  nextTab: () => {
    const { tabs, activeId } = get();
    if (tabs.length < 2 || activeId == null) return;
    const idx = tabs.findIndex((t) => t.sessionId === activeId);
    if (idx < 0) return;
    const next = tabs[(idx + 1) % tabs.length];
    if (next) set({ activeId: next.sessionId });
  },

  prevTab: () => {
    const { tabs, activeId } = get();
    if (tabs.length < 2 || activeId == null) return;
    const idx = tabs.findIndex((t) => t.sessionId === activeId);
    if (idx < 0) return;
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
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
