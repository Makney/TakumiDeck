import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Pre-Spawn-Check für die claude-Binary.
//
// node-pty schickt CreateProcess auf Windows in einen Worker-Thread; wenn die Binary
// nicht existiert, wirft der Worker später ein "Cannot create process, error code: 2",
// das schlecht abzufangen ist (Worker-Lifecycle, async). Mit einem Pre-Check stellen wir
// fest, ob der Spawn überhaupt Aussicht auf Erfolg hat — und können sonst eine saubere
// Fehlermeldung zurückgeben, statt das Main-Process-Crash-Risiko einzugehen.
export type BinaryLookup =
  | { ok: true; resolved: string }
  | { ok: false; error: string };

export function resolveExecutable(binaryPath: string): BinaryLookup {
  // 1. Absoluter Pfad: einfach existence-check.
  if (path.isAbsolute(binaryPath)) {
    if (fs.existsSync(binaryPath)) return { ok: true, resolved: binaryPath };
    return { ok: false, error: `Binary nicht gefunden: ${binaryPath}` };
  }

  // 2. Relative Pfade mit / oder \: vom CWD aus auflösen.
  if (binaryPath.includes('/') || binaryPath.includes('\\')) {
    const abs = path.resolve(binaryPath);
    if (fs.existsSync(abs)) return { ok: true, resolved: abs };
    return { ok: false, error: `Binary nicht gefunden: ${abs}` };
  }

  // 3. Bare-Name (z.B. "claude") — über PATH suchen.
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(cmd, [binaryPath], {
      encoding: 'utf-8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (process.platform === 'win32') {
      // npm-installierte CLIs liegen oft als Doppelpack vor: ein Unix-Shell-Script
      // ohne Endung plus ein .cmd-Wrapper. ConPTY (CreateProcess) kann das Shell-Script
      // nicht ausführen — wir bevorzugen daher echte Executables in dieser Reihenfolge.
      const preferred = ['.exe', '.cmd', '.bat', '.com'];
      for (const ext of preferred) {
        const match = lines.find((l) => l.toLowerCase().endsWith(ext));
        if (match) return { ok: true, resolved: match };
      }
    }
    if (lines[0]) return { ok: true, resolved: lines[0] };
  } catch {
    // where/which exited non-zero → nichts gefunden, fällt unten in den Default-Error.
  }
  return {
    ok: false,
    error:
      `'${binaryPath}' wurde nicht im PATH gefunden. ` +
      'Setze `claude_binary_path` in settings.json auf den absoluten Pfad zur claude-Binary.',
  };
}
