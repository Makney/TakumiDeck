import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSessionStore } from '../stores/sessions';
import { createNotesSaver } from './notesSaver';

// Notes-Footer (Sprint 3): collapsible Plain-Text-Textarea unter dem aktiven Terminal.
// Auto-Save mit 500ms Debounce (Variante B): plus onBlur, plus onUnmount, plus
// window.beforeunload — damit beim Tab-Wechsel oder App-Quit keine Tipps verloren gehen.
//
// Persistenz läuft über session:update mit notes_md-Patch. Die SQLite-Spalte ist
// notes_md (auch wenn Plain-Text reingeht — Markdown-Editor kommt erst in Sprint 7).

interface Props {
  sessionId: string;
}

export function NotesFooter({ sessionId }: Props) {
  const tab = useSessionStore((s) =>
    s.tabs.find((t) => t.sessionId === sessionId) ?? null,
  );
  const setNotesDraft = useSessionStore((s) => s.setNotesDraft);
  const setNotesSaved = useSessionStore((s) => s.setNotesSaved);

  const [expanded, setExpanded] = useState(false);

  // saveFn ist stabil pro sessionId — wir wollen nicht, dass eine ID-Änderung den
  // wartenden Save für den vorherigen Tab versehentlich an den neuen sessionId schickt.
  const saver = useMemo(() => {
    const saveFn = (value: string) => {
      void window.api.sessions
        .update({ sessionId, patch: { notes_md: value } })
        .then((res) => {
          if (res.ok) {
            // Server-bestätigten Stand im Store festhalten (für „dirty"-Logik später).
            setNotesSaved(sessionId, value);
          } else {
            console.warn(`[NotesFooter] notes_md-Save fehlgeschlagen: ${res.error}`);
          }
        });
    };
    return createNotesSaver({ saveFn, delayMs: 500 });
  }, [sessionId, setNotesSaved]);

  // Beim Unmount (Tab-Wechsel oder App-Quit-vor-Render) sofort flushen.
  useEffect(() => {
    return () => {
      saver.flush();
    };
  }, [saver]);

  // window.beforeunload: letzte Chance, bevor das Renderer-Window stirbt.
  // Synchroner IPC-Call existiert in unserer Bridge nicht — der invoke()-Promise
  // wird oft nicht mehr aufgelöst. Trotzdem sinnvoll: better-sqlite3 ist im Main
  // synchron, und der ipcMain-Handler kann die Patch-Op meistens noch durchführen,
  // bevor der Renderer komplett geschlossen ist. Worst-Case-Verlust: 0–500 ms Tipps.
  useEffect(() => {
    const handler = () => saver.flush();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saver]);

  const handleChange = useCallback(
    (value: string) => {
      setNotesDraft(sessionId, value);
      saver.schedule(value);
    },
    [sessionId, setNotesDraft, saver],
  );

  const handleBlur = useCallback(() => {
    saver.flush();
  }, [saver]);

  if (!tab) return null;

  return (
    <div className={`td-notes-footer ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="td-notes-header">
        <button
          type="button"
          className="td-notes-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'} Notizen
        </button>
        <span className="td-notes-meta">
          {tab.notesDraft.length === 0
            ? 'leer'
            : `${tab.notesDraft.length} Zeichen${
                tab.notesDraft !== tab.notesSaved ? ' · ungespeichert' : ''
              }`}
        </span>
      </div>
      {expanded && (
        <textarea
          className="td-notes-textarea"
          value={tab.notesDraft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Plain-Text-Notizen zur aktiven Session — Auto-Save nach 500 ms."
          spellCheck={false}
        />
      )}
    </div>
  );
}

