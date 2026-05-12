import { describe, expect, it, vi } from 'vitest';
import {
  actionsToInsertText,
  bytesToBase64,
  classifyClipboardItems,
  classifyDrop,
  isAllowedImageMime,
  type DropAction,
} from '../../src/renderer/components/terminalDropHandler';

// Mini-File-Fake: wir brauchen nur .type, der Rest wird vom Driver geliefert.
function makeFile(type: string): File {
  return { type } as unknown as File;
}

describe('isAllowedImageMime', () => {
  it('akzeptiert die vier whitelisted Image-MIME-Typen', () => {
    expect(isAllowedImageMime('image/png')).toBe(true);
    expect(isAllowedImageMime('image/jpeg')).toBe(true);
    expect(isAllowedImageMime('image/gif')).toBe(true);
    expect(isAllowedImageMime('image/webp')).toBe(true);
  });

  it('lehnt SVG, PDF und Text ab', () => {
    expect(isAllowedImageMime('image/svg+xml')).toBe(false);
    expect(isAllowedImageMime('application/pdf')).toBe(false);
    expect(isAllowedImageMime('text/plain')).toBe(false);
  });
});

describe('classifyDrop', () => {
  it('erzeugt paste-path, wenn das File einen Disk-Pfad hat', async () => {
    const file = makeFile('image/png');
    const actions = await classifyDrop([file], {
      getPathForFile: () => 'C:\\Users\\m\\snap.png',
      readAsBytes: async () => new Uint8Array(),
    });
    expect(actions).toEqual([
      { kind: 'paste-path', absolutePath: 'C:\\Users\\m\\snap.png' },
    ]);
  });

  it('fällt auf save-and-paste zurück, wenn kein Disk-Pfad existiert (Clipboard/Browser-Drag)', async () => {
    const file = makeFile('image/jpeg');
    const bytes = new Uint8Array([1, 2, 3]);
    const actions = await classifyDrop([file], {
      getPathForFile: () => '',
      readAsBytes: async () => bytes,
    });
    expect(actions).toEqual([
      { kind: 'save-and-paste', mime: 'image/jpeg', bytes },
    ]);
  });

  it('skipt Files mit nicht-Image-MIME', async () => {
    const code = makeFile('text/javascript');
    const png = makeFile('image/png');
    const actions = await classifyDrop([code, png], {
      getPathForFile: () => '/tmp/x.png',
      readAsBytes: async () => new Uint8Array(),
    });
    expect(actions).toEqual([{ kind: 'paste-path', absolutePath: '/tmp/x.png' }]);
  });

  it('mischt paste-path und save-and-paste in der Reihenfolge der Eingabe', async () => {
    const a = makeFile('image/png');
    const b = makeFile('image/webp');
    const bytes = new Uint8Array([9]);
    const paths = ['/disk/a.png', ''];
    let i = 0;
    const actions = await classifyDrop([a, b], {
      getPathForFile: () => paths[i++] ?? '',
      readAsBytes: async () => bytes,
    });
    expect(actions).toEqual([
      { kind: 'paste-path', absolutePath: '/disk/a.png' },
      { kind: 'save-and-paste', mime: 'image/webp', bytes },
    ]);
  });

  it('leere Files-Liste → leere Action-Liste', async () => {
    const actions = await classifyDrop([], {
      getPathForFile: () => '',
      readAsBytes: async () => new Uint8Array(),
    });
    expect(actions).toEqual([]);
  });
});

describe('classifyClipboardItems', () => {
  // ClipboardItem-Fake mit den drei Properties, die der Klassifizierer liest.
  function makeItem(typesToBytes: Record<string, Uint8Array>): ClipboardItem {
    return {
      types: Object.keys(typesToBytes),
      getType: async (mime: string) =>
        new Blob([typesToBytes[mime]!.buffer as ArrayBuffer], { type: mime }),
    } as unknown as ClipboardItem;
  }

  it('liefert save-and-paste für ein image/png-ClipboardItem', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const item = makeItem({ 'image/png': bytes });
    const action = await classifyClipboardItems([item], {
      readBlobAsBytes: async (blob) => new Uint8Array(await blob.arrayBuffer()),
    });
    expect(action?.kind).toBe('save-and-paste');
    expect(action && action.kind === 'save-and-paste' ? action.mime : null).toBe(
      'image/png',
    );
    expect(action && action.kind === 'save-and-paste' ? action.bytes : null).toEqual(
      bytes,
    );
  });

  it('liefert null, wenn kein Item ein Image-MIME hat', async () => {
    const item = makeItem({ 'text/plain': new Uint8Array() });
    const action = await classifyClipboardItems([item], {
      readBlobAsBytes: async () => new Uint8Array(),
    });
    expect(action).toBeNull();
  });

  it('liefert null bei leerer ClipboardItem-Liste', async () => {
    const action = await classifyClipboardItems([], {
      readBlobAsBytes: async () => new Uint8Array(),
    });
    expect(action).toBeNull();
  });

  it('greift das erste Image-Item, auch wenn vorher Non-Image-Typen geprüft werden', async () => {
    const png = new Uint8Array([42]);
    const item = makeItem({ 'text/plain': new Uint8Array(), 'image/png': png });
    const action = await classifyClipboardItems([item], {
      readBlobAsBytes: async (blob) => new Uint8Array(await blob.arrayBuffer()),
    });
    expect(action?.kind).toBe('save-and-paste');
  });
});

describe('bytesToBase64', () => {
  it('encodet die Standard-PNG-Header-Bytes korrekt', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytesToBase64(png)).toBe('iVBORw0KGgo=');
  });

  it('encodet ein leeres Array zu leerem String', () => {
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });

  it('encodet Bytes oberhalb des Chunk-Limits (>32 KiB) verlustfrei', () => {
    const bytes = new Uint8Array(40_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const encoded = bytesToBase64(bytes);
    // Round-Trip: base64 → bytes muss identisch sein.
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(bytes.length);
    for (let i = 0; i < bytes.length; i++) expect(decoded[i]).toBe(bytes[i]);
  });
});

describe('actionsToInsertText', () => {
  it('puristisches paste-path liefert den Pfad unverändert', async () => {
    const actions: DropAction[] = [
      { kind: 'paste-path', absolutePath: '/a/b.png' },
    ];
    const text = await actionsToInsertText(actions, {
      saveScreenshot: async () => ({ ok: true, absolutePath: 'unused' }),
    });
    expect(text).toBe('/a/b.png');
  });

  it('save-and-paste ruft den Saver und nutzt den zurückgegebenen Pfad', async () => {
    const seenMimes: string[] = [];
    const saver = async (input: { mime: string; base64: string }) => {
      seenMimes.push(input.mime);
      return { ok: true as const, absolutePath: '/userdata/screenshots/x.png' };
    };
    const actions: DropAction[] = [
      { kind: 'save-and-paste', mime: 'image/png', bytes: new Uint8Array([1, 2]) },
    ];
    const text = await actionsToInsertText(actions, { saveScreenshot: saver });
    expect(seenMimes).toEqual(['image/png']);
    expect(text).toBe('/userdata/screenshots/x.png');
  });

  it('quotet Pfade mit Whitespace beim Join', async () => {
    const actions: DropAction[] = [
      { kind: 'paste-path', absolutePath: '/a/no space.png' },
      { kind: 'paste-path', absolutePath: '/b/ok.png' },
    ];
    const text = await actionsToInsertText(actions, {
      saveScreenshot: async () => ({ ok: true, absolutePath: 'unused' }),
    });
    expect(text).toBe('"/a/no space.png" /b/ok.png');
  });

  it('überspringt fehlgeschlagene Saves und loggt sie', async () => {
    const log = vi.fn();
    const actions: DropAction[] = [
      { kind: 'paste-path', absolutePath: '/ok.png' },
      { kind: 'save-and-paste', mime: 'image/png', bytes: new Uint8Array() },
    ];
    const text = await actionsToInsertText(actions, {
      saveScreenshot: async () => ({ ok: false, error: 'EACCES' }),
      log,
    });
    expect(text).toBe('/ok.png');
    expect(log).toHaveBeenCalledOnce();
  });

  it('leere Action-Liste → leerer String', async () => {
    const text = await actionsToInsertText([], {
      saveScreenshot: async () => ({ ok: true, absolutePath: 'unused' }),
    });
    expect(text).toBe('');
  });
});
