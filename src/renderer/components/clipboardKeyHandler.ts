// Pure-Logik für Copy/Paste-Tastaturshortcuts im xterm-Terminal.
//
// Bindings:
// - Ctrl+Shift+C / Ctrl+Shift+V — Modern-Terminal-Konvention (Windows Terminal, VS Code).
// - Ctrl+Insert / Shift+Insert  — Klassische Unix-X11-Konvention. Bypass für globale
//                                 Screenshot-Tool-Hotkeys, die Ctrl+Shift+C kapern.
// - Ctrl+C (Smart)              — Wenn eine Selection existiert: copy + clearSelection.
//                                 Sonst: durchlassen → xterm sendet \x03 → SIGINT.
//                                 Identisch zum Default in Windows Terminal seit 2020.
// - Ctrl+V                      — Immer paste (überschreibt das selten genutzte \x16
//                                 „quote next char" der traditionellen Terminals).
//
// Wir hängen den Handler über `terminal.attachCustomKeyEventHandler` vor das interne
// Key-Routing — Rückgabewert `false` verhindert die Weitergabe an die PTY.
//
// Wir hängen den Handler über `terminal.attachCustomKeyEventHandler` vor das interne
// Key-Routing — Rückgabewert `false` verhindert die Weitergabe an die PTY.
//
// Driver-Injection-Pattern wie createNotesSaver: ClipboardLike und Terminal-Lambda
// werden als Abhängigkeiten reingereicht, sodass Tests ohne Browser-Clipboard und
// ohne echtes xterm laufen. Die `getTerminal`-Variante (Lambda statt direkte Referenz)
// erlaubt es, dass der Handler bereits vor dem ersten xterm-open registriert wird —
// nicht zwingend nötig, aber konsistent mit Render-Lifecycles.

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

export interface TerminalLike {
  getSelection(): string;
  paste(text: string): void;
  // Wird nach erfolgreichem Smart-Ctrl+C-Copy gerufen, damit der nächste Ctrl+C
  // wieder als SIGINT durchläuft (sonst hätte der User „eine Selection für immer").
  clearSelection(): void;
}

// Phase-2 Season-2: Clipboard-Image-Paste. Wenn der Driver gesetzt ist, prüft
// der Handler bei jedem Paste-Trigger ZUERST, ob die Zwischenablage ein Bild
// enthält — wenn ja, wird es gespeichert und der absolute Pfad als Text gepastet
// (Quote-Logik via pathQuoting.ts). Bei null oder Fehler fällt der Pfad auf
// den klassischen Text-Paste zurück, damit der Standard-Workflow nicht
// regressiert.
export interface ImagePasteSaver {
  // Liest die Zwischenablage, sucht das erste image/*-Item, speichert es via
  // fs:save-screenshot und liefert den fertig zitierten Pfad-Insert-Text.
  // null = kein Bild in der Zwischenablage; '' = Bild da, Save fehlgeschlagen.
  tryReadAndSaveAsPathInsert: () => Promise<string | null>;
}

export interface ClipboardKeyHandlerDeps {
  clipboard: ClipboardLike;
  getTerminal: () => TerminalLike | null;
  // Optionaler Logger für Clipboard-Fehler (z.B. Permission-Denied im Browser).
  // Default: silent — die typische Failure-Mode ist „User hatte gerade keine
  // Schreibberechtigung" und kein Bug, der Aufmerksamkeit braucht.
  log?: (msg: string, error?: unknown) => void;
  // Phase-2 Season-2: Driver für Image-Paste-Pfad. Optional — fehlt der Driver
  // (z.B. in den Sprint-3.5-Bestandstests), läuft alles wie bisher.
  imagePasteSaver?: ImagePasteSaver;
}

// Returnt einen Handler, der xterms `attachCustomKeyEventHandler`-Vertrag erfüllt:
// - true  = Event an die PTY weiterleiten (Default-Verhalten)
// - false = Event konsumieren (PTY sieht den Tastendruck nicht)
export function createCopyPasteKeyHandler(
  deps: ClipboardKeyHandlerDeps,
): (event: KeyboardEvent) => boolean {
  const { clipboard, getTerminal, log = () => undefined, imagePasteSaver } = deps;

  return (event) => {
    // Nur keydown auswerten — keyup/keypress laufen sonst doppelt durch und würden
    // bei Paste z.B. zwei Read-Versuche auslösen.
    if (event.type !== 'keydown') return true;
    if (event.altKey) return true;

    // event.key kann je nach Layout uppercase oder lowercase sein, je nachdem ob
    // Caps Lock aktiv ist. Wir normalisieren auf lowercase.
    const key = event.key.toLowerCase();

    // Copy-Trigger: Ctrl+Shift+C (modern), Ctrl+Insert (Unix), Ctrl+C (Smart).
    // Der Smart-Ctrl+C-Pfad fällt auf SIGINT-Durchlass zurück, wenn keine Selection
    // existiert — das wird unten beim Selection-Check abgefangen.
    const isCopyTrigger =
      (event.ctrlKey && event.shiftKey && key === 'c') ||
      (event.ctrlKey && !event.shiftKey && key === 'insert') ||
      (event.ctrlKey && !event.shiftKey && key === 'c');

    // Paste-Trigger: Ctrl+Shift+V (modern), Shift+Insert (Unix), Ctrl+V (überschreibt
    // das selten genutzte \x16). Kein Selection-Check nötig — Paste ist immer aktiv.
    const isPasteTrigger =
      (event.ctrlKey && event.shiftKey && key === 'v') ||
      (!event.ctrlKey && event.shiftKey && key === 'insert') ||
      (event.ctrlKey && !event.shiftKey && key === 'v');

    if (isCopyTrigger) {
      const term = getTerminal();
      if (!term) return true;
      const selection = term.getSelection();
      // Leere Selection: Event durchlassen.
      // - Bei Ctrl+C: xterm sendet dann \x03 → SIGINT. Genau gewollt.
      // - Bei Ctrl+Shift+C / Ctrl+Insert: nichts zu kopieren, kein Schaden.
      if (selection.length === 0) return true;
      void clipboard.writeText(selection).catch((e) => {
        log('clipboard.writeText fehlgeschlagen', e);
      });
      // Selection abräumen, sonst kopiert das nächste Ctrl+C immer wieder dieselbe
      // Markierung statt SIGINT durchzulassen.
      term.clearSelection();
      return false;
    }

    if (isPasteTrigger) {
      const term = getTerminal();
      if (!term) return true;
      // Bugfix Dubble-Paste: Bei nativen Browser-Paste-Kombis (Ctrl+V, Shift+Insert)
      // bricht xterm bei Rueckgabe `false` zwar sein Key-Routing ab, ruft aber KEIN
      // preventDefault — die native Paste-Default-Aktion erzeugt dann ein `paste`-
      // Event auf der textarea, das xterms eingebauter Paste-Listener ein ZWEITES Mal
      // einfuegt. Wir unterdruecken die native Aktion hier synchron, damit nur unser
      // term.paste() unten laeuft. (Ctrl+Shift+V ist keine native Kombi → harmlos.)
      event.preventDefault();
      // Phase-2 Season-2: Image-First. Wenn ein imagePasteSaver gesetzt ist,
      // prüfen wir die Zwischenablage zuerst auf ein Bild (typischer Workflow:
      // Win+Shift+S → Snip im Clipboard → Ctrl+Shift+V). Liefert er einen
      // Pfad-Insert-String, pasten wir den. Andernfalls (kein Bild, oder
      // Save-Fehler, oder Driver fehlt) fallen wir auf den Text-Pfad zurück.
      void (async () => {
        if (imagePasteSaver !== undefined) {
          try {
            const pathInsert = await imagePasteSaver.tryReadAndSaveAsPathInsert();
            if (pathInsert !== null && pathInsert.length > 0) {
              term.paste(pathInsert);
              return;
            }
            // pathInsert === '' → Bild war da, Save schlug fehl. Nicht auf
            // Text fallen — sonst pastet der User unter Umständen Junk.
            if (pathInsert === '') return;
          } catch (e) {
            // navigator.clipboard.read() wirft, wenn die Permission fehlt
            // oder das Document nicht fokussiert ist — wir loggen und
            // fallen auf den Text-Pfad zurück, damit Standard-Paste nicht
            // regressiert.
            log('clipboard.read (image) fehlgeschlagen', e);
          }
        }
        try {
          const text = await clipboard.readText();
          if (text.length === 0) return;
          // terminal.paste() schickt automatisch im Bracketed-Paste-Mode
          // (\x1b[200~...\x1b[201~), damit claude den Block nicht zeilenweise interpretiert.
          term.paste(text);
        } catch (e) {
          log('clipboard.readText fehlgeschlagen', e);
        }
      })();
      return false;
    }

    return true;
  };
}
