import { useCallback, useState } from 'react';
import type { UpdaterState } from '@shared/types';
import { useUpdaterState } from '../../components/useUpdaterState';
import { Field } from './shared';

export function AboutTab({ version }: { version: string }) {
  return (
    <div className="td-settings-section">
      <Field label="Version">
        <code className="td-settings-code">v{version}</code>
      </Field>
      <Field label="Repository">
        <code className="td-settings-code">github.com/Makney/TakumiDeck</code>
      </Field>
      <Field label="Lizenz" hint="Privates Tool, kein öffentliches Distribution-Paket.">
        <span className="td-settings-meta">Privat (kein Code-Signing)</span>
      </Field>
      <UpdaterField />
    </div>
  );
}

// Phase-2 Season-26: Update-Block im About-Tab. Zeigt den aktuellen
// Updater-State und stellt den manuellen Re-Check-Button bereit. Banner-
// Klicks (Download/Install) bleiben in der Header-Bar — hier nur Status
// und Re-Check. Im Dev-Modus zeigen wir explizit, dass Auto-Update aus
// ist, damit der User nicht raetselt, warum der Button nichts tut.
function UpdaterField() {
  const state = useUpdaterState();
  const [busy, setBusy] = useState(false);

  const handleCheck = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.api.updater.check();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <Field
      label="Auto-Update"
      hint="Prueft beim App-Start automatisch auf neue Versionen via GitHub-Releases."
    >
      <div className="td-settings-updater">
        <span className="td-settings-meta">{formatUpdaterState(state)}</span>
        <button
          type="button"
          className="td-action-btn"
          onClick={() => void handleCheck()}
          disabled={busy || state.kind === 'disabled-dev'}
          title={
            state.kind === 'disabled-dev'
              ? 'Im Dev-Mode deaktiviert — nur im verpackten Build aktiv.'
              : 'Jetzt manuell auf neue Version pruefen.'
          }
        >
          {busy ? 'Pruefe…' : 'Jetzt nach Update suchen'}
        </button>
      </div>
    </Field>
  );
}

function formatUpdaterState(state: UpdaterState): string {
  switch (state.kind) {
    case 'idle':
      return 'Noch nicht geprueft.';
    case 'checking':
      return 'Pruefe gegen GitHub-Releases…';
    case 'no-update':
      return `Aktuelle Version v${state.currentVersion} ist auf dem neuesten Stand.`;
    case 'available':
      return `Neue Version v${state.version} verfuegbar — Banner oben rechts.`;
    case 'downloading':
      return `Lade v${state.version} … ${state.percent}%`;
    case 'downloaded':
      return `v${state.version} bereit — Neustart noetig.`;
    case 'error':
      return `Fehler: ${state.message}`;
    case 'disabled-dev':
      return `Dev-Mode (v${state.currentVersion}) — Auto-Update nur im Packaged-Build.`;
  }
}
