import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { AppSettings, SessionRow } from '@shared/types';

// Sprint-2-Single-Tab-Terminal.
// xterm.js mit Canvas-Renderer + Standard-Addons (fit, search, serialize, web-links).
// Spawnt beim Mount eine claude-PTY für settings.workspace_path mit dem gewünschten Modell;
// echtes Layout (Tabs, Sidebar) folgt mit Sprint 3 / Sprint 4.
interface Props {
  settings: AppSettings;
  cwd: string;
  model: string;
  type: 'feature' | 'bug' | 'review' | 'docs-sync';
  title: string;
}

export function TerminalPane({ settings, cwd, model, type, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string>('');
  const initRef = useRef(false);

  const [session, setSession] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialisierung läuft genau einmal pro Lebensdauer der Komponente. Der initRef-Guard
  // schützt vor StrictMode-Double-Mount im Dev-Mode (sonst würde zweimal eine claude-PTY
  // gespawnt, mit zwei Session-Rows in der DB).
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const container = containerRef.current;
    if (!container) return;

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    const terminal = new Terminal({
      fontFamily: settings.terminal_font_family,
      fontSize: settings.terminal_font_size,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: '#0d0f0e',
        foreground: '#d3d6cf',
        cursor: '#4ade80',
      },
    });
    terminalRef.current = terminal;

    const fit = new FitAddon();
    fitRef.current = fit;
    terminal.loadAddon(fit);
    terminal.loadAddon(new SearchAddon());
    terminal.loadAddon(new SerializeAddon());
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    // Canvas-Renderer erst nach .open() laden — sonst hat er kein Canvas-Element zum Anhängen.
    terminal.loadAddon(new CanvasAddon());

    fit.fit();

    // PTY-Events VOR pty.create abonnieren, damit die ersten Datenpakete sicher ankommen.
    const offData = window.api.pty.onData((event) => {
      if (event.sessionId !== sessionId) return;
      terminal.write(event.data);
    });
    const offExit = window.api.pty.onExit((event) => {
      if (event.sessionId !== sessionId) return;
      terminal.write(
        `\r\n\x1b[33m[Session beendet · exitCode=${event.exitCode}]\x1b[0m\r\n`,
      );
    });

    // User-Input → PTY.
    terminal.onData((data) => {
      void window.api.pty.write({ sessionId, data });
    });
    // Terminal-Resize → PTY-Resize.
    terminal.onResize(({ cols, rows }) => {
      void window.api.pty.resize({ sessionId, cols, rows });
    });

    // Container-Resize → fit().
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ResizeObserver feuert manchmal mit 0×0-Box (während Animationen) — dann ignorieren.
      }
    });
    ro.observe(container);

    void (async () => {
      const result = await window.api.pty.create({
        sessionId,
        title,
        type,
        model,
        cwd,
        cols: terminal.cols,
        rows: terminal.rows,
      });
      if (result.ok) {
        setSession(result.data);
        terminal.focus();
      } else {
        setError(result.error);
        offData();
        offExit();
      }
    })();
    // Bewusst kein cleanup-Return: in Sprint 2 lebt die TerminalPane für die gesamte
    // App-Lifetime; PTY + DB-Cleanup erfolgen über main.ts (killAll bei before-quit).
  }, []);

  // Hot-Update der Schriftart, wenn der User in den Settings nachzieht.
  useEffect(() => {
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = settings.terminal_font_family;
    terminal.options.fontSize = settings.terminal_font_size;
    try {
      fit?.fit();
    } catch {
      // siehe oben — defensive bei 0×0-Boxes.
    }
  }, [settings.terminal_font_family, settings.terminal_font_size]);

  return (
    <div className="td-terminal-pane">
      <div className="td-terminal-bar">
        <span className="td-terminal-bar-label">claude</span>
        <span className="td-terminal-bar-meta">
          {session
            ? `${session.title} · ${session.current_model ?? model}`
            : error
              ? `Fehler: ${error}`
              : 'starte …'}
        </span>
      </div>
      <div ref={containerRef} className="td-terminal-canvas" />
    </div>
  );
}
