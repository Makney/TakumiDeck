import * as nodePty from '@lydell/node-pty';
import type { IPtyLike, PtySpawn, PtySpawnOptions } from './manager';

// Realer PTY-Spawn-Driver. Wraps @lydell/node-pty.spawn in das schmale IPtyLike-Interface,
// damit die Manager-Klasse keine Direktabhängigkeit vom Paket hat (testbar via Fake).
export const realPtySpawn: PtySpawn = (opts: PtySpawnOptions): IPtyLike => {
  const env = sanitizeEnv(opts.env ?? process.env);
  const pty = nodePty.spawn(opts.shell, opts.args, {
    name: 'xterm-256color',
    cwd: opts.cwd,
    cols: opts.cols,
    rows: opts.rows,
    env,
  });
  return pty;
};

// node-pty erwartet env: { [k: string]: string }, aber process.env ist
// Record<string, string | undefined>. Wir filtern undefined-Werte raus.
function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
