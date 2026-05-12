import { describe, it, expect, vi } from 'vitest';
import {
  createCopyPasteKeyHandler,
  type ClipboardLike,
  type TerminalLike,
} from '../../src/renderer/components/clipboardKeyHandler';

// Test-Helpers: minimale Fakes für ClipboardLike und TerminalLike.
function makeClipboardFake(initialText = ''): ClipboardLike & { writes: string[] } {
  const writes: string[] = [];
  let stored = initialText;
  return {
    writes,
    async writeText(text: string) {
      writes.push(text);
      stored = text;
    },
    async readText() {
      return stored;
    },
  };
}

function makeTerminalFake(
  selection = '',
): TerminalLike & { pastes: string[]; clearedTimes: number; getSelectionMutable: () => string } {
  const pastes: string[] = [];
  let currentSelection = selection;
  let clearedTimes = 0;
  return {
    pastes,
    get clearedTimes() {
      return clearedTimes;
    },
    getSelection: () => currentSelection,
    getSelectionMutable: () => currentSelection,
    paste: (text: string) => {
      pastes.push(text);
    },
    clearSelection: () => {
      currentSelection = '';
      clearedTimes++;
    },
  };
}

// Builds einen KeyboardEvent-Fake mit den Feldern, die der Handler liest. Nicht
// `new KeyboardEvent(...)`, weil das in Node ohne JSDOM nicht trivial verfügbar ist.
function makeKeyEvent(opts: {
  type?: 'keydown' | 'keyup';
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return {
    type: opts.type ?? 'keydown',
    key: opts.key,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
  } as KeyboardEvent;
}

describe('createCopyPasteKeyHandler — Copy', () => {
  it('Ctrl+Shift+C mit Selection schreibt in die Zwischenablage und konsumiert das Event', async () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('Fehler: stack trace …');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'C', ctrlKey: true, shiftKey: true }),
    );

    expect(consumed).toBe(false);
    // Mikro-Wartezeit, damit die void-Promise im Handler zum writeText kommt.
    await Promise.resolve();
    expect(clipboard.writes).toEqual(['Fehler: stack trace …']);
  });

  it('Ctrl+Shift+C ohne Selection lässt das Event durchlaufen', async () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: true }),
    );

    expect(consumed).toBe(true);
    await Promise.resolve();
    expect(clipboard.writes).toEqual([]);
  });

  it('Smart-Ctrl+C MIT Selection kopiert + räumt die Selection ab', async () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('payload');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: false }),
    );

    expect(consumed).toBe(false);
    await Promise.resolve();
    expect(clipboard.writes).toEqual(['payload']);
    expect(terminal.clearedTimes).toBe(1);
    // Folge-Ctrl+C: Selection ist jetzt leer → Event darf durchlaufen (= SIGINT).
    const consumed2 = handler(
      makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: false }),
    );
    expect(consumed2).toBe(true);
  });

  it('Smart-Ctrl+C OHNE Selection läuft als SIGINT durch (Default-Terminal-Verhalten)', () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: false }),
    );

    expect(consumed).toBe(true);
    expect(clipboard.writes).toEqual([]);
    expect(terminal.clearedTimes).toBe(0);
  });
});

describe('createCopyPasteKeyHandler — Paste', () => {
  it('Ctrl+Shift+V liest die Zwischenablage und ruft terminal.paste()', async () => {
    const clipboard = makeClipboardFake('git status');
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'V', ctrlKey: true, shiftKey: true }),
    );

    expect(consumed).toBe(false);
    // Zwei Mikro-Ticks, damit readText() → paste() den Promise durchläuft.
    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual(['git status']);
  });

  it('Ctrl+Shift+V mit leerer Zwischenablage triggert keinen paste()', async () => {
    const clipboard = makeClipboardFake('');
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    handler(makeKeyEvent({ key: 'v', ctrlKey: true, shiftKey: true }));

    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual([]);
  });

  it('Plain Ctrl+V pastet (überschreibt das selten genutzte \\x16)', async () => {
    const clipboard = makeClipboardFake('aus dem Browser kopiert');
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'v', ctrlKey: true, shiftKey: false }),
    );

    expect(consumed).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual(['aus dem Browser kopiert']);
  });
});

describe('createCopyPasteKeyHandler — Insert-Alternativen (Unix-Konvention)', () => {
  it('Ctrl+Insert mit Selection kopiert (Bypass für Screenshot-Hotkey-Konflikte)', async () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('via Ctrl+Insert');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'Insert', ctrlKey: true, shiftKey: false }),
    );

    expect(consumed).toBe(false);
    await Promise.resolve();
    expect(clipboard.writes).toEqual(['via Ctrl+Insert']);
  });

  it('Shift+Insert pastet (Bypass für Screenshot-Hotkey-Konflikte)', async () => {
    const clipboard = makeClipboardFake('aus der Zwischenablage');
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'Insert', shiftKey: true, ctrlKey: false }),
    );

    expect(consumed).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual(['aus der Zwischenablage']);
  });

  it('Ctrl+Shift+Insert wird durchgelassen (kein definiertes Shortcut)', () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('was');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'Insert', ctrlKey: true, shiftKey: true }),
    );

    expect(consumed).toBe(true);
    expect(clipboard.writes).toEqual([]);
  });

  it('reine Insert-Taste (ohne Modifier) wird durchgelassen', () => {
    const clipboard = makeClipboardFake('text');
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(makeKeyEvent({ key: 'Insert' }));

    expect(consumed).toBe(true);
    expect(terminal.pastes).toEqual([]);
  });
});

describe('createCopyPasteKeyHandler — Edge-Cases', () => {
  it('keyup-Events werden ignoriert (Handler reagiert nur auf keydown)', () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('was');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({
        type: 'keyup',
        key: 'c',
        ctrlKey: true,
        shiftKey: true,
      }),
    );

    expect(consumed).toBe(true);
    expect(clipboard.writes).toEqual([]);
  });

  it('Ctrl+Shift+Alt+C wird durchgelassen (Alt blockiert die Auswertung)', () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('was');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: true, altKey: true }),
    );

    expect(consumed).toBe(true);
    expect(clipboard.writes).toEqual([]);
  });

  it('andere Tasten mit Ctrl+Shift werden durchgelassen (Ctrl+Shift+Tab etc.)', () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    const consumed = handler(
      makeKeyEvent({ key: 'Tab', ctrlKey: true, shiftKey: true }),
    );

    expect(consumed).toBe(true);
  });

  it('getTerminal() returnt null → Event wird durchgelassen, kein Crash', () => {
    const clipboard = makeClipboardFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => null });

    expect(() =>
      handler(makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: true })),
    ).not.toThrow();
  });

  it('Clipboard-Fehler bei writeText werden geloggt, nicht geworfen', async () => {
    const error = new Error('NotAllowedError: Document is not focused');
    const clipboard: ClipboardLike = {
      async writeText() {
        throw error;
      },
      async readText() {
        return '';
      },
    };
    const terminal = makeTerminalFake('payload');
    const log = vi.fn();
    const handler = createCopyPasteKeyHandler({
      clipboard,
      getTerminal: () => terminal,
      log,
    });

    expect(() =>
      handler(makeKeyEvent({ key: 'c', ctrlKey: true, shiftKey: true })),
    ).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/writeText/);
  });

  it('Großschreibung in event.key (CAPS-Lock) wird normalisiert', async () => {
    const clipboard = makeClipboardFake();
    const terminal = makeTerminalFake('inhalt');
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    handler(makeKeyEvent({ key: 'C', ctrlKey: true, shiftKey: true }));
    await Promise.resolve();
    expect(clipboard.writes).toEqual(['inhalt']);
  });
});

// Phase-2 Season-2: Image-First-Paste-Pfad. Wenn ein imagePasteSaver gesetzt
// ist, prüft der Handler beim Paste-Trigger ZUERST die Zwischenablage auf
// ein Bild und pastet den fertig zitierten Pfad statt des Text-Inhalts.
describe('createCopyPasteKeyHandler — Image-Paste (Phase-2 Season-2)', () => {
  it('Ctrl+Shift+V mit Bild in der Zwischenablage pastet den Pfad statt den Text', async () => {
    const clipboard = makeClipboardFake('soll-nicht-erscheinen');
    const terminal = makeTerminalFake();
    const saver = vi.fn(async () => '"C:\\Users\\m\\screenshots\\snap.png"');
    const handler = createCopyPasteKeyHandler({
      clipboard,
      getTerminal: () => terminal,
      imagePasteSaver: { tryReadAndSaveAsPathInsert: saver },
    });

    handler(makeKeyEvent({ key: 'V', ctrlKey: true, shiftKey: true }));
    // Drei Mikro-Ticks: async-IIFE → await saver → terminal.paste.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(saver).toHaveBeenCalledTimes(1);
    expect(terminal.pastes).toEqual(['"C:\\Users\\m\\screenshots\\snap.png"']);
  });

  it('Saver liefert null (kein Bild im Clipboard) → Text-Pfad läuft normal', async () => {
    const clipboard = makeClipboardFake('git status');
    const terminal = makeTerminalFake();
    const saver = vi.fn(async () => null);
    const handler = createCopyPasteKeyHandler({
      clipboard,
      getTerminal: () => terminal,
      imagePasteSaver: { tryReadAndSaveAsPathInsert: saver },
    });

    handler(makeKeyEvent({ key: 'v', ctrlKey: true, shiftKey: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(saver).toHaveBeenCalledTimes(1);
    expect(terminal.pastes).toEqual(['git status']);
  });

  it('Saver liefert "" (Bild da, Save fehlgeschlagen) → kein Text-Fallback', async () => {
    const clipboard = makeClipboardFake('soll-nicht-erscheinen');
    const terminal = makeTerminalFake();
    const saver = vi.fn(async () => '');
    const handler = createCopyPasteKeyHandler({
      clipboard,
      getTerminal: () => terminal,
      imagePasteSaver: { tryReadAndSaveAsPathInsert: saver },
    });

    handler(makeKeyEvent({ key: 'v', ctrlKey: true, shiftKey: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual([]);
  });

  it('Saver wirft (z.B. Permission-Denied) → Text-Pfad läuft als Fallback, Fehler wird geloggt', async () => {
    const clipboard = makeClipboardFake('echo hi');
    const terminal = makeTerminalFake();
    const saver = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    const log = vi.fn();
    const handler = createCopyPasteKeyHandler({
      clipboard,
      getTerminal: () => terminal,
      imagePasteSaver: { tryReadAndSaveAsPathInsert: saver },
      log,
    });

    handler(makeKeyEvent({ key: 'v', ctrlKey: true, shiftKey: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual(['echo hi']);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0]?.[0]).toMatch(/image/);
  });

  it('ohne imagePasteSaver bleibt der Text-Paste-Pfad unverändert', async () => {
    // Regressions-Schutz für Sprint 3.5: alte Tests müssen weiterlaufen.
    const clipboard = makeClipboardFake('ls -la');
    const terminal = makeTerminalFake();
    const handler = createCopyPasteKeyHandler({ clipboard, getTerminal: () => terminal });

    handler(makeKeyEvent({ key: 'v', ctrlKey: true, shiftKey: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(terminal.pastes).toEqual(['ls -la']);
  });
});
