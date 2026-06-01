import { useCallback, useState, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';

// Phase-2 Season-28: Rechtsklick-Kontextmenue-State + Aktionen. Die Aktionen
// rufen direkt die xterm/Clipboard-APIs; gleicher Pfad wie die Tastatur-
// Shortcuts, nur ueber Menue-Klick. `openSearch` bruecke ins Such-Feature
// (handleMenuSearch oeffnet die Bar) — als stabiler Setter uebergeben, damit
// die useCallback-Identitaeten stabil bleiben.
export function useTerminalContextMenu(
  terminalRef: RefObject<Terminal | null>,
  openSearch: React.Dispatch<React.SetStateAction<boolean>>,
): {
  contextMenu: { x: number; y: number } | null;
  setContextMenu: React.Dispatch<
    React.SetStateAction<{ x: number; y: number } | null>
  >;
  handleContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMenuCopy: () => Promise<void>;
  handleMenuPaste: () => Promise<void>;
  handleMenuClear: () => void;
  handleMenuSearch: () => void;
} {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Phase-2 Season-28: Rechtsklick-Kontextmenue. Discoverability fuer die
  // Ctrl+Shift+*-Shortcuts — neue User wissen nicht von selbst, dass
  // Ctrl+Shift+C kopiert.
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Phase-2 Season-28: Kontextmenue-Aktionen rufen direkt die xterm/Clipboard-
  // APIs; gleicher Pfad wie die Tastatur-Shortcuts, nur ueber Menue-Klick.
  const handleMenuCopy = useCallback(async () => {
    const term = terminalRef.current;
    const sel = term?.getSelection() ?? '';
    if (sel.length > 0) {
      try {
        await navigator.clipboard.writeText(sel);
        term?.clearSelection();
      } catch (e) {
        console.warn('[TerminalTab] clipboard.writeText failed', e);
      }
    }
    setContextMenu(null);
  }, [terminalRef]);
  const handleMenuPaste = useCallback(async () => {
    const term = terminalRef.current;
    if (!term) {
      setContextMenu(null);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text.length > 0) term.paste(text);
    } catch (e) {
      console.warn('[TerminalTab] clipboard.readText failed', e);
    }
    setContextMenu(null);
  }, [terminalRef]);
  const handleMenuClear = useCallback(() => {
    terminalRef.current?.clear();
    setContextMenu(null);
  }, [terminalRef]);
  const handleMenuSearch = useCallback(() => {
    openSearch(true);
    setContextMenu(null);
  }, [openSearch]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleMenuCopy,
    handleMenuPaste,
    handleMenuClear,
    handleMenuSearch,
  };
}
