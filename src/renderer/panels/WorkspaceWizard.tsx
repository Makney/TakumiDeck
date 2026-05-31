import { useCallback, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { useUiStore } from '../stores/ui';

// Phase-2 Season-18: First-Start-Workspace-Wizard. Wird statt des 4-Spalten-
// Hauptlayouts gerendert, solange `settings.workspace_wizard_completed === false`.
//
// Zwei Wege:
//   1. Pick — Ordner-Picker oeffnen, gewaehlten Pfad in Settings schreiben
//      und Flag auf `true` setzen. Anschliessend laeuft der bestehende
//      `project:scan-workspace`-IPC, damit der User sofort eine befuellte
//      Sidebar sieht.
//   2. Skip — Settings auf leeren `workspace_path` setzen und Flag auf
//      `true`. Boot uebersprueft via `shouldRunInitialWorkspaceScan` und
//      laesst den Scan kuenftig liegen, bis der User im Settings-Tab
//      einen Pfad nachzieht.
//
// Komponenten-Contract: `onComplete(nextSettings)` wird genau einmal pro
// Wizard-Abschluss gerufen — die App-Root nimmt das Settings-Objekt und
// wechselt damit aufs Hauptlayout.
export function WorkspaceWizard({
  onComplete,
}: {
  onComplete: (next: AppSettings) => void;
}): JSX.Element {
  const [busy, setBusy] = useState<'pick' | 'skip' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const finishWith = useCallback(
    async (patch: Partial<AppSettings>) => {
      setErrorMsg(null);
      const patched = await window.api.settings.set(patch);
      if (!patched.ok) {
        setErrorMsg(patched.error);
        return null;
      }
      return patched.data;
    },
    [],
  );

  const handlePick = useCallback(async () => {
    if (busy) return;
    setBusy('pick');
    try {
      const picked = await window.api.app.pickFolder({
        title: 'Workspace-Wurzel waehlen',
      });
      if (!picked.ok) {
        setErrorMsg(picked.error);
        return;
      }
      if (picked.data.canceled || !picked.data.path) {
        // Picker abgebrochen — Wizard bleibt offen, keine Settings-Mutation.
        return;
      }
      const nextSettings = await finishWith({
        workspace_path: picked.data.path,
        workspace_wizard_completed: true,
      });
      if (!nextSettings) return;
      // Scan-Trigger nach dem Settings-Write — der Main liest den frischen
      // Pfad direkt aus `settings.read()`, also kein Race.
      const scanned = await window.api.projects.scanWorkspace();
      if (!scanned.ok) {
        // Settings sind schon persistiert, der User kann die Sidebar spaeter
        // ueber den Settings-Workspace-Tab-Rescan nachziehen. Wizard trotzdem
        // beenden, sonst klebt der User im Welcome ohne Weg raus.
        //
        // Bereich-PANELS-Review 4.2: onComplete unmountet den Wizard sofort —
        // ein lokales setErrorMsg waere nie sichtbar. Persistenter Toast ueber
        // den UI-Store, der das Hauptlayout ueberlebt, meldet den Fehl-Scan.
        useUiStore
          .getState()
          .flashToast(
            `Workspace-Scan fehlgeschlagen (${scanned.error}) — du kannst in den Einstellungen erneut scannen.`,
            6000,
          );
      }
      onComplete(nextSettings);
    } finally {
      setBusy(null);
    }
  }, [busy, finishWith, onComplete]);

  const handleSkip = useCallback(async () => {
    if (busy) return;
    setBusy('skip');
    try {
      // Leerer workspace_path verhindert kuenftige Boot-Scans (siehe
      // `shouldRunInitialWorkspaceScan`); Flag auf `true`, damit der Wizard
      // beim naechsten Start nicht erneut aufpoppt.
      const nextSettings = await finishWith({
        workspace_path: '',
        workspace_wizard_completed: true,
      });
      if (!nextSettings) return;
      onComplete(nextSettings);
    } finally {
      setBusy(null);
    }
  }, [busy, finishWith, onComplete]);

  return (
    <div className="td-wizard">
      <div className="td-wizard-card">
        <h1 className="td-wizard-title">Willkommen bei TakumiDeck</h1>
        <p className="td-wizard-lead">
          Bevor es losgeht: waehl den Ordner aus, in dem deine Projekte liegen.
          TakumiDeck scannt ihn dann nach Unterordnern mit einer{' '}
          <code>CLAUDE.md</code> und legt sie in der Sidebar an.
        </p>
        <p className="td-wizard-hint">
          Du kannst den Pfad jederzeit im Einstellungs-Dialog (Tab
          {' '}&bdquo;Workspace&ldquo;) anpassen.
        </p>
        <div className="td-wizard-actions">
          <button
            type="button"
            className="td-action-btn primary"
            onClick={() => void handlePick()}
            disabled={busy !== null}
          >
            {busy === 'pick' ? '…' : '📁 Workspace-Ordner auswaehlen'}
          </button>
          <button
            type="button"
            className="td-action-btn"
            onClick={() => void handleSkip()}
            disabled={busy !== null}
          >
            {busy === 'skip' ? '…' : 'Erstmal ueberspringen'}
          </button>
        </div>
        {errorMsg && (
          <div className="td-md-error td-wizard-error" role="alert">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
