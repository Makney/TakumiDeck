import { useEffect } from 'react';

// Phase-2 Season-28: Rechtsklick-Kontextmenue. Position kommt von clientX/Y
// des Mouse-Events; das CSS clampt das Menue ans Viewport.
interface TerminalContextMenuProps {
  x: number;
  y: number;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onSearch: () => void;
  onDismiss: () => void;
}

export function TerminalContextMenu({
  x,
  y,
  onCopy,
  onPaste,
  onClear,
  onSearch,
  onDismiss,
}: TerminalContextMenuProps) {
  // Click-Outside + Escape schliessen das Menue. Wir benutzen capture-phase
  // auf document, damit ein Klick auf das Terminal-Pane sicher erfasst wird,
  // bevor das pane-handleHostMouseDown den Fokus zurueckholt.
  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest('.td-terminal-context-menu')) return;
      onDismiss();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);
  return (
    <ul
      className="td-terminal-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <li>
        <button type="button" onClick={onCopy} role="menuitem">
          Kopieren <span className="td-shortcut-hint">Ctrl+Shift+C</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onPaste} role="menuitem">
          Einfuegen <span className="td-shortcut-hint">Ctrl+Shift+V</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onSearch} role="menuitem">
          Suchen … <span className="td-shortcut-hint">Ctrl+Shift+F</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onClear} role="menuitem">
          Buffer leeren <span className="td-shortcut-hint">Ctrl+Shift+L</span>
        </button>
      </li>
    </ul>
  );
}
