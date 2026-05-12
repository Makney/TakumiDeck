// Pure-Logik für das Einfügen von Datei-Pfaden ins Terminal (Phase-2 Season-2).
//
// claude-code akzeptiert in seinem TUI-Prompt sowohl rohe Pfade als auch
// doppelt-anführungs-umrahmte Pfade. Quotes sind nur dort nötig, wo der
// Pfad ein Leerzeichen enthält — dann würde claude-code (bzw. seine
// Shell-Heuristik) den Pfad als zwei Tokens lesen.
//
// Mehrere Pfade verbinden wir mit einem einzigen Leerzeichen. Eine
// abschließende Leertaste fügen wir nicht hinzu — der User soll selbst
// entscheiden, ob direkt sein Prompt-Text folgt oder ein Enter.

export function quotePathIfNeeded(absolutePath: string): string {
  if (absolutePath.length === 0) return absolutePath;
  // Quote, sobald irgendein Whitespace im Pfad steckt. \s deckt Space, Tab,
  // unicode-Whitespace ab — alle würden vom Shell-Parser segmentieren.
  if (!/\s/.test(absolutePath)) return absolutePath;
  // Eingebettete Doppelanführungszeichen sind unter Windows in Datei-Pfaden
  // gar nicht erlaubt — wir escapen sie trotzdem defensiv, falls eine
  // exotische FS-Quelle (z.B. Tar-Mount, Cygwin-Symlink) sie liefert.
  const escaped = absolutePath.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

// Verkettet n Pfade zu einem Insert-String. Leere Eingangs-Liste → leerer
// String (Caller skipt das Paste).
export function joinPathsForPaste(absolutePaths: string[]): string {
  return absolutePaths.map(quotePathIfNeeded).join(' ');
}
