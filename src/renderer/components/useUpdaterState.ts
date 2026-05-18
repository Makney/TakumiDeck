import { useEffect, useState } from 'react';
import type { UpdaterState } from '@shared/types';

// Phase-2 Season-26: Shared Hook fuer den Updater-State.
//
// Sowohl der Header-Bar-Banner als auch der Settings-About-Tab konsumieren
// den State. Statt zwei parallele Subscribe-Pfade halten wir den State in
// einem useEffect-Paar (initial Sync per getState + Abo auf onStatePush)
// pro Komponente. Push-Events sind idempotent, der Cost ist minimal.

const INITIAL_STATE: UpdaterState = { kind: 'idle' };

export function useUpdaterState(): UpdaterState {
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    void window.api.updater.getState().then((result) => {
      if (cancelled) return;
      if (result.ok) setState(result.data);
    });
    const unsubscribe = window.api.updater.onStatePush((event) => {
      setState(event.state);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
