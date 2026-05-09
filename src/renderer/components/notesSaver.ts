// Pure-Logik für den Notes-Auto-Save:
// - 500ms Debounce auf eingehende Werte
// - flush() löst sofort aus, falls etwas wartet
// - dispose() stoppt einen wartenden Timer ohne zu flushen (für Tab-Wechsel ohne Save?
//   gibt es nicht — wir flushen on-unmount immer; dispose ist die ungewünschte Variante)
//
// Driver-Injection-Pattern wie Lifecycle/PtyManager: die Save-Funktion wird durchgereicht,
// damit Tests nur die Debounce-Logik ohne IPC durchspielen müssen.

export interface NotesSaver {
  // Plant einen Save in `delayMs` Millisekunden mit dem zuletzt geschedulten Wert.
  // Mehrere schedule() innerhalb des Fensters führen zu genau einem Save.
  schedule(value: string): void;
  // Schreibt einen ggf. wartenden Wert sofort und cancelt den Timer.
  // No-op, wenn der zuletzt geschriebene Wert dem geschedulten entspricht (idempotent).
  flush(): void;
  // Cancelt einen wartenden Timer, ohne zu flushen.
  dispose(): void;
}

export interface NotesSaverOptions {
  saveFn: (value: string) => void;
  delayMs?: number;
}

export function createNotesSaver(opts: NotesSaverOptions): NotesSaver {
  const { saveFn, delayMs = 500 } = opts;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: string | null = null;
  let lastSaved: string | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function commit(): void {
    if (pendingValue === null) return;
    if (pendingValue === lastSaved) {
      // Idempotent: derselbe Wert nochmal speichern wäre ein unnötiger IPC-/SQLite-Treffer.
      pendingValue = null;
      return;
    }
    const value = pendingValue;
    pendingValue = null;
    lastSaved = value;
    saveFn(value);
  }

  return {
    schedule(value: string): void {
      pendingValue = value;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        commit();
      }, delayMs);
    },
    flush(): void {
      clearTimer();
      commit();
    },
    dispose(): void {
      clearTimer();
      pendingValue = null;
    },
  };
}
