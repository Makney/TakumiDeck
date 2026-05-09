import { useEffect, useState } from 'react';
import type { AppSettings, IpcResult } from '@shared/types';
import { TerminalPane } from './panels/TerminalPane';

// Sprint-2-Renderer: lädt Version + Settings, dann zeigt eine TerminalPane mit
// einer claude-PTY für settings.workspace_path im default_model an.
// Volles Layout (Sidebar / Right-Pane / Stats) folgt ab Sprint 4.
export function App() {
  const [version, setVersion] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [versionRes, settingsRes] = await Promise.all([
        window.api.app.getVersion(),
        window.api.settings.get(),
      ]);
      if (cancelled) return;
      handle(versionRes, setVersion);
      handle(settingsRes, setSettings);
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="td-bootstrap">
        <h1>TakumiDeck</h1>
        <pre>Fehler: {error}</pre>
      </div>
    );
  }

  if (!settings || !version) {
    return (
      <div className="td-bootstrap">
        <h1>TakumiDeck</h1>
        <div className="td-meta">lädt…</div>
      </div>
    );
  }

  return (
    <div className="td-app">
      <header className="td-app-header">
        <span className="td-app-title">TakumiDeck</span>
        <span className="td-app-meta">v{version} · Sprint 2 (Single-Tab-PTY)</span>
      </header>
      <main className="td-app-main">
        <TerminalPane
          settings={settings}
          cwd={settings.workspace_path}
          model={settings.default_model}
          type="feature"
          title={`Sprint-2-Test · ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`}
        />
      </main>
    </div>
  );

  function handle<T>(res: IpcResult<T>, setter: (v: T) => void): void {
    if (res.ok) setter(res.data);
    else setError(res.error);
  }
}
