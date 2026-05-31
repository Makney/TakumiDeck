import { create } from 'zustand';
import type { SessionStatus, SessionType } from '@shared/types';
import { useUsageStore } from './usage';

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
  // Phase-2 Season-5: bei type='custom' die User-definierte Bezeichnung, sonst null.
  // TerminalTab schickt das Feld beim Spawn an pty:create durch.
  customTypeLabel: string | null;
  model: string;
  status: SessionStatus;
  // Renderer-Draft der Notizen (vor dem nächsten Debounce-Save).
  notesDraft: string;
  // Server-bestätigter Stand (z.B. nach Resume neu geladen aus DB).
  notesSaved: string;
  // Phase-2 Season-28: True, sobald die PTY ein BEL (\a) abgesetzt hat,
  // während der Tab inaktiv war. Die Tab-Pille zeigt dann einen Pulse-
  // Marker, bis der User den Tab aktiviert — dann automatisch gelöscht
  // (siehe TabContainer.setActive). Damit erfährt der User, dass ein
  // Hintergrund-Tab Aufmerksamkeit will (Claude-Permission, Build fertig).
  hasBell: boolean;
  // Bugfix v0.3.2 (Variante B aus v0.2.0-TECH_SCHULDEN): Spawn-Tracking pro Tab
  // im Store statt im TabContainer-lokalen State. needsSpawn markiert eine frisch
  // ueber NewSessionModal erstellte Session, die noch ein pty:create braucht;
  // Resume aus dem Verlauf laesst das Feld auf false und ueberspringt den Spawn.
  // Vorteil gegenueber dem v0.2.1-Fix: closeTab raeumt das Feld automatisch mit
  // auf — egal ob ueber Tab-Bar-x oder LeftSidebar-x geschlossen wird.
  needsSpawn: boolean;
  // Phase-2 Season-21 (in den Store gehoben mit v0.3.2): one-shot Prompt fuer
  // Docs-Sync-Sessions. TerminalTab pastet ihn nach erfolgreichem Spawn einmalig
  // und ruft consumeInitialPrompt, das das Feld auf null setzt.
  initialPrompt: string | null;
}

export interface AddTabInput {
  sessionId?: string;
  projectId: string;
  title: string;
  type: SessionType;
  model: string;
  initialNotes?: string;
  // Phase-2 Season-5: bei type='custom' Pflicht-Bezeichnung. Bei den vier festen
  // Typen weglassen — der Store setzt dann null.
  customTypeLabel?: string | null;
  // Bugfix v0.3.2: NewSessionModal setzt true, Resume-Pfade (HistoryPane,
  // HistoryActionModal, LeftSidebar) lassen das Feld weg (Default false).
  needsSpawn?: boolean;
  // Phase-2 Season-21: Docs-Sync-Sessions geben hier den vorbereiteten Prompt
  // mit, der nach erfolgreichem Spawn einmalig gepastet wird.
  initialPrompt?: string | null;
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
  // Phase-2 Season-28: Bell-Marker setzen oder löschen. setBell(true) wird vom
  // onBell-Handler im TerminalTab gerufen (nur für inaktive Tabs); clearBell
  // läuft beim Tab-Aktivieren.
  setBell: (sessionId: string, hasBell: boolean) => void;
  // Bugfix v0.3.2: TerminalTab ruft das nach einmaligem Paste des Initial-Prompts,
  // damit ein erneutes Tab-Mount (StrictMode, React-Tree-Repaint) den Prompt nicht
  // erneut sendet. Idempotent — bei bereits null gibt's keinen State-Update.
  consumeInitialPrompt: (sessionId: string) => void;
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
    // Dedupe-Guard: liefert ein Caller versehentlich dieselbe externe sessionId
    // ein zweites Mal (z.B. Resume-Flow ohne ref-guard), würden zwei Tabs mit
    // gleicher ID entstehen. Alle ID-basierten Lookups (setStatus, closeTab,
    // setNotesDraft) treffen dann nur den ersten Match — der zweite wäre Geist-Tab.
    // Stattdessen den existierenden Tab fokussieren und zurückgeben.
    const existing = get().tabs.find((t) => t.sessionId === sessionId);
    if (existing) {
      set({ activeId: sessionId });
      return existing;
    }
    const tab: SessionTab = {
      sessionId,
      projectId: input.projectId,
      title: input.title,
      type: input.type,
      customTypeLabel: input.customTypeLabel ?? null,
      model: input.model,
      status: 'running',
      notesDraft: input.initialNotes ?? '',
      notesSaved: input.initialNotes ?? '',
      hasBell: false,
      needsSpawn: input.needsSpawn ?? false,
      initialPrompt: input.initialPrompt ?? null,
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
    // Per-Session-Usage-Kontext mit aufräumen — sonst wächst contextBySession
    // über die App-Lebenszeit mit Einträgen geschlossener Sessions zu.
    useUsageStore.getState().pruneContext(sessionId);
  },

  setActive: (sessionId) => {
    if (sessionId === null) {
      set({ activeId: null });
      return;
    }
    if (!get().tabs.some((t) => t.sessionId === sessionId)) return;
    // Phase-2 Season-28: Bell-Marker des neu aktivierten Tabs löschen — der User
    // schaut jetzt hin, also keine Aufmerksamkeit mehr nötig. Andere Tabs
    // behalten ihren Marker, bis sie selbst aktiviert werden.
    set((s) => ({
      activeId: sessionId,
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId && t.hasBell ? { ...t, hasBell: false } : t,
      ),
    }));
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

  setBell: (sessionId, hasBell) => {
    set((s) => {
      const target = s.tabs.find((t) => t.sessionId === sessionId);
      if (!target || target.hasBell === hasBell) return s;
      return {
        tabs: s.tabs.map((t) =>
          t.sessionId === sessionId ? { ...t, hasBell } : t,
        ),
      };
    });
  },

  consumeInitialPrompt: (sessionId) => {
    set((s) => {
      const target = s.tabs.find((t) => t.sessionId === sessionId);
      if (!target || target.initialPrompt === null) return s;
      return {
        tabs: s.tabs.map((t) =>
          t.sessionId === sessionId ? { ...t, initialPrompt: null } : t,
        ),
      };
    });
  },
}));
