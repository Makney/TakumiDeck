import { useEffect, useRef } from 'react';

// Phase-2 Season-32 — Rechtsklick-Kontextmenu fuer ein Projekt in der Sidebar.
// Bisher hing das Entfernen am Muelleimer-Hover-Icon; Sprint 32 zieht die Aktion
// in ein Kontextmenu, damit der Hover-Slot frei wird fuer den Aufmerksamkeits-
// Marker (waiting/attention).
//
// Bewusst minimal gehalten: ein Eintrag, kein Submenue, kein Keyboard-Navigation-
// Kram. Wenn spaeter mehr Aktionen dazukommen (z.B. "im Explorer oeffnen",
// "Pfad kopieren"), wird das Component erweitert oder generalisiert.

interface ProjectContextMenuProps {
  x: number;
  y: number;
  canRemove: boolean;
  onRemove: () => void;
  onClose: () => void;
}

export function ProjectContextMenu({
  x,
  y,
  canRemove,
  onRemove,
  onClose,
}: ProjectContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleDocClick(event: MouseEvent) {
      if (!ref.current) return;
      if (event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    // Erst im naechsten Tick registrieren, sonst schliesst das initiale
    // mousedown-Event (das das Menu geoeffnet hat) das Menu sofort wieder.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleDocClick);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Position klemmen: wenn x/y so weit am Rand sind dass das Menu rausragt,
  // verschieben wir es ins sichtbare Fenster. Default-Annahme: Menu ist
  // ca. 200×80 px gross.
  const maxX = window.innerWidth - 210;
  const maxY = window.innerHeight - 90;
  const left = Math.max(4, Math.min(x, maxX));
  const top = Math.max(4, Math.min(y, maxY));

  return (
    <div
      ref={ref}
      className="td-context-menu"
      role="menu"
      style={{ position: 'fixed', left, top, zIndex: 1000 }}
    >
      <button
        type="button"
        role="menuitem"
        className="td-context-menu-item danger"
        disabled={!canRemove}
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        Projekt entfernen…
      </button>
    </div>
  );
}
