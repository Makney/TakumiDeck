// Reine Entscheidungslogik fuer den mousedown-Handler des Terminal-Panes
// (TerminalTab.handleHostMouseDown). Ausgelagert, damit das Verhalten ohne
// xterm-/React-Mount testbar bleibt — analog zum terminalDropHandler.
//
// Bugfix 2026-06-15: Das Kontextmenue wird IM Pane-Div gerendert, also bubbelt
// der mousedown eines Menuepunkts bis zum Pane-Handler hoch. Schloss der
// Handler das Menue dort (setContextMenu(null)), war der Button im folgenden
// click-Event bereits ausgehaengt — Kopieren/Einfuegen feuerte nie. Deshalb
// muss ein Klick INNERHALB des Menues den Handler komplett aussteigen lassen;
// das Aussen-Klick-Schliessen erledigt der Capture-Listener im
// TerminalContextMenu selbst.

export interface HostMouseDownInput {
  // true, wenn das Event-Ziel im Kontextmenue (.td-terminal-context-menu) liegt.
  targetInContextMenu: boolean;
  // true, wenn das Kontextmenue gerade offen ist.
  contextMenuOpen: boolean;
  // MouseEvent.button — 0 = links.
  button: number;
}

// 'ignore'  → nichts tun, Klick durchlassen (Menuepunkt-Klick → onClick feuert).
// 'dismiss' → Menue schliessen, kein Fokus-Fang.
// 'focus'   → xterm-Fokus zurueckholen (Klick ins Terminal/Padding).
export type HostMouseDownAction = 'ignore' | 'dismiss' | 'focus';

export function decideHostMouseDown(input: HostMouseDownInput): HostMouseDownAction {
  if (input.targetInContextMenu) return 'ignore';
  if (input.contextMenuOpen && input.button === 0) return 'dismiss';
  return 'focus';
}
