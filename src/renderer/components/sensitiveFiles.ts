// Pure-Logik: Sensitive-File-Detector für den Pre-Commit-Panel.
//
// Sprint 7 (Q7 Variante A): hartcoded Defaults.
// Sprint 8 (Variante A, additiv): zusätzliche RegEx-Quellen aus
// AppSettings.sensitive_file_patterns kommen ZU den Defaults dazu — die
// Defaults sind universell richtig und nicht deaktivierbar.
//
// Defaults (Architektur 6.7 + Bereich-8-Review):
//   - .env (exact) und .env.* (z.B. .env.local, .env.production)
//   - *secret* (Substring im Basename — fängt sowohl `secrets.json` als auch
//     `api-secret.txt` oder `my_secret_config.json`)
//   - *token* (Substring im Basename — API-Tokens, Auth-Tokens)
//   - id_rsa, id_dsa, id_ecdsa, id_ed25519 (SSH-Private-Keys)
//   - credentials.json / credentials.yaml (gcloud-/aws-Style)
//   - *.key (private Keys, jegliche Endung-.key)
//   - *.pem (Zertifikate / Private Keys im PEM-Format)
//
// Wir matchen ausschließlich auf den BASENAME der Datei (nicht auf den ganzen
// Pfad), damit z.B. ein File `docs/notes/api.md` nicht versehentlich als
// sensitiv markiert wird, nur weil der Pfad „pem" o.ä. enthielte.

const SENSITIVE_BASENAME_PATTERNS: ReadonlyArray<RegExp> = [
  /^\.env(\..+)?$/i,    // .env, .env.local, .env.production, ...
  /secret/i,            // *secret* (substring): secrets.json, api-secret.txt, my_secret_config.json
  /token/i,             // *token* (substring): auth-token.txt, github_token.env
  /^id_(rsa|dsa|ecdsa|ed25519)(\..+)?$/i, // SSH-Private-Keys (mit/ohne Endung)
  /^credentials\.(json|yaml|yml)$/i,      // gcloud/aws credentials-Files
  /\.key$/i,            // *.key
  /\.pem$/i,            // *.pem
];

// User-Patterns werden bei jedem Aufruf neu kompiliert (klein, kein Hot-Path).
// Ungültige RegEx-Quellen werden still gedroppt — der Aufrufer kriegt eine
// optionale Warning-Liste zurück, falls er ein UI-Hint braucht.
function compileUserPatterns(sources: ReadonlyArray<string>): {
  patterns: RegExp[];
  invalid: string[];
} {
  const patterns: RegExp[] = [];
  const invalid: string[] = [];
  for (const src of sources) {
    if (!src || src.trim().length === 0) continue;
    try {
      patterns.push(new RegExp(src, 'i'));
    } catch {
      invalid.push(src);
    }
  }
  return { patterns, invalid };
}

export function isSensitiveFile(
  relPath: string,
  userPatterns: ReadonlyArray<string> = [],
): boolean {
  const base = basename(relPath);
  if (SENSITIVE_BASENAME_PATTERNS.some((re) => re.test(base))) return true;
  if (userPatterns.length === 0) return false;
  const { patterns } = compileUserPatterns(userPatterns);
  // User-Patterns matchen auf den ganzen relPath (Forward-Slash) — der User
  // kann „config/private/.*" o.ä. schreiben, was ein Basename-Match nicht
  // abbilden könnte. Defaults bleiben Basename-only (siehe oben).
  return patterns.some((re) => re.test(relPath));
}

export function findSensitiveFiles(
  relPaths: string[],
  userPatterns: ReadonlyArray<string> = [],
): string[] {
  return relPaths.filter((p) => isSensitiveFile(p, userPatterns));
}

// Für UI-Validation im Settings-Dialog: prüft eine Liste, gibt die
// nicht-kompilierbaren Quellen zurück (kein Throw).
export function validateUserPatterns(sources: ReadonlyArray<string>): string[] {
  return compileUserPatterns(sources).invalid;
}

function basename(relPath: string): string {
  const parts = relPath.split('/');
  return parts[parts.length - 1] ?? relPath;
}
