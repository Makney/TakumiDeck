import { useEffect, useState } from 'react';
import type { AppSettings, IpcResult } from '@shared/types';

// Sprint-1-Smoke-View: lädt Version und Settings über die window.api-Bridge,
// damit verifizierbar ist, dass Preload + IPC + Main + Settings-Store + DB-Init zusammenspielen.
// Wird in Sprint 2 durch das tatsächliche Layout (Sidebar / Terminal / Right-Pane) ersetzt.
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

  return (
    <div className="td-bootstrap">
      <h1>TakumiDeck</h1>
      <div className="td-meta">v{version ?? '…'} · Foundation-Skelett (Sprint 1)</div>
      {error && <pre>Fehler: {error}</pre>}
      {settings && <pre>{JSON.stringify(settings, null, 2)}</pre>}
    </div>
  );

  function handle<T>(res: IpcResult<T>, setter: (v: T) => void): void {
    if (res.ok) setter(res.data);
    else setError(res.error);
  }
}
