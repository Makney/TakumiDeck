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
