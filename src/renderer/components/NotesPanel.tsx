import { useEffect, useMemo, useCallback } from 'react';
import { useSessionStore } from '../stores/sessions';
import { createNotesSaver } from './notesSaver';

// Notes-Panel (Sprint 7, Q8 Variante A: Migration aus dem NotesFooter in den Right-Pane).
//
// Verhalten und Persistenz sind identisch zum Sprint-3-NotesFooter:
//   - Auto-Save mit 500 ms Debounce (Variante B aus Sprint 3),
//   - plus onBlur, plus onUnmount, plus window.beforeunload.
// Unterschied: lebt jetzt als Sektion im Right-Pane (UI_DECISIONS.md, Architektur 6.0
// FILES_FLEX/NOTES_FLEX), nicht mehr als ausklappbarer Footer unter dem Terminal.
// Die Pure-Logik (createNotesSaver) bleibt unverändert — alle bestehenden
// notesSaver.test.ts-Cases tragen weiter.
//
// Wenn keine Session aktiv ist, zeigt das Panel einen Empty-State analog zum
// Design-Handoff (claude-export/components.jsx NotesPanel).

interface Props {
  // sessionId === null bedeutet, dass keine Session ausgewählt ist (z.B. weil
  // das Projekt leer ist oder gerade gewechselt wurde) — Empty-State rendert.
  sessionId: string | null;
}

export function NotesPanel({ sessionId }: Props) {
  const tab = useSessionStore((s) =>
    sessionId ? s.tabs.find((t) => t.sessionId === sessionId) ?? null : null,
  );
  const setNotesDraft = useSessionStore((s) => s.setNotesDraft);
  const setNotesSaved = useSessionStore((s) => s.setNotesSaved);

  // saver ist stabil pro sessionId — wir wollen nicht, dass eine ID-Änderung den
  // wartenden Save für den vorherigen Tab versehentlich an die neue sessionId schickt.
  // Bei sessionId === null gibt es nichts zu speichern, der Hook returnt null.
  const saver = useMemo(() => {
    if (!sessionId) return null;
    const saveFn = (value: string) => {
      void window.api.sessions
        .update({ sessionId, patch: { notes_md: value } })
        .then((res) => {
          if (res.ok) {
            setNotesSaved(sessionId, value);
          } else {
            console.warn(`[NotesPanel] notes_md-Save fehlgeschlagen: ${res.error}`);
          }
        });
    };
    return createNotesSaver({ saveFn, delayMs: 500 });
  }, [sessionId, setNotesSaved]);

  // Beim Unmount oder Session-Wechsel sofort flushen — letzte Tipps gehen sonst verloren,
  // wenn der User zwischen Sessions hin- und herklickt, bevor der Debounce gefeuert hat.
  useEffect(() => {
    return () => {
      saver?.flush();
    };
  }, [saver]);

  // window.beforeunload: letzte Chance vor dem Schließen des Renderer-Windows.
  // Synchroner IPC fehlt in unserer Bridge — der invoke()-Promise wird oft nicht mehr
  // aufgelöst, aber better-sqlite3 ist im Main synchron, der Patch landet meist noch.
  // Worst-Case-Verlust 0–500 ms Tipps (TECH_SCHULDEN-Eintrag).
  useEffect(() => {
    if (!saver) return;
    const handler = () => saver.flush();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saver]);

  const handleChange = useCallback(
    (value: string) => {
      if (!sessionId || !saver) return;
      setNotesDraft(sessionId, value);
      saver.schedule(value);
    },
    [sessionId, setNotesDraft, saver],
  );

  const handleBlur = useCallback(() => {
    saver?.flush();
  }, [saver]);

  const isDirty = tab !== null && tab.notesDraft !== tab.notesSaved;

  return (
    <div className="td-panel td-notes">
      <div className="td-notes-head">
        <div className="td-panel-title">Notizen</div>
        {tab && (
          <span className={`td-notes-saving${isDirty ? '' : ' saved'}`}>
            {isDirty ? '○ tippt…' : '● gespeichert'}
          </span>
        )}
      </div>
      <div className="td-notes-body">
        {tab ? (
          <textarea
            value={tab.notesDraft}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="Notizen zur aktiven Session — Auto-Save nach 500 ms."
            spellCheck={false}
          />
        ) : (
          <div className="td-notes-empty">
            Wähle eine Session, um Notizen zu sehen.
          </div>
        )}
      </div>
    </div>
  );
}
