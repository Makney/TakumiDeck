import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { AppSettings, SessionStatus } from '@shared/types';
import { createCopyPasteKeyHandler } from '../components/clipboardKeyHandler';

// Sprint-3-Multi-Tab-Variante des Single-Tab-TerminalPane aus Sprint 2.
//
// Wichtige Unterschiede:
// - sessionId kommt als Prop (aus useSessionStore), nicht aus dem useEffect — verhindert
//   die StrictMode-Falle aus Sprint 2 (jede Mount-Iteration generierte sonst neue UUIDs).
// - Kein interner initRef-Guard mehr; React-StrictMode-Double-Mount ist durch den
//   stabilen sessionId-Prop entschärft (zwei Mounts mit gleicher ID brechen am
//   manager.create-Duplicate-Check ab — der gewollte Sprint-2-Schutz greift weiterhin).
// - Tab-Sichtbarkeit kommt vom Eltern-Container (display:none/flex). Wenn der Tab
//   inaktiv ist, sind die ResizeObserver-Boxen 0×0 — fit() wird per try/catch
//   verworfen und wir vermeiden PTY-Resize-Spam.
// - Beim Statuswechsel auf running (Resume) re-subscriben wir die PTY-Listener nicht;
//   sie bleiben aktiv, weil sie nach sessionId filtern und auch für den neuen Spawn gelten.

interface Props {
  sessionId: string;
  // Sprint-5: Renderer schickt projectId beim pty:create mit, damit die DB-Session
  // am echten Projekt hängt (statt am Sprint-2-Default-Lifeline). Token-Aggregate
  // pro Projekt brauchen das Mapping korrekt.
  // Bereich-4-Review (B-5): cwd wird im Main aus projects.getById(projectId).path
  // hergeleitet — Renderer übergibt keine Working-Directory mehr.
  projectId: string;
  title: string;
  type: 'feature' | 'bug' | 'review' | 'docs-sync';
  model: string;
  settings: AppSettings;
  isActive: boolean;
  // Wird genau dann auf true gesetzt, wenn dieser Tab gerade frisch im Store erzeugt wurde
  // und seine PTY noch nicht existiert. Beim Resume ist es false (PTY wird vom Resume-IPC
  // gespawnt — der Tab existiert ja bereits).
  needsSpawn: boolean;
  onStatusChange: (sessionId: string, status: SessionStatus) => void;
}

export function TerminalTab({
  sessionId,
  projectId,
  title,
  type,
  model,
  settings,
  isActive,
  needsSpawn,
  onStatusChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Guard gegen React-StrictMode-Double-Effect: pty:create darf pro Tab-Instanz nur
  // EINMAL gefeuert werden, sonst kollidiert der zweite Aufruf an der UNIQUE-Constraint
  // auf sessions.id. Die Ref überlebt die StrictMode-Mount→Cleanup→Remount-Sequenz,
  // weil React den Fiber wiederverwendet.
  const spawnDispatchedRef = useRef(false);

  // xterm-Initialisierung läuft genau einmal pro Tab-Lebensdauer (sessionId ist stabil).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      fontFamily: settings.terminal_font_family,
      fontSize: settings.terminal_font_size,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: '#0d0f0e',
        foreground: '#d3d6cf',
        cursor: '#4ade80',
        // Dezentes Highlight im dunklen Theme — niedrige Alpha, damit leere Zellen
        // nicht als grüne Wand wirken; selectionForeground bewusst NICHT gesetzt,
        // damit der Original-Vordergrund auf gefüllten Zeilen lesbar bleibt.
        selectionBackground: 'rgba(74, 222, 128, 0.18)',
      },
    });
    terminalRef.current = terminal;

    // Copy/Paste-Wiring: Ctrl+Shift+C kopiert Selection, Ctrl+Shift+V pastet via
    // Bracketed-Paste-Mode. Ctrl+C bleibt SIGINT, Ctrl+V bleibt PTY-Input — die
    // Standard-Konvention von Windows Terminal / VS Code / Alacritty.
    terminal.attachCustomKeyEventHandler(
      createCopyPasteKeyHandler({
        clipboard: navigator.clipboard,
        getTerminal: () => terminalRef.current,
      }),
    );

    const fit = new FitAddon();
    fitRef.current = fit;
    terminal.loadAddon(fit);
    terminal.loadAddon(new SearchAddon());
    terminal.loadAddon(new SerializeAddon());
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    // Canvas-Renderer erst NACH .open() laden — sonst kein Canvas-Element zum Anhängen.
    terminal.loadAddon(new CanvasAddon());

    safeFit(fit);

    // PTY-Events filtern hart auf sessionId, sodass bei N Tabs jeder nur seine eigenen
    // Daten schreibt. Der Renderer-Bus sendet sonst ein pty:data-Event an alle Tabs.
    const offData = window.api.pty.onData((event) => {
      if (event.sessionId !== sessionId) return;
      terminal.write(event.data);
    });
    const offExit = window.api.pty.onExit((event) => {
      if (event.sessionId !== sessionId) return;
      terminal.write(
        `\r\n\x1b[33m[Session beendet · exitCode=${event.exitCode}]\x1b[0m\r\n`,
      );
      // Status im Store aktualisieren, damit die Tab-Pille einen Resume-Hinweis anzeigt.
      // Die DB-Wahrheit kommt vom Lifecycle (pty:exit-Handler) — der Renderer setzt
      // hier nur die UI-Spiegelung, damit kein Round-Trip nötig ist.
      onStatusChange(sessionId, 'completed');
    });

    terminal.onData((data) => {
      void window.api.pty.write({ sessionId, data });
    });
    terminal.onResize(({ cols, rows }) => {
      void window.api.pty.resize({ sessionId, cols, rows });
    });

    // Sprint 9 — Resize-Pipeline robuster:
    //   - ResizeObserver feuert bei Container-Größen-Änderungen, aber der
    //     Callback kommt manchmal vor dem finalen Layout-Tick → fit() liest
    //     dann stale `clientWidth`-Werte. requestAnimationFrame verschiebt
    //     das fit() in den nächsten Paint, wenn der DOM-Layout final ist.
    //   - Zusätzlich window.resize als Backup: ResizeObserver fängt zwar
    //     Container-Changes, aber bei einigen Browser-Edge-Cases (z.B.
    //     Display-Scaling-Wechsel) feuert nur das Window-Event.
    //   - rafScheduled-Guard, damit ein einzelner Resize-Burst nicht
    //     mehrere fit()-Calls absetzt.
    let rafScheduled = false;
    const scheduleFit = () => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        safeFit(fit);
      });
    };
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(container);
    window.addEventListener('resize', scheduleFit);

    // Spawn nur, wenn der Tab gerade frisch im Store entstanden ist (NewSessionModal-Pfad).
    // Resume spawnt seine PTY über session:resume — der TerminalTab-Mount wird dann
    // ausgelöst, ohne dass ein zweiter pty:create losgeht.
    // Zusätzlich Ref-Guard: StrictMode-Dev mountet den Effect zweimal; die zweite
    // Mount-Iteration darf KEIN zweites pty:create lostreten (UNIQUE-Constraint).
    //
    // Sprint 9 — Spawn nach RAF: das initiale `safeFit` direkt nach
    // `terminal.open` läuft manchmal vor dem finalen Layout-Tick → terminal.cols
    // ist dann auf 80 (Default) statt der echten Container-Breite. claude-code
    // formatiert seinen Welcome-Output mit den falschen cols → Output wird
    // rechts abgeschnitten. RAF stellt sicher, dass das Layout final ist,
    // bevor wir die cols an die PTY schicken.
    let spawnRafHandle: number | null = null;
    if (needsSpawn && !spawnDispatchedRef.current) {
      spawnDispatchedRef.current = true;
      const doSpawn = async () => {
        const result = await window.api.pty.create({
          sessionId,
          projectId,
          title,
          type,
          model,
          cols: terminal.cols,
          rows: terminal.rows,
        });
        if (!result.ok) {
          showError(errorRef.current, result.error);
          onStatusChange(sessionId, 'error');
          offData();
          offExit();
          // Sprint 8 — Spawn-Fehler kann „claude-Binary nicht erreichbar" sein
          // (typische Ursache: PATH-Wechsel ohne App-Restart). Header-Bar
          // re-checkt seinen Health-Status, damit der ⚠-Banner sofort erscheint.
          window.dispatchEvent(new CustomEvent('td-claude-recheck'));
        } else if (isActive) {
          terminal.focus();
        }
      };
      // Bereich-7-Review: RAF-Handle in Variable, damit die Cleanup-Funktion
      // einen Spawn abbrechen kann, wenn der Tab im 16-ms-Fenster zwischen
      // Schedule und Fire unmountet. Sonst würde pty:create eine PTY anlegen,
      // deren Output-Listener bereits abgemeldet ist (Renderer-loser Prozess).
      spawnRafHandle = requestAnimationFrame(() => {
        spawnRafHandle = null;
        safeFit(fit);
        void doSpawn();
      });
    }

    return () => {
      if (spawnRafHandle !== null) cancelAnimationFrame(spawnRafHandle);
      offData();
      offExit();
      ro.disconnect();
      window.removeEventListener('resize', scheduleFit);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // sessionId ist stabil über die Lebensdauer des Tabs — der Effect läuft
    // bewusst genau einmal. settings/title/type/model ändern sich nicht
    // im Tab-Context (UI bietet keinen In-Place-Editor); needsSpawn wird vor
    // dem Mount fixiert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Wenn der Tab aktiv wird, fit() neu laufen lassen + Fokus setzen. Ohne diesen
  // Effect bliebe das Terminal nach einem Tab-Wechsel auf der alten 0×0-Größe stehen,
  // weil ResizeObserver erst beim nächsten Container-Resize feuert.
  // Sprint 9 — RAF um den Aktiv-Switch-Fit, weil das CSS-Toggle (display:flex
  // ↔ display:none) erst im nächsten Paint die finale Container-Größe gibt.
  useEffect(() => {
    if (!isActive) return;
    const handle = requestAnimationFrame(() => {
      safeFit(fitRef.current);
      // Bereich-7-Review: Ref direkt im RAF-Callback lesen, damit der Fokus
      // auf der jüngsten Terminal-Instanz landet (z.B. nach StrictMode-Remount).
      terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(handle);
  }, [isActive]);

  // Sprint 6: TemplatesModal sendet einen 'td-template-send'-CustomEvent, der
  // vom AKTIVEN Tab konsumiert wird. terminal.paste() wickelt automatisch die
  // Bracketed-Paste-Sequenz \x1b[200~...\x1b[201~ um den Text — claude-code
  // erkennt das und verarbeitet den Block als ein Eingabe-Event (genau wie der
  // Copy/Paste-Pfad aus Sprint 3.5). Listener mit unsubscribe-Cleanup, kein
  // useRef-Guard nötig (Memory: Guard nur für Server-Mutationen).
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (!detail || typeof detail.text !== 'string') return;
      terminalRef.current?.paste(detail.text);
    };
    window.addEventListener('td-template-send', handler);
    return () => window.removeEventListener('td-template-send', handler);
  }, [isActive]);

  // Hot-Update der Schriftart, wenn der User die Settings ändert.
  useEffect(() => {
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = settings.terminal_font_family;
    terminal.options.fontSize = settings.terminal_font_size;
    safeFit(fit);
  }, [settings.terminal_font_family, settings.terminal_font_size]);

  // Fokus-Fang: ein Klick irgendwo im Terminal-Bereich (auch ins Padding um die
  // xterm-Canvas) fordert den Fokus für xterms hidden textarea zurück. Sonst muss
  // der User exakt auf die Canvas klicken, sonst bleibt der Fokus auf dem zuletzt
  // gedrückten Button (Tab-Pille, +-Button, Modal-Submit) — und Ctrl+C/V wirken
  // nicht, weil xterm seinen attachCustomKeyEventHandler nicht erreicht.
  const handleHostMouseDown = () => {
    terminalRef.current?.focus();
  };

  return (
    <div className="td-terminal-pane" onMouseDown={handleHostMouseDown}>
      <div ref={containerRef} className="td-terminal-canvas" />
      <div ref={errorRef} className="td-terminal-error" hidden />
    </div>
  );
}

function safeFit(fit: FitAddon | null): void {
  if (!fit) return;
  try {
    fit.fit();
  } catch {
    // ResizeObserver feuert manchmal mit 0×0 (Tab inaktiv, Animationen) — dann ignorieren.
  }
}

function showError(el: HTMLDivElement | null, msg: string): void {
  if (!el) return;
  el.textContent = `Fehler: ${msg}`;
  el.hidden = false;
}

export type { Props as TerminalTabProps };
