import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveProjectRelative } from '../../src/main/ipc/fs';

// Sprint 7 — Tests für die Anti-Traversal-Pfad-Resolution in fs:read/fs:write.
// Der Renderer kann via zod-Schema einen beliebigen relPath schicken; resolveProjectRelative
// muss verhindern, dass ein '../../etc/passwd' aus dem Project-Root herausführt.

describe('resolveProjectRelative', () => {
  it('löst einen normalen relativen Pfad auf', () => {
    const root = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
    const result = resolveProjectRelative(root, 'docs/CHANGELOG.md');
    expect(result).not.toBeNull();
    expect(result).toBe(path.resolve(root, 'docs/CHANGELOG.md'));
  });

  it('akzeptiert Forward-Slash auch auf Windows (path.resolve normalisiert)', () => {
    const root = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
    const result = resolveProjectRelative(root, 'docs/sub/dir/file.md');
    expect(result).not.toBeNull();
  });

  it('lehnt Pfade ab, die mit .. den Root verlassen', () => {
    const root = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
    expect(resolveProjectRelative(root, '../other-project/secret.md')).toBeNull();
    expect(resolveProjectRelative(root, '../../etc/passwd')).toBeNull();
  });

  it('lehnt absolute Pfade ab, die nicht in root liegen', () => {
    const root = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
    const escape =
      process.platform === 'win32'
        ? 'C:\\Windows\\System32\\config'
        : '/etc/passwd';
    expect(resolveProjectRelative(root, escape)).toBeNull();
  });

  it('akzeptiert Pfad direkt am Root', () => {
    const root = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
    const result = resolveProjectRelative(root, 'CLAUDE.md');
    expect(result).not.toBeNull();
    expect(result).toBe(path.resolve(root, 'CLAUDE.md'));
  });

  it('verhindert subtilen Bypass via doppelte ..-Sequenzen', () => {
    const root = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
    expect(resolveProjectRelative(root, 'docs/../../escape.md')).toBeNull();
  });
});
