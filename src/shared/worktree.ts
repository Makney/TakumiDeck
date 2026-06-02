// Season 37 (Worktree-Support): Pure-Helper, der einen frei eingegebenen
// Branch-Namen in einen gueltigen Git-Ref ueberfuehrt. Git lehnt z.B.
// Leerzeichen und `~^:?*[\` in Branch-Namen ab (`git check-ref-format`), und
// der User tippt im Modal oft einen Titel-aehnlichen Text. Statt den Spawn
// crashen zu lassen, slugifizieren wir konvenient.
//
// Regeln (vereinfacht gegenueber git check-ref-format, aber sicher):
//   - alles ausser [A-Za-z0-9._/-] wird zu '-' (entfernt Whitespace, ~^:?*[\ …)
//   - Mehrfach-/, -, . werden zusammengefasst
//   - fuehrende/abschliessende '-', '/', '.' werden entfernt
//   - '/' bleibt erhalten, damit hierarchische Branches (feature/foo) gehen
//   - leeres Ergebnis faellt auf 'worktree' zurueck
//
// Wird im NewSessionModal als Live-Vorschau UND im Main vor `git worktree add`
// (Mode 'new') angewandt — der Main ist die Autoritaet, die Vorschau nur Komfort.
export function sanitizeBranchName(raw: string): string {
  let s = raw.trim().replace(/[^A-Za-z0-9._/-]+/g, '-');
  s = s.replace(/\/{2,}/g, '/').replace(/-{2,}/g, '-').replace(/\.{2,}/g, '.');
  s = s.replace(/^[-/.]+/, '').replace(/[-/.]+$/, '');
  return s.length > 0 ? s : 'worktree';
}
