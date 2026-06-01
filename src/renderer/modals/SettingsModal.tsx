import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, LimitBar } from '@shared/types';
import {
  createDebouncedSaver,
  type DebouncedSaver,
  type SaveOutcome,
} from '../components/settingsAutoSave';
import { GeneralTab } from './settings/GeneralTab';
import { WorkspaceTab } from './settings/WorkspaceTab';
import { ModelsTab } from './settings/ModelsTab';
import { UsageTab } from './settings/UsageTab';
import { TemplatesTab } from './settings/TemplatesTab';
import { TerminalTab } from './settings/TerminalTab';
import { AboutTab } from './settings/AboutTab';

// SettingsModal (Sprint 8, Architektur 6.9).
//
// Sieben Tabs (Allgemein / Workspace / Modelle / Token-Tracking / Templates /
// Terminal / About). Mix aus Form-Inputs (V2-A: Auto-Save mit 500 ms Debounce)
// und Raw-JSON-Editor (V1-A: Live-Lint, expliziter „Anwenden"-Knopf) für
// komplexe Settings wie limit_bars[] und sensitive_file_patterns.
//
// Modal-Pattern aus PreCommitModal (Sprint 7) — td-modal-backdrop /
// td-modal-header / td-modal-footer / td-action-btn primary.
// Erreichbar via Ctrl+K und Settings-Icon in der Header-Bar (Sprint 8).
//
// Save-Indikator: dezente Tag-Pille im Footer („gespeichert" / „speichert…" /
// „Fehler: …"). Auto-Save-Pfad fühlt sich wie Notes-Save aus Sprint 3 an.
//
// Season 35: die einzelnen Tab-Komponenten leben in ./settings/*; dieses File
// haelt nur noch das Modal-Geruest, die Tab-Navigation und die Auto-Save-Logik.

type TabKey =
  | 'general'
  | 'workspace'
  | 'models'
  | 'usage'
  | 'templates'
  | 'terminal'
  | 'about';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'general', label: 'Allgemein' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'models', label: 'Modelle' },
  { key: 'usage', label: 'Token-Tracking' },
  { key: 'templates', label: 'Templates' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'about', label: 'About' },
];

interface Props {
  initialSettings: AppSettings;
  appVersion: string;
  // Wird mit den finalen Settings nach jedem Auto-Save aufgerufen — die
  // Eltern-Komponente (App.tsx) hält dann ihren Settings-State synchron, damit
  // andere Panels (UsageBar, MarkdownEditor etc.) die Änderung sofort sehen.
  onSettingsUpdated: (next: AppSettings) => void;
  onClose: () => void;
}

export function SettingsModal({
  initialSettings,
  appVersion,
  onSettingsUpdated,
  onClose,
}: Props) {
  const [tab, setTab] = useState<TabKey>('general');
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saveStatus, setSaveStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; fields: string[] }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Debounced-Saver — ein Singleton pro Modal-Mount. Beim Modal-Close flushen
  // wir noch einmal, damit die letzte Tipp-Aktion nicht verloren geht.
  const saverRef = useRef<DebouncedSaver | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createDebouncedSaver({
      set: window.api.settings.set,
    });
  }

  // Idle-Reset-Timer für die „✓ Gespeichert"-Badge. In einem Ref, damit ein
  // schnell folgendes Save-Outcome den alten Timer canceln kann — sonst hätten
  // wir eine Race: alter Timer feuert nach 1.5 s `idle`, obwohl inzwischen ein
  // neuer `saving`-Status aktiv ist.
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saver = saverRef.current;
    if (!saver) return;
    const unsub = saver.onOutcome((outcome: SaveOutcome) => {
      // Vor jedem neuen Outcome den evtl. wartenden idle-Reset abräumen.
      if (savedBadgeTimerRef.current !== null) {
        clearTimeout(savedBadgeTimerRef.current);
        savedBadgeTimerRef.current = null;
      }
      if (outcome.status === 'saved') {
        setSaveStatus({ kind: 'saved', fields: outcome.fields });
        if (outcome.result) {
          setSettings(outcome.result);
          onSettingsUpdated(outcome.result);
        }
        savedBadgeTimerRef.current = setTimeout(() => {
          savedBadgeTimerRef.current = null;
          setSaveStatus({ kind: 'idle' });
        }, 1500);
        return;
      }
      setSaveStatus({ kind: 'error', message: outcome.error ?? 'Unbekannter Fehler' });
    });
    return () => {
      unsub();
      if (savedBadgeTimerRef.current !== null) {
        clearTimeout(savedBadgeTimerRef.current);
        savedBadgeTimerRef.current = null;
      }
    };
  }, [onSettingsUpdated]);

  // Esc + Modal-Close-Flush: letzte queued Field-Patches flushen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void saverRef.current?.flush().then(() => onClose());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleClose = useCallback(() => {
    void saverRef.current?.flush().then(() => onClose());
  }, [onClose]);

  // Gemeinsamer Field-Setter: lokal optimistisch updaten (UI ist sofort live)
  // PLUS in den Debounced-Saver queuen. Der Server-Roundtrip ersetzt unseren
  // optimistic State, sobald er durch ist.
  const setField = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveStatus({ kind: 'saving' });
    saverRef.current?.queue(key, value);
  }, []);

  return (
    <div className="td-modal-backdrop" onClick={handleClose}>
      <div
        className="td-modal td-settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="td-modal-header">
          <div className="td-modal-title">Einstellungen</div>
          <button
            type="button"
            className="td-modal-close"
            onClick={handleClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        {/* Sprint 9 (D5) — 2-Spalten-Layout nach Vorlage (app.jsx 422-431).
            Linke Sidebar mit td-list-item-Klassen (Konsistenz zur App-
            Sidebar), rechter Content-Bereich mit dem aktiven Tab. */}
        <div className="td-modal-body td-settings-body td-settings-body-2col">
          <nav className="td-settings-sidenav" aria-label="Settings-Bereiche">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`td-list-item${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="td-name">{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="td-settings-content">
            {tab === 'general' && (
              <GeneralTab settings={settings} setField={setField} />
            )}
            {tab === 'workspace' && (
              <WorkspaceTab
                settings={settings}
                setField={setField}
                onApplyRawSensitive={(parsed) => applySensitivePatterns(parsed, setField)}
              />
            )}
            {tab === 'models' && (
              <ModelsTab settings={settings} setField={setField} />
            )}
            {tab === 'usage' && (
              <UsageTab
                settings={settings}
                setField={setField}
                onApplyLimitBars={(parsed) => applyLimitBars(parsed, setField)}
              />
            )}
            {tab === 'templates' && (
              <TemplatesTab settings={settings} setField={setField} />
            )}
            {tab === 'terminal' && (
              <TerminalTab settings={settings} setField={setField} />
            )}
            {tab === 'about' && <AboutTab version={appVersion} />}
          </div>
        </div>

        <div className="td-modal-footer td-settings-footer">
          <SaveStatusBadge status={saveStatus} />
          <span className="td-settings-spacer" />
          <button
            type="button"
            className="td-action-btn primary"
            onClick={handleClose}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Apply-Helper für Raw-JSON-Editoren ---------------------------------

function applyLimitBars(
  parsed: unknown,
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Schema bereits in der validate-Funktion geprüft — wir vertrauen dem cast.
  const bars = parsed as LimitBar[];
  setField('limit_bars', bars);
  // Auto-Save kümmert sich um das Persistieren. Apply gibt sofort ok zurück;
  // Server-Errors landen via SaveStatusBadge im Footer.
  return Promise.resolve({ ok: true });
}

function applySensitivePatterns(
  parsed: unknown,
  setField: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patterns = parsed as string[];
  setField('sensitive_file_patterns', patterns);
  return Promise.resolve({ ok: true });
}

// --- Footer-Save-Indikator -----------------------------------------------

function SaveStatusBadge({
  status,
}: {
  status:
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; fields: string[] }
    | { kind: 'error'; message: string };
}) {
  if (status.kind === 'idle') {
    return <span className="td-settings-save-status idle">Auto-Save aktiv</span>;
  }
  if (status.kind === 'saving') {
    return <span className="td-settings-save-status saving">Speichert…</span>;
  }
  if (status.kind === 'saved') {
    return (
      <span className="td-settings-save-status saved">
        ✓ Gespeichert ({status.fields.length} Feld{status.fields.length === 1 ? '' : 'er'})
      </span>
    );
  }
  return (
    <span className="td-settings-save-status error">⚠ {status.message}</span>
  );
}
