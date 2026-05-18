import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import type { AppSettings, SessionStatus } from '@shared/types';
import { detectFromBuffer, type TuiDetectedState } from '@shared/tui-patterns';
import {
  createCopyPasteKeyHandler,
  type ImagePasteSaver,
} from '../components/clipboardKeyHandler';
import {
  actionsToInsertText,
  bytesToBase64,
  classifyClipboardItems,
  classifyDrop,
  isAllowedImageMime,
  type ScreenshotMime,
} from '../components/terminalDropHandler';
import { clampFontSize, nextZoomFontSize } from '../components/terminalFontZoom';
import { quotePathIfNeeded } from '../components/pathQuoting';
import { useProjectStore } from '../stores/projects';
import { useSessionStore } from '../stores/sessions';

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
  type: 'feature' | 'bug' | 'review' | 'docs-sync' | 'custom';
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
  // Phase-2 Season-28: TUI-Poll-Kontrolle. Der isActive-Effect ruft pause/start,
  // die Implementierungen leben aber im Init-Effect (Closure ueber lastPushedState
  // usw.). Ref ist der einfachste Weg ueber die Effect-Grenze ohne Re-Bindings.
  const tuiControlRef = useRef<{ start: () => void; pause: () => void } | null>(null);
  // Lokaler Font-Size-Override pro Tab. null = User hat nicht gezoomt, dann
  // gilt settings.terminal_font_size. Bei einem Settings-Hot-Update setzen wir
  // den Override zurueck (Settings sind die Wahrheit, sobald der User sie
  // explizit aendert).
  const [fontSizeOverride, setFontSizeOverride] = useState<number | null>(null);
  // UI-States fuer Search-Bar, Kontextmenue, Scroll-to-Bottom-Button.
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
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
  // Phase-2 Season-2: dragenter/dragleave triggern hier — wir zählen, weil
  // dragleave auch beim Wechsel zwischen Kind-Elementen feuert (jeder Move
  // über ein neues Child-Element gibt ein leave + ein enter ab). Ein simpler
  // Bool-Toggle würde dabei flackern.
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragDepthRef = useRef(0);
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
    terminal.loadAddon(new SerializeAddon());
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
      loadRendererAddonWithFallback(terminal);
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

  // Hot-Update der Schriftart, wenn der User die Settings ändert.
  // Phase-2 Season-28: Wenn der User in den Settings die Schriftgroesse aendert,
  // hat das Vorrang vor dem lokalen Ctrl+Mausrad-Override — sonst wuerde der
  // User das Settings-Modal anpassen und das Terminal wuerde sich nicht ruehren.
  // Der Override wird zurueckgesetzt; spaetere Wheel-Aktionen starten dann auf
  // dem neuen Settings-Wert.
  useEffect(() => {
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = settings.terminal_font_family;
    terminal.options.fontSize = clampFontSize(settings.terminal_font_size);
    setFontSizeOverride(null);
    safeFit(fit);
  }, [settings.terminal_font_family, settings.terminal_font_size]);

  // Phase-2 Season-28: Wenn der Override sich aendert (Ctrl+Mausrad), die
  // xterm-Schriftgroesse aktualisieren und Layout neu fitten. Bei Override=null
  // ist Setting-Wert die Wahrheit und der obige Effect uebernimmt.
  useEffect(() => {
    if (fontSizeOverride === null) return;
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontSize = clampFontSize(fontSizeOverride);
    safeFit(fit);
  }, [fontSizeOverride]);

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

  // Phase-2 Season-28: Rechtsklick-Kontextmenue. Discoverability fuer die
  // Ctrl+Shift+*-Shortcuts — neue User wissen nicht von selbst, dass
  // Ctrl+Shift+C kopiert.
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Phase-2 Season-28: Search-Bar-Handler. Such-Logik laeuft direkt gegen das
  // Addon — kein State-Sync ueber die useEffect-Grenze, weil findNext/Previous
  // den xterm-Buffer in-place markiert.
  const handleSearchNext = useCallback(
    (query: string) => {
      if (query.length === 0) return;
      searchAddonRef.current?.findNext(query, { incremental: false });
    },
    [],
  );
  const handleSearchPrev = useCallback(
    (query: string) => {
      if (query.length === 0) return;
      searchAddonRef.current?.findPrevious(query, { incremental: false });
    },
    [],
  );
  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery('');
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, []);

  // Phase-2 Season-28: Kontextmenue-Aktionen rufen direkt die xterm/Clipboard-
  // APIs; gleicher Pfad wie die Tastatur-Shortcuts, nur ueber Menue-Klick.
  const handleMenuCopy = useCallback(async () => {
    const term = terminalRef.current;
    const sel = term?.getSelection() ?? '';
    if (sel.length > 0) {
      try {
        await navigator.clipboard.writeText(sel);
        term?.clearSelection();
      } catch (e) {
        console.warn('[TerminalTab] clipboard.writeText failed', e);
      }
    }
    setContextMenu(null);
  }, []);
  const handleMenuPaste = useCallback(async () => {
    const term = terminalRef.current;
    if (!term) {
      setContextMenu(null);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text.length > 0) term.paste(text);
    } catch (e) {
      console.warn('[TerminalTab] clipboard.readText failed', e);
    }
    setContextMenu(null);
  }, []);
  const handleMenuClear = useCallback(() => {
    terminalRef.current?.clear();
    setContextMenu(null);
  }, []);
  const handleMenuSearch = useCallback(() => {
    setSearchVisible(true);
    setContextMenu(null);
  }, []);

  // Scroll-to-Bottom-Klick: xterm bietet scrollToBottom direkt. Nach dem
  // Scroll feuert onScroll und der Button-State setzt sich von selbst zurueck.
  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom();
    terminalRef.current?.focus();
  }, []);

  // Phase-2 Season-2: Drag-Drop für Screenshots ins Terminal.
  // dragover MUSS preventDefault rufen, sonst lehnt der Browser den drop ab
  // (Default-Verhalten: navigieren zur Datei-URL → würde den Renderer
  // wegnavigieren, was zusätzlich vom will-navigate-Handler im Main geblockt
  // wäre, aber der Drop kommt erst gar nicht zustande).
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current++;
    if (dragDepthRef.current === 1) setIsDropTarget(true);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    // Cursor zur „Copy"-Variante — signalisiert dem User, dass der Drop OK ist.
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDropTarget(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTarget(false);
    const files = Array.from(e.dataTransfer.files);
    void handleDroppedFiles(files);
  };

  const handleDroppedFiles = async (files: File[]) => {
    const term = terminalRef.current;
    if (!term) return;
    const actions = await classifyDrop(files, {
      getPathForFile: (f) => window.api.fs.getPathForFile(f),
      readAsBytes: readFileAsBytes,
    });
    const text = await actionsToInsertText(actions, {
      saveScreenshot: async ({ mime, base64 }) => {
        const res = await window.api.fs.saveScreenshot({ mime, base64 });
        return res.ok
          ? { ok: true, absolutePath: res.data.absolutePath }
          : { ok: false, error: res.error };
      },
      log: (msg, err) => console.warn(`[TerminalTab] ${msg}`, err),
    });
    if (text.length === 0) return;
    term.paste(text);
    term.focus();
  };

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

// Phase-2 Season-28: Mini-Suchbar oben im Terminal. Bewusst klein gehalten —
// kein Reg-Ex, kein Case-Toggle, kein Match-Counter. Wenn das spaeter gewuenscht
// ist, sind diese Schalter alle als Optionen am SearchAddon vorhanden.
interface TerminalSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

function TerminalSearchBar({
  query,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Bei Mount sofort fokussieren, damit der User direkt tippen kann.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <div className="td-terminal-search">
      <input
        ref={inputRef}
        type="text"
        className="td-terminal-search-input"
        placeholder="Suchen …"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKey}
        aria-label="Im Terminal suchen"
      />
      <button
        type="button"
        className="td-terminal-search-btn"
        onClick={onPrev}
        title="Vorheriger Treffer (Shift+Enter)"
        aria-label="Vorheriger Treffer"
      >
        ↑
      </button>
      <button
        type="button"
        className="td-terminal-search-btn"
        onClick={onNext}
        title="Naechster Treffer (Enter)"
        aria-label="Naechster Treffer"
      >
        ↓
      </button>
      <button
        type="button"
        className="td-terminal-search-btn"
        onClick={onClose}
        title="Schliessen (Esc)"
        aria-label="Suche schliessen"
      >
        ×
      </button>
    </div>
  );
}

// Phase-2 Season-28: Rechtsklick-Kontextmenue. Position kommt von clientX/Y
// des Mouse-Events; das CSS clampt das Menue ans Viewport.
interface TerminalContextMenuProps {
  x: number;
  y: number;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  onSearch: () => void;
  onDismiss: () => void;
}

function TerminalContextMenu({
  x,
  y,
  onCopy,
  onPaste,
  onClear,
  onSearch,
  onDismiss,
}: TerminalContextMenuProps) {
  // Click-Outside + Escape schliessen das Menue. Wir benutzen capture-phase
  // auf document, damit ein Klick auf das Terminal-Pane sicher erfasst wird,
  // bevor das pane-handleHostMouseDown den Fokus zurueckholt.
  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest('.td-terminal-context-menu')) return;
      onDismiss();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);
  return (
    <ul
      className="td-terminal-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <li>
        <button type="button" onClick={onCopy} role="menuitem">
          Kopieren <span className="td-shortcut-hint">Ctrl+Shift+C</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onPaste} role="menuitem">
          Einfuegen <span className="td-shortcut-hint">Ctrl+Shift+V</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onSearch} role="menuitem">
          Suchen … <span className="td-shortcut-hint">Ctrl+Shift+F</span>
        </button>
      </li>
      <li>
        <button type="button" onClick={onClear} role="menuitem">
          Buffer leeren <span className="td-shortcut-hint">Ctrl+Shift+L</span>
        </button>
      </li>
    </ul>
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

// Phase-2 Season-28: Renderer-Wahl WebGL primaer, Canvas als Fallback. Die
// Funktion sitzt aussen, damit sie nicht pro Tab-Mount neu allokiert wird.
// Zwei Fallback-Pfade:
//   1. WebglAddon-Konstruktor wirft (z.B. WebGL2 nicht verfuegbar) → catch
//      faellt auf CanvasAddon zurueck.
//   2. Laufzeit-Context-Loss (Treiber-Reset/GPU-Crash) → onContextLoss
//      disposed das Addon und laedt Canvas nach. xterm rendert dann bis
//      zur naechsten App-Session weiter ueber Canvas.
function loadRendererAddonWithFallback(terminal: Terminal): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      console.warn('[TerminalTab] WebGL Context-Loss, weiche auf CanvasAddon aus');
      webgl.dispose();
      try {
        terminal.loadAddon(new CanvasAddon());
      } catch (canvasErr) {
        console.warn(
          '[TerminalTab] CanvasAddon-Fallback nach WebGL-Context-Loss fehlgeschlagen',
          canvasErr,
        );
      }
    });
    terminal.loadAddon(webgl);
    // Erfolg-Log: User kann in den DevTools schnell pruefen, welcher Renderer
    // aktiv ist. Bei mehreren parallelen Tabs einmal pro Tab.
    console.info('[TerminalTab] Renderer: WebGL');
  } catch (err) {
    console.warn(
      '[TerminalTab] WebglAddon nicht ladbar, weiche auf CanvasAddon aus',
      err,
    );
    terminal.loadAddon(new CanvasAddon());
    console.info('[TerminalTab] Renderer: Canvas (Fallback)');
  }
}

function showError(el: HTMLDivElement | null, msg: string): void {
  if (!el) return;
  el.textContent = `Fehler: ${msg}`;
  el.hidden = false;
}

// Phase-2 Season-2: Beim Drag enthält das DataTransfer.items oft nur die
// MIME-Typen, .files dagegen leeres Array — wir prüfen beide Pfade. Wenn
// kein passender Image-Typ dabei ist, lassen wir das Event durchlaufen
// (z.B. wenn der User aus Versehen Text in den Terminal-Bereich zieht).
function hasImageFiles(dt: DataTransfer): boolean {
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file' && isAllowedImageMime(item.type)) return true;
  }
  for (const file of Array.from(dt.files)) {
    if (isAllowedImageMime(file.type)) return true;
  }
  return false;
}

// Liest ein File komplett in ein Uint8Array. Sandbox-konform — kein Node-FS,
// nur die Browser-FileReader-API.
async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

// Phase-2 Season-2: Driver für den Clipboard-Image-Paste-Pfad. Sucht im
// Clipboard das erste image/*-Item, speichert es via IPC und gibt den
// fertigen Path-Insert-Text zurück (mit Quoting bei Whitespace im Pfad).
function createImagePasteSaver(): ImagePasteSaver {
  return {
    tryReadAndSaveAsPathInsert: async () => {
      // navigator.clipboard.read ist im Renderer nur verfügbar, wenn die
      // clipboard-read-Permission greift — die ist in main.ts whitelisted.
      // Auf älteren Electron-Pfaden oder im jsdom-Test-Setup kann die API
      // fehlen; dann verhält sich der Driver wie „kein Bild gefunden".
      if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
      const items = await navigator.clipboard.read();
      const action = await classifyClipboardItems(items, {
        readBlobAsBytes: async (blob) => new Uint8Array(await blob.arrayBuffer()),
      });
      if (action === null) return null;
      // action ist garantiert save-and-paste — classifyClipboardItems hat
      // schon das Image-MIME geprüft.
      if (action.kind !== 'save-and-paste') return null;
      const base64 = bytesToBase64(action.bytes);
      const res = await window.api.fs.saveScreenshot({
        mime: action.mime as ScreenshotMime,
        base64,
      });
      if (!res.ok) return '';
      return quotePathIfNeeded(res.data.absolutePath);
    },
  };
}

// Liefert die letzten n Buffer-Zeilen als reinen Text (ohne ANSI-Escapes).
// translateToString(true) trimt rechte Whitespace-Padding, das xterm für leere
// Zellen einfügt — wichtig für den TUI-Pattern-Match (sonst wären selbst leere
// Buffer-Reihen randvoll mit Spaces).
function snapshotBufferLines(term: Terminal, n: number): string[] {
  const buf = term.buffer.active;
  const total = buf.length;
  const start = Math.max(0, total - n);
  const lines: string[] = [];
  for (let i = start; i < total; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    lines.push(line.translateToString(true));
  }
  return lines;
}

export type { Props as TerminalTabProps };
