import { useEffect, useRef } from 'react';

// Phase-2 Season-28: Mini-Suchbar oben im Terminal. Bewusst klein gehalten —
// kein Reg-Ex, kein Case-Toggle, kein Match-Counter. Wenn das spaeter gewuenscht
// ist, sind diese Schalter alle als Optionen am SearchAddon vorhanden.
interface TerminalSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function TerminalSearchBar({
  query,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Bei Mount sofort fokussieren, damit der User direkt tippen kann.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <div className="td-terminal-search">
      <input
        ref={inputRef}
        type="text"
        className="td-terminal-search-input"
        placeholder="Suchen …"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKey}
        aria-label="Im Terminal suchen"
      />
      <button
        type="button"
        className="td-terminal-search-btn"
        onClick={onPrev}
        title="Vorheriger Treffer (Shift+Enter)"
        aria-label="Vorheriger Treffer"
      >
        ↑
      </button>
      <button
        type="button"
        className="td-terminal-search-btn"
        onClick={onNext}
        title="Naechster Treffer (Enter)"
        aria-label="Naechster Treffer"
      >
        ↓
      </button>
      <button
        type="button"
        className="td-terminal-search-btn"
        onClick={onClose}
        title="Schliessen (Esc)"
        aria-label="Suche schliessen"
      >
        ×
      </button>
    </div>
  );
}
