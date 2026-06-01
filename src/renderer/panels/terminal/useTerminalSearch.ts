import { useCallback, useState, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { SearchAddon } from '@xterm/addon-search';

// Phase-2 Season-28: Such-Bar-State + Handler. Such-Logik laeuft direkt gegen
// das Addon — kein State-Sync ueber die useEffect-Grenze, weil findNext/Previous
// den xterm-Buffer in-place markiert. Den Sichtbar-State + Setter braucht auch
// der Init-Effekt (Ctrl+Shift+F-Shortcut), deshalb gibt der Hook beides zurueck.
export function useTerminalSearch(
  terminalRef: RefObject<Terminal | null>,
  searchAddonRef: RefObject<SearchAddon | null>,
): {
  searchVisible: boolean;
  setSearchVisible: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  handleSearchNext: (query: string) => void;
  handleSearchPrev: (query: string) => void;
  closeSearch: () => void;
} {
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchNext = useCallback(
    (query: string) => {
      if (query.length === 0) return;
      searchAddonRef.current?.findNext(query, { incremental: false });
    },
    [searchAddonRef],
  );
  const handleSearchPrev = useCallback(
    (query: string) => {
      if (query.length === 0) return;
      searchAddonRef.current?.findPrevious(query, { incremental: false });
    },
    [searchAddonRef],
  );
  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery('');
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, [searchAddonRef, terminalRef]);

  return {
    searchVisible,
    setSearchVisible,
    searchQuery,
    setSearchQuery,
    handleSearchNext,
    handleSearchPrev,
    closeSearch,
  };
}
