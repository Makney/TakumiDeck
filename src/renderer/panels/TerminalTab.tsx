import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { AppSettings, SessionStatus } from '@shared/types';
import { detectFromBuffer, type TuiDetectedState } from '@shared/tui-patterns';
import { createCopyPasteKeyHandler } from '../components/clipboardKeyHandler';
import { clampFontSize, nextZoomFontSize } from '../components/terminalFontZoom';
import {
  safeDisposeAddon,
  safeDisposeTerminal,
  type DisposableLike,
} from '../components/safeDispose';
import { trimBufferSnapshot } from '@shared/buffer-snapshot';
import { useProjectStore } from '../stores/projects';
import { useSessionStore } from '../stores/sessions';
import { TerminalSearchBar } from './terminal/TerminalSearchBar';
import { TerminalContextMenu } from './terminal/TerminalContextMenu';
import {
  createImagePasteSaver,
  loadRendererAddonWithFallback,
  safeFit,
  showError,
  snapshotBufferLines,
} from './terminal/terminalHelpers';
import { useTerminalFontZoom } from './terminal/useTerminalFontZoom';
import { useTerminalSearch } from './terminal/useTerminalSearch';
import { useTerminalContextMenu } from './terminal/useTerminalContextMenu';
import { useTerminalDragDrop } from './terminal/useTerminalDragDrop';

// Phase-2 Season-1: Tick-Intervall für TUI-Pattern-Match auf dem xterm-Buffer.
// 1 s ist der Sweet-Spot zwischen Permission-Prompt-Reaktionszeit und CPU-Last
// bei vielen Tabs. Die letzten ~30 Zeilen reichen für Claude-Code-Dialoge.
const TUI_POLL_INTERVAL_MS = 1000;
const TUI_POLL_WINDOW_LINES = 30;

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
  type: 'feature' | 'bug' | 'review' | 'docs-sync' | 'custom' | 'terminal';
  model: string;
  // Phase-2 Season-5: bei type='custom' die User-Bezeichnung — wird an pty:create
  // durchgereicht und vom Main in die sessions.custom_type_label-Spalte gespeichert.
  customTypeLabel: string | null;
  settings: AppSettings;
  isActive: boolean;
  // Wird genau dann auf true gesetzt, wenn dieser Tab gerade frisch im Store erzeugt wurde
  // und seine PTY noch nicht existiert. Beim Resume ist es false (PTY wird vom Resume-IPC
  // gespawnt — der Tab existiert ja bereits).
  needsSpawn: boolean;
  // Phase-2 Season-21: vorbereiteter Prompt fuer Docs-Sync-Sessions. Wird
  // nach erfolgreichem Spawn einmalig via Bracketed-Paste an die PTY gesendet.
  // null fuer alle anderen Sessions.
  initialPrompt: string | null;
  // One-Shot-Callback nach erfolgreichem Prompt-Send — TabContainer entfernt
  // den Eintrag aus seiner Map, damit ein erneuter Tab-Mount nicht erneut
  // sendet.
  onInitialPromptSent: (sessionId: string) => void;
  onStatusChange: (sessionId: string, status: SessionStatus) => void;
}

export function TerminalTab({
  sessionId,
  projectId,
  title,
  type,
  customTypeLabel,
  model,
  settings,
  isActive,
  needsSpawn,
  initialPrompt,
  onInitialPromptSent,
  onStatusChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Phase-2 Season-28: Search-Addon-Ref fuer die Ctrl+Shift+F-Suchbar. Die Bar
  // sitzt im Render-Tree dieses Components, ruft aber direkt addon.findNext/
  // findPrevious — kein State-Sync ueber die Renderer-Grenze noetig.
  const searchAddonRef = useRef<SearchAddon | null>(null);
  // Bugfix 2026-05-19: Renderer-Addon-Ref (WebGL oder Canvas-Fallback). Wird
  // beim Tab-Close VOR `terminal.dispose()` separat disposed, weil
  // @xterm/addon-webgl@0.19.0 im internen dispose-Pfad eine TypeError wirft
  // wenn der GL-Renderer noch nicht voll initialisiert ist (Shader-Compile
  // ist async). Ohne den fruehen Dispose mit try/catch bubblte die Exception
  // aus dem React-Effect-Cleanup und riss den Render-Tree mit.
  const rendererAddonRef = useRef<DisposableLike | null>(null);
  // Phase-2 Season-28: TUI-Poll-Kontrolle. Der isActive-Effect ruft pause/start,
  // die Implementierungen leben aber im Init-Effect (Closure ueber lastPushedState
  // usw.). Ref ist der einfachste Weg ueber die Effect-Grenze ohne Re-Bindings.
  const tuiControlRef = useRef<{ start: () => void; pause: () => void } | null>(null);
  // Phase-2 Season-36: UI-Logik in Custom-Hooks ausgelagert (Font-Zoom, Suche,
  // Kontextmenue, Drag-Drop). Der Init-Effekt unten bleibt unangetastet; die
  // Hooks reichen die noetigen Refs + Setter durch, die er weiterhin schliesst
  // (fontSizeOverride/setFontSizeOverride fuer Wheel-Zoom, searchVisible/
  // setSearchVisible fuer Ctrl+Shift+F + Escape-Routing).
  const { fontSizeOverride, setFontSizeOverride } = useTerminalFontZoom(
    terminalRef,
    fitRef,
    settings,
  );
  const {
    searchVisible,
    setSearchVisible,
    searchQuery,
    setSearchQuery,
    handleSearchNext,
    handleSearchPrev,
    closeSearch,
  } = useTerminalSearch(terminalRef, searchAddonRef);
  const {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleMenuCopy,
    handleMenuPaste,
    handleMenuClear,
    handleMenuSearch,
  } = useTerminalContextMenu(terminalRef, setSearchVisible);
  const {
    isDropTarget,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useTerminalDragDrop(terminalRef);
  // Scroll-to-Bottom-Button-State bleibt lokal — der Init-Effekt (onScroll)
  // setzt ihn, der Button im JSX liest ihn.
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Zustand-Store-Setter fuer den Bell-Marker. Wird vom onBell-Handler im Effect
  // gerufen — nur wenn der Tab inaktiv ist (sonst sieht der User es ohnehin).
  const setBell = useSessionStore((s) => s.setBell);
  // isActive in Ref spiegeln, damit der einmalig gebundene onBell-Handler den
  // aktuellen Aktiv-Status sieht ohne neu zu binden.
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  // Guard gegen React-StrictMode-Double-Effect: pty:create darf pro Tab-Instanz nur
  // EINMAL gefeuert werden, sonst kollidiert der zweite Aufruf an der UNIQUE-Constraint
  // auf sessions.id. Die Ref überlebt die StrictMode-Mount→Cleanup→Remount-Sequenz,
  // weil React den Fiber wiederverwendet.
  const spawnDispatchedRef = useRef(false);
  // Phase-2 Season-21: Snapshot des initialPrompts beim Mount. Der Spawn-Effekt
  // laeuft nur einmal pro Tab-Lebensdauer ([sessionId]-Dep); deshalb muss die
  // initialPrompt-Prop nicht in die Dep-Liste — die Ref bewahrt den Wert vom
  // Erstrender. Callback genauso per Ref, damit Identitaets-Wechsel den
  // Spawn-Effekt nicht neu starten.
  const initialPromptRef = useRef(initialPrompt);
  const onInitialPromptSentRef = useRef(onInitialPromptSent);
  useEffect(() => {
    initialPromptRef.current = initialPrompt;
  }, [initialPrompt]);
  useEffect(() => {
    onInitialPromptSentRef.current = onInitialPromptSent;
  }, [onInitialPromptSent]);

  // xterm-Initialisierung läuft genau einmal pro Tab-Lebensdauer (sessionId ist stabil).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Phase-2 Season-28: Mehrere Terminal-Optionen gebuendelt:
    // - scrollback hoch auf 5000 (Default 1000 schneidet lange claude-Outputs oben ab).
    // - smoothScrollDuration bewusst 0: bei jedem Wheel-Tick eine Easing-
    //   Animation rein zu nehmen fuehlt sich entgegen der Intuition LANGSAMER
    //   an als Instant-Jumps. Klassisches Terminal-Verhalten (Windows Terminal,
    //   iTerm, alacritty) ist instant — wir folgen dieser Konvention.
    // - cursorBlink an isActive gekoppelt; inaktive Tabs sollen die GPU nicht
    //   per Blink wachhalten (wichtig bei vielen parallelen Seasons).
    // - wordSeparator: Default trennt an :/\\, sodass Doppelklick auf
    //   `src/foo.ts:42` nur „foo" markiert. Wir engen die Separator-Menge
    //   auf echte Wort-Grenzen ein — Pfade + file:line werden so in einem
    //   Doppelklick selektierbar.
    // - Bell-Handling: xterm v5 hat bellStyle entfernt; onBell-Handler reicht
    //   fuer unser Modell, weil der visuelle Tab-Pulse die Aufmerksamkeits-
    //   Signalisierung uebernimmt.
    const terminal = new Terminal({
      fontFamily: settings.terminal_font_family,
      fontSize: clampFontSize(fontSizeOverride ?? settings.terminal_font_size),
      cursorBlink: isActive,
      allowProposedApi: true,
      scrollback: 5000,
      smoothScrollDuration: 0,
      wordSeparator: ' ()[]{}\'",;<>',
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
    //
    // Phase-2 Season-2: imagePasteSaver-Driver für Win+Shift+S → Snip im Clipboard
    // → Ctrl+Shift+V. Liefert er einen Pfad zurück, pastet der Handler den statt
    // des Text-Inhalts; sonst läuft der klassische Text-Pfad.
    const copyPasteHandler = createCopyPasteKeyHandler({
      clipboard: navigator.clipboard,
      getTerminal: () => terminalRef.current,
      imagePasteSaver: createImagePasteSaver(),
    });
    // Phase-2 Season-28: Zwei Search-/Clear-Shortcuts werden vor der Copy/Paste-
    // Logik abgefangen, weil sie keine PTY-Weiterleitung kennen. Ctrl+Shift+L
    // ist bewusst nicht Ctrl+L — Ctrl+L bleibt fuer die Bash/Readline-Pass-
    // Through (Shell-natives Clear). Ctrl+Shift+L raeumt nur den xterm-Buffer,
    // damit der Shortcut auch in TUI-Apps wirkt, die Ctrl+L schlucken.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.ctrlKey && event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === 'f') {
          setSearchVisible(true);
          return false;
        }
        if (key === 'l') {
          terminal.clear();
          return false;
        }
      }
      // Escape schliesst die Search-Bar, falls offen. Ohne explizites Routing
      // ginge das Escape sonst direkt an die PTY und z.B. eine offene
      // Permission-Frage abbrechen.
      if (
        event.type === 'keydown' &&
        event.key === 'Escape' &&
        searchVisible
      ) {
        setSearchVisible(false);
        return false;
      }
      return copyPasteHandler(event);
    });

    // Phase-2 Season-28: Ctrl+Mausrad → Font-Zoom. attachCustomWheelEventHandler
    // existiert seit xterm 5.4 und laeuft VOR der xterm-eigenen Scroll-Logik —
    // Return false unterdrueckt die Scroll-Aktion fuer den Zoom-Pfad. Ohne
    // Ctrl-Key kommt true zurueck, damit der normale Scroll-Pfad in xterm
    // (inkl. smoothScrollDuration) laeuft.
    terminal.attachCustomWheelEventHandler((event) => {
      if (!event.ctrlKey) return true;
      event.preventDefault();
      setFontSizeOverride((prev) => {
        const current = prev ?? settings.terminal_font_size;
        return nextZoomFontSize(current, event.deltaY);
      });
      return false;
    });

    const fit = new FitAddon();
    fitRef.current = fit;
    terminal.loadAddon(fit);
    // Phase-2 Season-28: Search-Addon-Referenz fuer die Ctrl+Shift+F-Bar
    // festhalten — die Render-Tree-Komponente unten ruft findNext/findPrevious
    // direkt darauf.
    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    terminal.loadAddon(searchAddon);
    // Phase-2 Season-33: SerializeAddon liefert beim Tab-Close die ANSI-haltige
    // Buffer-Repraesentation, die wir bei Terminal-Sessions persistieren. Wir
    // halten die Instanz, weil der anonyme Constructor-Aufruf von vorher keine
    // Referenz hinterliess — Season 28 hat das Addon nur fuer Pattern-Match-
    // Snapshots geladen, ohne den Persist-Pfad zu adressieren.
    const serializeAddon = new SerializeAddon();
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Phase-2 Season-5 Bugfix: terminal.open + Renderer-Addon erst im naechsten
    // Animation-Frame ausfuehren. xterms Viewport-Konstruktor schedult intern
    // ein setTimeout(0, syncScrollArea), das `renderer.dimensions` liest —
    // wenn der Container in dem Moment 0x0 hat (Modal-Schliessen direkt vor
    // dem Tab-Mount), ist der RenderService noch nicht voll initialisiert, der
    // Timer wirft "Cannot read properties of undefined (reading 'dimensions')",
    // und der Viewport ist halb-tot: PTY-Daten landen im Buffer, werden aber
    // nicht mehr gezeichnet (Symptom: Terminal bleibt leer, Claude scheint
    // nicht zu starten). Das initiale RAF gibt der Browser-Layout-Engine eine
    // Tick Zeit, den Container final zu vermessen.
    //
    // Phase-2 Season-28: Renderer-Wahl WebGL primaer, Canvas als Fallback.
    // WebGL nutzt den GPU-Glyph-Cache und scrollt deutlich fluessiger mit
    // mehreren parallelen Tabs. Der Fallback greift in zwei Faellen:
    //   1. Konstruktor wirft (z.B. WebGL im Renderer-Prozess deaktiviert
    //      oder Treiber-Bug) — try/catch baut Canvas auf.
    //   2. Context-Loss zur Laufzeit (z.B. GPU-Reset durch Treiber-Update) —
    //      onContextLoss disposed WebGL und laedt Canvas nach.
    let initRafHandle: number | null = requestAnimationFrame(() => {
      initRafHandle = null;
      // Guard: useEffect-Cleanup koennte zwischen Schedule und Fire bereits
      // gelaufen sein (StrictMode-Double-Mount oder Tab-Close in <16ms).
      if (terminalRef.current !== terminal) return;
      terminal.open(container);
      rendererAddonRef.current = loadRendererAddonWithFallback(terminal, (next) => {
        // Context-Loss-Pfad hat den Renderer ausgetauscht — Ref nachziehen,
        // damit der Cleanup spaeter den richtigen Addon disposed.
        rendererAddonRef.current = next;
      });
      safeFit(fit);
    });

    // Phase-2 Season-21: TUI-Poll-Timer als forward-declared let, damit der
    // pty:exit-Handler ihn stoppen kann. Ohne diesen Cut laeuft die Pattern-
    // Erkennung gegen den eingefrorenen xterm-Buffer weiter, sieht den letzten
    // Claude-Input-Prompt als `waiting` und ueberschreibt das gerade gesetzte
    // `completed` lokal im Store — Action-Bar zeigt dann faelschlich „wartet".
    // Main-DB ist davon nicht betroffen (pty:exit-Handler dort filtert
    // terminalen Status), aber der Renderer driftet auseinander.
    //
    // Phase-2 Season-28: Der Timer ist jetzt pausenfaehig — bei inaktiven Tabs
    // pausieren wir ihn ueber den isActive-Effect, damit die N Hintergrund-Tabs
    // bei Multi-Season-Workflow keine N×Buffer-Snapshots pro Sekunde produzieren.
    // Permission-Prompts in inaktiven Tabs werden erst beim naechsten Aktivieren
    // erkannt; das ist akzeptabel, weil der Bell-Indikator parallel laeuft und
    // den User auf Aufmerksamkeitswuensche hinweist.
    let tuiTimer: ReturnType<typeof setInterval> | null = null;
    let lastPushedState: TuiDetectedState = 'running';
    let lastBufferSignature: string | null = null;
    let tuiPermanentlyStopped = false;
    const tuiTick = (): void => {
      const term = terminalRef.current;
      if (!term) return;
      const lines = snapshotBufferLines(term, TUI_POLL_WINDOW_LINES);
      const signature = lines.join('\n');
      const bufferChanged =
        lastBufferSignature !== null && signature !== lastBufferSignature;
      lastBufferSignature = signature;
      const detected = detectFromBuffer({ lines, bufferChanged });
      let toPush: TuiDetectedState | null = null;
      if (detected === 'permission-prompt') {
        toPush = 'permission-prompt';
      } else if (lastPushedState === 'permission-prompt') {
        toPush = 'running';
      } else if (detected === 'waiting') {
        toPush = 'waiting';
      } else if (detected === 'running' && lastPushedState !== 'running') {
        toPush = 'running';
      }
      if (toPush !== null && toPush !== lastPushedState) {
        void window.api.pty.pushTuiState({ sessionId, state: toPush });
        onStatusChange(sessionId, toPush);
        lastPushedState = toPush;
      }
    };
    const startTui = () => {
      if (tuiPermanentlyStopped || tuiTimer !== null) return;
      tuiTimer = setInterval(tuiTick, TUI_POLL_INTERVAL_MS);
    };
    const pauseTui = () => {
      if (tuiTimer !== null) {
        clearInterval(tuiTimer);
        tuiTimer = null;
      }
    };
    const stopTui = () => {
      tuiPermanentlyStopped = true;
      pauseTui();
    };
    // Phase-2 Season-28: pause/resume-API ueber den outer-Effect erreichbar
    // machen, ohne die useEffect-Closure neu zu binden. Refs sind stabil und
    // schaden dem StrictMode-Pfad nicht.
    tuiControlRef.current = { start: startTui, pause: pauseTui };

    // Phase-2 Season-33: Pre-Frame-Queue fuer den Restore-Pfad. Bei resumed
    // Terminal-Sessions (type='terminal' && !needsSpawn) laden wir den
    // persistierten xterm-Buffer per IPC und schreiben ihn vor dem ersten
    // PTY-Frame in xterm. Die Queue puffert pty:data-Events, die der Renderer
    // empfaengt, bevor der Restore-IPC zurueck ist — sonst landen pwsh-Welcome-
    // Zeilen vor dem alten Verlauf, und die Reihenfolge ist kaputt. Bei allen
    // anderen Faellen (Spawn-Mount, claude-Sessions) ist `restoreReady` sofort
    // true, der Queue-Pfad ist no-op.
    // Bereich-PANELS-Review 1.3: type/needsSpawn werden hier als Closure-
    // Snapshot beim Mount eingefroren — konsistent mit dem [sessionId]-only-
    // Effect (siehe Kommentar am Effect-Ende). Beide aendern sich im Tab-
    // Kontext nicht (kein In-Place-Typ-Editor). Falls je ein In-Place-Wechsel
    // von `type` eingefuehrt wird, sind Restore- UND Persist-Pfad stale —
    // dann diese Annahme erneut pruefen.
    const isTerminalSession = type === 'terminal';
    const shouldRestoreBuffer = isTerminalSession && !needsSpawn;
    const pendingFrames: string[] = [];
    let restoreReady = !shouldRestoreBuffer;
    // Bereich-PANELS-Review 1.2: Dirty-Flag. true, sobald nach dem Restore
    // echter PTY-Inhalt in den Buffer geschrieben wurde (onData/onExit/Flush).
    // Der Restore-Snapshot selbst setzt das Flag NICHT — dann ist der Buffer
    // identisch zum gespeicherten Stand und der Cleanup-Save kann den
    // idempotenten Serialize+IPC-Roundtrip ueberspringen.
    let bufferDirty = false;

    const flushPendingFrames = (): void => {
      if (pendingFrames.length === 0) return;
      for (const data of pendingFrames) terminal.write(data);
      pendingFrames.length = 0;
      // Gequeuete Frames sind echte PTY-Daten → Buffer ist jetzt veraendert.
      bufferDirty = true;
    };

    if (shouldRestoreBuffer) {
      // Fire-and-forget IPC. Wenn der Tab unmounted, bevor der Snapshot
      // zurueckkommt (terminalRef-Check schuetzt), verwerfen wir das Ergebnis
      // still — der naechste Mount ruft sowieso erneut.
      void window.api.terminal
        .loadBuffer({ sessionId })
        .then((result) => {
          if (terminalRef.current !== terminal) return;
          if (result.ok && result.data.snapshot !== null) {
            terminal.write(result.data.snapshot);
          }
        })
        .catch((e) => {
          console.warn('[TerminalTab] terminal:load-buffer fehlgeschlagen', e);
        })
        .finally(() => {
          if (terminalRef.current !== terminal) return;
          restoreReady = true;
          flushPendingFrames();
        });
    }

    // PTY-Events filtern hart auf sessionId, sodass bei N Tabs jeder nur seine eigenen
    // Daten schreibt. Der Renderer-Bus sendet sonst ein pty:data-Event an alle Tabs.
    //
    // Phase-2 Season-33: solange der Restore noch laeuft (nur bei resumed
    // terminal-Sessions ueberhaupt true), landen Frames in der Queue.
    const offData = window.api.pty.onData((event) => {
      if (event.sessionId !== sessionId) return;
      if (!restoreReady) {
        pendingFrames.push(event.data);
        return;
      }
      terminal.write(event.data);
      bufferDirty = true;
    });
    const offExit = window.api.pty.onExit((event) => {
      if (event.sessionId !== sessionId) return;
      // Bereich-PANELS-Review 1.1: die Beendet-Zeile MUSS denselben Queue-Pfad
      // wie onData nehmen. Sonst landet sie bei einem resumed-direkt-Exit
      // (loadBuffer noch in flight) vor dem restaurierten Verlauf und den
      // gepufferten Frames — genau die Reihenfolge-Vertauschung, die die
      // pendingFrames-Queue verhindern soll.
      const exitLine = `\r\n\x1b[33m[Session beendet · exitCode=${event.exitCode}]\x1b[0m\r\n`;
      if (!restoreReady) {
        pendingFrames.push(exitLine);
      } else {
        terminal.write(exitLine);
        bufferDirty = true;
      }
      // Status im Store aktualisieren, damit die Tab-Pille einen Resume-Hinweis anzeigt.
      // Die DB-Wahrheit kommt vom Lifecycle (pty:exit-Handler) — der Renderer setzt
      // hier nur die UI-Spiegelung, damit kein Round-Trip nötig ist.
      onStatusChange(sessionId, 'completed');
      // TUI-Poll-Timer abraeumen — sonst sieht der naechste Tick den stehenden
      // Buffer und pusht `waiting`/`running` ueber den gerade gesetzten
      // `completed`-Status.
      stopTui();
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
    // Phase-2 Season-21: setTimeout-Handle fuer den Auto-Send des Docs-Sync-
    // Prompts. Im Cleanup geclearedt, falls der Tab unmountet bevor das Warmup
    // verstrichen ist.
    let initialPromptTimer: ReturnType<typeof setTimeout> | null = null;
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
          customTypeLabel,
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
        } else {
          // Phase-2 Season-21: bei type='feature' hat der Main eine neue
          // season_number alloziert und auf die frische Session-Row geschrieben.
          // Renderer-Projekt-Store haelt next_season_number als korrelierte
          // Subquery-Spalte vom letzten projects:list-Call — also stale. Reload
          // damit NewSessionModal/TemplatesModal beim naechsten Open die neue
          // Nummer zeigen.
          if (type === 'feature') {
            void useProjectStore.getState().reload();
          }
          if (isActive) {
            terminal.focus();
          }
          // Phase-2 Season-21: Auto-Send des Docs-Sync-Prompts. Warmup-Delay,
          // bis Claudes TUI seine Input-Box gerendert hat — sonst landet der
          // Paste im Hochfahr-Splash und wird verschluckt. Bracketed-Paste +
          // separates `\r` analog zur Trigger-Phrasen-Mechanik aus Season 3.
          const prompt = initialPromptRef.current;
          if (prompt && prompt.length > 0) {
            initialPromptTimer = setTimeout(() => {
              initialPromptTimer = null;
              terminalRef.current?.paste(prompt);
              void window.api.pty.write({ sessionId, data: '\r' });
              onInitialPromptSentRef.current(sessionId);
            }, 2500);
          }
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

    // Phase-2 Season-1: TUI-Pattern-Poll.
    //
    // Verantwortlichkeiten nach dem Phase-2-Refactor:
    //   - permission-prompt: TUI (nicht in JSONL sichtbar).
    //   - waiting: TUI (Input-Prompt ohne esc-to-interrupt).
    //     JSONL-Loop setzt running-Sessions nicht mehr auf waiting — extended
    //     thinking macht JSONL stale, ohne dass Claude fertig ist.
    //   - running (keep-alive): TUI via runningIndicators (esc-to-interrupt
    //     sichtbar) oder Rückweg aus permission-prompt.
    //   - running/idle: JSONL-Loop (frischer/staler Timestamp).
    //
    // lastPushedState startet auf 'running' (Initialstatus jeder Session),
    // damit der erste Tick keine redundante running→running-Transition schickt.
    //
    // Phase-2 Season-28: Der Tick-Loop selbst liegt jetzt in tuiTick (oben);
    // hier nur noch das Starten — und nur dann, wenn der Tab beim Mount aktiv
    // ist. Inaktive Tabs starten den Loop erst beim Aktivieren.
    if (isActiveRef.current) {
      startTui();
    }

    // Phase-2 Season-28: Bell-Indikator. Wenn die PTY ein BEL (\a) absetzt und
    // der Tab gerade inaktiv ist, markieren wir ihn im Store — die Tab-Pille
    // zeigt dann ein Pulse-Akzent, bis der User den Tab aktiviert. Wenn der
    // Tab aktiv ist, sieht der User es ohnehin; kein Marker noetig.
    terminal.onBell(() => {
      if (!isActiveRef.current) {
        setBell(sessionId, true);
      }
    });

    // Phase-2 Season-28: Scroll-to-Bottom-Button. xterm haelt die Buffer-
    // Scroll-Position in viewportY; gleich der Anzahl der Backlog-Zeilen
    // (buffer.baseY) bedeutet "ganz unten". Sobald der User hochscrollt
    // und neue Daten reinkommen, zeigen wir den Button. Wir koppeln nicht
    // an onData, weil der Scroll-Event nach jedem Buffer-Refresh feuert
    // und damit auch bei reinem Output ohne User-Scroll triggern wuerde —
    // das ist hier gewollt: solange der User scrollt, sieht er den Button.
    terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      // baseY = oberste sichtbare Zeile, wenn ganz nach unten gescrollt;
      // viewportY < baseY heisst "User hat hochgescrollt".
      const isAtBottom = buffer.viewportY >= buffer.baseY;
      setShowScrollToBottom(!isAtBottom);
    });

    return () => {
      // Phase-2 Season-33: Buffer-Snapshot persistieren, BEVOR der Terminal
      // disposed wird (serialize() braucht den lebenden Buffer). Nur fuer
      // terminal-Sessions: claude-Sessions skippen den Save komplett, weil
      // claude beim Resume seinen Verlauf aus der JSONL selbst rendert. Der
      // StrictMode-Schutz `terminalRef.current === terminal` verhindert,
      // dass ein verfruehter Cleanup1 in der Dev-Double-Mount-Sequenz den
      // Snapshot mit Leer-Buffer ueberschreibt — der erste Cleanup laeuft
      // vor terminal.open (RAF), die Pre-Cleanup-Pruefung darunter ist die
      // sichtbare Boundary.
      //
      // Bereich-PANELS-Review 1.2/1.4:
      //   - `restoreReady`: laeuft der Cleanup waehrend loadBuffer noch in
      //     flight ist (resumed-Session sofort wieder geschlossen), wurde der
      //     gespeicherte Snapshot noch nicht in den Buffer geschrieben. Ein
      //     Serialize wuerde dann den guten DB-Stand mit einem Teil-Buffer
      //     (nur die paar pendingFrames) ueberschreiben. Deshalb hier NICHT
      //     speichern — der bestehende Snapshot bleibt erhalten. Die wenigen
      //     ungeschriebenen Frames gehen verloren (akzeptabel, da nie sichtbar).
      //   - `bufferDirty`: kam seit dem Restore kein neuer PTY-Inhalt rein,
      //     ist der Buffer identisch zum gespeicherten Snapshot — der
      //     Serialize+Trim+IPC-Roundtrip waere reine idempotente Arbeit.
      if (
        isTerminalSession &&
        restoreReady &&
        bufferDirty &&
        terminalRef.current === terminal &&
        terminal.buffer.active.length > 0
      ) {
        try {
          const raw = serializeAddon.serialize();
          const snapshot = trimBufferSnapshot(raw);
          if (snapshot.length > 0) {
            void window.api.terminal
              .saveBuffer({ sessionId, snapshot })
              .then((result) => {
                if (!result.ok) {
                  console.warn(
                    `[TerminalTab] terminal:save-buffer abgelehnt code=${result.code}`,
                  );
                }
              })
              .catch((e) => {
                console.warn('[TerminalTab] terminal:save-buffer fehlgeschlagen', e);
              });
          }
        } catch (e) {
          // SerializeAddon kann bei Render-Race oder GPU-Loss in Edge-Cases
          // werfen — den Cleanup nicht reissen, der Snapshot ist Nice-to-have.
          console.warn('[TerminalTab] serialize() im Cleanup fehlgeschlagen', e);
        }
      }
      if (initRafHandle !== null) cancelAnimationFrame(initRafHandle);
      // Phase-2 Season-21: Auto-Send-Timer abbrechen, falls Cleanup zwischen
      // Spawn-Success und Warmup-Ende laeuft (Tab geschlossen vor Send).
      if (initialPromptTimer !== null) {
        clearTimeout(initialPromptTimer);
        initialPromptTimer = null;
      }
      if (spawnRafHandle !== null) {
        cancelAnimationFrame(spawnRafHandle);
        // Phase-2 Season-5 Bugfix: Die Spawn-RAF wurde noch nicht gefeuert
        // (Handle wäre sonst im Callback auf null gesetzt worden). Cleanup
        // läuft also zwischen Schedule und Fire — in der StrictMode-Dev-
        // Sequenz Mount1→Cleanup1→Mount2 stirbt die RAF in Cleanup1 und
        // Mount2 würde wegen `spawnDispatchedRef=true` keine neue RAF
        // schedulen. Resultat: pty:create wird NIE gefeuert, die Session
        // existiert nur im Renderer-Store, die DB kennt sie nicht. Daher
        // hier das Flag zurücksetzen, damit der nachfolgende Mount erneut
        // dispatcht. Im Produktions-Build ohne Double-Mount läuft der
        // gleiche Pfad ohne Effekt, weil dann gar nicht erst cleanup
        // dazwischenkommt.
        spawnDispatchedRef.current = false;
      }
      stopTui();
      offData();
      offExit();
      ro.disconnect();
      window.removeEventListener('resize', scheduleFit);
      // Bugfix 2026-05-19: Renderer-Addon zuerst und separat disposen mit
      // try/catch (@xterm/addon-webgl@0.19.0 wirft beim Dispose vor voller
      // Init). terminal.dispose() ist ebenfalls in try/catch gewickelt als
      // Defense-in-Depth — sollte kuenftig ein anderer Addon-Pfad wackeln,
      // reisst er den Renderer-Tree nicht mit.
      safeDisposeAddon(rendererAddonRef.current, 'renderer-addon');
      rendererAddonRef.current = null;
      safeDisposeTerminal(terminal, 'xterm');
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
  //
  // Phase-2 Season-28: Inaktive Tabs sollen die GPU/CPU nicht unnoetig
  // belasten — cursorBlink aus, TUI-Poll pausiert. Beim Aktivieren beides
  // wieder an. terminal.options.cursorBlink ist live-updatable, der
  // Renderer (WebGL/Canvas) reagiert ohne Re-Init.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.cursorBlink = isActive;
    }
    if (isActive) {
      tuiControlRef.current?.start();
    } else {
      tuiControlRef.current?.pause();
    }
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
  //
  // Phase-2 Season-3: optional `submit: true` im Event-Detail. Claude-codes TUI
  // behandelt Newlines INNERHALB eines Bracketed-Paste-Blocks wie Shift+Enter
  // (Newline im Eingabefeld einfügen), nicht wie Enter (Prompt absenden). Für
  // Trigger-Phrasen-Pillen wollen wir „echtes Enter" — daher zusätzlich zum
  // Paste ein separates Carriage-Return direkt an die PTY, AUSSERHALB des
  // Bracketed-Paste-Blocks. Der CR landet im TUI-Input wie ein Tastatur-Enter.
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; submit?: boolean }>).detail;
      if (!detail || typeof detail.text !== 'string') return;
      terminalRef.current?.paste(detail.text);
      if (detail.submit === true) {
        void window.api.pty.write({ sessionId, data: '\r' });
      }
    };
    window.addEventListener('td-template-send', handler);
    return () => window.removeEventListener('td-template-send', handler);
  }, [isActive, sessionId]);

  // Fokus-Fang: ein Klick irgendwo im Terminal-Bereich (auch ins Padding um die
  // xterm-Canvas) fordert den Fokus für xterms hidden textarea zurück. Sonst muss
  // der User exakt auf die Canvas klicken, sonst bleibt der Fokus auf dem zuletzt
  // gedrückten Button (Tab-Pille, +-Button, Modal-Submit) — und Ctrl+C/V wirken
  // nicht, weil xterm seinen attachCustomKeyEventHandler nicht erreicht.
  //
  // Phase-2 Season-28: Beim Schliessen eines offenen Kontextmenues nur das
  // Menue zumachen und Fokus zurueck — nicht im Selben Klick noch eine Aktion
  // anstossen.
  const handleHostMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (contextMenu !== null && e.button === 0) {
      setContextMenu(null);
      return;
    }
    terminalRef.current?.focus();
  };

  // Scroll-to-Bottom-Klick: xterm bietet scrollToBottom direkt. Nach dem
  // Scroll feuert onScroll und der Button-State setzt sich von selbst zurueck.
  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
    terminalRef.current?.focus();
  }, []);

  return (
    <div
      className={`td-terminal-pane${isDropTarget ? ' is-drop-target' : ''}`}
      onMouseDown={handleHostMouseDown}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Phase-2 Season-28: Search-Bar. Sitzt visuell ueber dem Terminal,
          schluckt aber keinen vertikalen Platz wenn unsichtbar. */}
      {searchVisible && (
        <TerminalSearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onNext={() => handleSearchNext(searchQuery)}
          onPrev={() => handleSearchPrev(searchQuery)}
          onClose={closeSearch}
        />
      )}
      <div ref={containerRef} className="td-terminal-canvas" />
      {/* Phase-2 Season-28: Scroll-to-Bottom-Button rechts unten, nur wenn
          der User aus dem Live-Output-Bereich rausgescrollt ist. */}
      {showScrollToBottom && (
        <button
          type="button"
          className="td-terminal-scroll-to-bottom"
          onClick={handleScrollToBottom}
          title="Zum Ende scrollen"
        >
          ↓
        </button>
      )}
      {isDropTarget && (
        <div className="td-terminal-drop-overlay" aria-hidden>
          Screenshot fallen lassen — Pfad wird ins Terminal eingefügt
        </div>
      )}
      {contextMenu !== null && (
        <TerminalContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCopy={handleMenuCopy}
          onPaste={handleMenuPaste}
          onClear={handleMenuClear}
          onSearch={handleMenuSearch}
          onDismiss={() => setContextMenu(null)}
        />
      )}
      <div ref={errorRef} className="td-terminal-error" hidden />
    </div>
  );
}

export type { Props as TerminalTabProps };
