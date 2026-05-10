// Pure-Logik: Sensitive-File-Detector für den Pre-Commit-Panel (Sprint 7,
// Phase 7, Q7 Variante A: hartcoded Patterns).
//
// Patterns laut Briefing:
//   - .env (exact)
//   - .env.* (z.B. .env.local, .env.production, .env.development)
//   - secrets.* (z.B. secrets.json, secrets.yaml, secrets.toml)
//   - *.key (private Keys, jegliche Endung-.key)
//   - *.pem (Zertifikate / Private Keys im PEM-Format)
//
// Settings-Konfigurierbarkeit ist Sprint 8 (Settings-Dialog) — bis dahin ist die
// Liste hartcoded. Q7 Variante A.
//
// Wir matchen ausschließlich auf den BASENAME der Datei (nicht auf den ganzen
// Pfad), damit z.B. ein File `docs/notes/api.md` nicht versehentlich als
// sensitiv markiert wird, nur weil der Pfad „pem" o.ä. enthielte.

const SENSITIVE_BASENAME_PATTERNS: ReadonlyArray<RegExp> = [
  /^\.env(\..+)?$/i,    // .env, .env.local, .env.production, ...
  /^secrets\..+$/i,     // secrets.json, secrets.yaml, secrets.toml, ...
  /\.key$/i,            // *.key
  /\.pem$/i,            // *.pem
];

export function isSensitiveFile(relPath: string): boolean {
  const base = basename(relPath);
  return SENSITIVE_BASENAME_PATTERNS.some((re) => re.test(base));
}

export function findSensitiveFiles(relPaths: string[]): string[] {
  return relPaths.filter(isSensitiveFile);
}

function basename(relPath: string): string {
  const parts = relPath.split('/');
  return parts[parts.length - 1] ?? relPath;
}
