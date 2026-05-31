import { describe, it, expect, vi } from 'vitest';
import {
  JsonlWatcher,
  type JsonlWatcherDeps,
} from '../../src/main/jsonl/watcher';
import type { JsonlReadDriver } from '../../src/main/jsonl/parser';
import type { Logger } from '../../src/main/logger';
import type { SessionRepository } from '../../src/main/db/repos/sessions';
import type { JsonlOffsetRepository } from '../../src/main/db/repos/jsonl-offsets';
import type { MessageRepository } from '../../src/main/db/repos/messages';
import type { UsageRepository } from '../../src/main/db/repos/usage';

// Season 35 (JSONL-Watcher-Performance): Regression-Test fuer den entschaerften
// Legacy-Backfill. Bisher rief `handleFile` bei JEDEM Event (add + change)
// `sessions.listMissingClaudeSessionId()` auf — einen Full-Table-Scan. Bei
// aktiven claude-Sessions feuert pro Stream-Tick ein `change`, also lief der
// Scan im Sekundentakt und blockierte den synchronen Main-Thread (UI-Stall).
// Erwartung jetzt: der Scan laeuft pro Datei nur EINMAL pro Prozess-Lebensdauer.

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

// Wartet genug Macrotask-Ticks ab, damit ein angestossenes handleFile (genau ein
// await auf readTail) komplett durchlaeuft und inFlight wieder geleert ist, bevor
// das naechste notifyChanged feuert.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeWatcher() {
  const listMissingClaudeSessionId = vi.fn().mockReturnValue([]);
  const sessions = {
    listMissingClaudeSessionId,
    findByJsonlPath: vi.fn().mockReturnValue(null),
    findByClaudeSessionId: vi.fn().mockReturnValue(null),
    listByStatus: vi.fn().mockReturnValue([]),
    setClaudeSessionId: vi.fn().mockReturnValue(false),
    setJsonlPath: vi.fn().mockReturnValue(false),
  } as unknown as SessionRepository;

  const reader: JsonlReadDriver = {
    readTail: vi.fn().mockResolvedValue({ segment: '', truncated: false }),
  };
  const offsets = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  } as unknown as JsonlOffsetRepository;
  const messages = { insert: vi.fn() } as unknown as MessageRepository;
  const usage = { upsertBucket: vi.fn() } as unknown as UsageRepository;

  const deps: JsonlWatcherDeps = {
    watchPath: 'C:\\root',
    reader,
    offsets,
    messages,
    usage,
    sessions,
    log: makeLogger(),
    push: vi.fn(),
  };
  const watcher = new JsonlWatcher(deps);
  return { watcher, listMissingClaudeSessionId };
}

// Pfad im claude-Schema: <root>/<encoded-cwd>/<uuid>.jsonl. Nur so liefern
// claudeUuidFromJsonlPath + encodedCwdFromJsonlPath non-null und der Backfill
// erreicht ueberhaupt den Scan.
const FILE_A =
  'C:\\root\\C--work-proj\\11111111-2222-3333-4444-555555555555.jsonl';
const FILE_B =
  'C:\\root\\C--work-other\\99999999-8888-7777-6666-555555555555.jsonl';

describe('JsonlWatcher Backfill-Drossel (Season 35)', () => {
  it('scannt pro Datei nur einmal, auch bei vielen change-Events', async () => {
    const { watcher, listMissingClaudeSessionId } = makeWatcher();

    // Simuliert das Symptom: viele aufeinanderfolgende change-Events fuer
    // dieselbe aktive Session-JSONL.
    watcher.notifyChanged(FILE_A);
    await flush();
    watcher.notifyChanged(FILE_A);
    await flush();
    watcher.notifyChanged(FILE_A);
    await flush();

    expect(listMissingClaudeSessionId).toHaveBeenCalledTimes(1);
  });

  it('drosselt pro Datei getrennt (zweite Datei wird eigenstaendig gescannt)', async () => {
    const { watcher, listMissingClaudeSessionId } = makeWatcher();

    watcher.notifyChanged(FILE_A);
    await flush();
    watcher.notifyChanged(FILE_B);
    await flush();
    watcher.notifyChanged(FILE_A);
    await flush();
    watcher.notifyChanged(FILE_B);
    await flush();

    // Genau ein Scan je distinkter Datei — nicht global unterdrueckt.
    expect(listMissingClaudeSessionId).toHaveBeenCalledTimes(2);
  });
});
