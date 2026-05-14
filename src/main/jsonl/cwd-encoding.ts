// Encoded-cwd-Konvention von claude-code (Sprint 5).
//
// claude-code legt JSONLs unter ~/.claude/projects/<encoded-cwd>/<sid>.jsonl ab.
// `<encoded-cwd>` entsteht aus dem absoluten Pfad durch Ersetzung aller Pfad-
// Trennzeichen und Laufwerks-Doppelpunkte durch ein einfaches `-`. Beispiele:
//   `C:\Users\makne\Desktop\TanaLib`  → `C--Users-makne-Desktop-TanaLib`
//   `D:\Projekte\TakumiDeck`          → `D--Projekte-TakumiDeck`
//   `/home/foo/bar`                   → `-home-foo-bar`
//
// Der Encoder ist verlustbehaftet (mehrere `cwd`-Werte können denselben encoded-
// cwd-String erzeugen, wenn ein Pfadsegment selbst `-` enthält). Wir matchen
// deshalb in beide Richtungen: erst encoded-cwd vergleichen, bei Mehrfach-Treffer
// bevorzugen wir die Session, deren `started_at` zeitlich am nächsten am ersten
// Event in der JSONL liegt.

import path from 'node:path';

export function encodeCwd(cwd: string): string {
  // Normalisiere zuerst auf konsistentes Path-Format und ersetze dann alle
  // Trennzeichen und Doppelpunkte durch `-`.
  const normalized = path.normalize(cwd);
  return normalized.replace(/[:\\/]/g, '-');
}

// Aus einem Filepath ~/.claude/projects/<encoded-cwd>/<sid>.jsonl wird der
// encoded-cwd-Anteil extrahiert. Returnt null, wenn der Pfad nicht ins Schema passt.
export function encodedCwdFromJsonlPath(filePath: string): string | null {
  const dir = path.dirname(filePath);
  const base = path.basename(dir);
  if (base.length === 0) return null;
  return base;
}

// Sprint-6-Hotfix: claude-code benamen JSONL-Files mit der eigenen Session-UUID
// (= das, was --resume erwartet). Der Filename ist `<uuid>.jsonl`. Wir extrahieren
// den UUID-Stem für den Backfill-Pfad in sessions.claude_session_id. Returnt null,
// wenn der Filename keine UUID-Form hat.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function claudeUuidFromJsonlPath(filePath: string): string | null {
  const base = path.basename(filePath);
  const stem = base.replace(/\.jsonl$/i, '');
  return UUID_RE.test(stem) ? stem : null;
}

// Phase-2 Season-15: erwarteten JSONL-Pfad fuer eine bekannte cwd + Session-UUID
// berechnen. claude-code legt die Datei deterministisch unter
// `<projectsRoot>/<encodeCwd(cwd)>/<uuid>.jsonl` ab; mit `--session-id <uuid>`
// beim Spawn kennen wir alle drei Komponenten vorab. `path.normalize` glaettet
// Trailing-Slashes / gemischte Separator, damit der Match gegen den vom
// Watcher gemeldeten Pfad konsistent klappt (chokidar reportet OS-canonical).
export function expectedJsonlPath(
  projectsRoot: string,
  cwd: string,
  claudeSessionId: string,
): string {
  return path.normalize(
    path.join(projectsRoot, encodeCwd(cwd), `${claudeSessionId}.jsonl`),
  );
}
