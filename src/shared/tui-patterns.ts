// TUI-Pattern-Matching für die volle State-Detection (Phase 2 Season 1).
//
// Phase 1 (Sprint 5) klassifiziert Sessions nur per JSONL-Timestamp in `running` /
// `idle`. Sobald Claude Code aber pausiert ohne die JSONL fortzuschreiben — typisch
// bei Permission-Prompts und beim Eingabe-Prompt nach Abschluss einer Antwort —
// taucht das in der reinen Timestamp-Logik als „idle" auf. Diese Phase-2-Erweiterung
// liest den serialisierten xterm-Buffer im Renderer und liefert die zusätzlichen
// Status `waiting` und `permission-prompt` aus reinem TUI-Pattern-Matching.
//
// Pure-Logik-Modul: kein Electron, kein xterm, keine DOM-Abhängigkeit. Damit ist
// das Modul in `tests/shared/tui-patterns.test.ts` als Black-Box testbar — jede
// `PatternVersion` bringt ihre eigenen Fixtures mit (Schema-Test pro Claude-Code-
// Version, siehe Roadmap Phase 2 / Sessions).
//
// Versionierung:
// - Claude Code ändert seine TUI zwischen Major-Versionen (Box-Drawing-Zeichen,
//   Menü-Layout, Prompt-Symbol). Statt eine globale Pattern-Liste laufend zu
//   verbiegen, frieren wir jede Version als eigene `PatternVersion` ein.
// - `DEFAULT_PATTERN_VERSION_ID` zeigt auf die jeweils aktuelle Pattern-Generation.
//   Neue Claude-Code-Versionen kommen als zusätzlicher Eintrag dazu — alte Fixtures
//   bleiben grün, und ein A/B-Vergleich ist nachträglich möglich.

// State-Werte aus der xterm-Detection. Match die vier Status aus dem Sprint-9-
// Backlog-Eintrag „Volle State-Detection".
export type TuiDetectedState = 'running' | 'waiting' | 'idle' | 'permission-prompt';

export type PatternVersionId = string;

// Ein PatternSet beschreibt die Regex-Liste pro Status, der gematcht werden soll.
// Die Reihenfolge der Auswertung in `detectFromBuffer` ist fix: erst permission-
// prompt (höchste Priorität, weil User-Input zwingend ist), dann waiting.
// `running` und `idle` sind keine Pattern-Matches, sondern Fallbacks aus dem
// `bufferChanged`-Hinweis (siehe `detectFromBuffer`).
export interface PatternSet {
  permissionPrompt: readonly RegExp[];
  waiting: readonly RegExp[];
  // Claude Code 2.x zeigt den Input-Prompt (`> ? for shortcuts`) PERMANENT —
  // auch während Claude noch antwortet. Damit `waiting` nicht false-positive
  // feuert, blockieren diese Muster den waiting-Return, wenn sie im Tail zu
  // sehen sind (Claude ist dann noch aktiv).
  waitingBlockers?: readonly RegExp[];
  // Wenn im Tail sichtbar → erzwingt `running`, auch wenn bufferChanged=false.
  // Typisch: „esc to interrupt" (Claude Code Footer während aktiver Berechnung,
  // z.B. Perambulating / extended thinking). Greift nach waiting-Check, bevor
  // der bufferChanged-Fallback entscheidet.
  runningIndicators?: readonly RegExp[];
}

// Test-Fixture: ein konkreter Buffer-Snapshot + erwartete Klassifikation.
// Wird in den Schema-Tests pro Version durchgereicht.
export interface PatternFixture {
  description: string;
  lines: string[];
  bufferChanged: boolean;
  expected: TuiDetectedState;
}

export interface PatternVersion {
  id: PatternVersionId;
  description: string;
  // Semver-Range der claude-Binary, die diese Patterns abdeckt. Reine Dokumentation —
  // die Renderer-Seite wählt aktuell hartcoded `DEFAULT_PATTERN_VERSION_ID`. Sobald
  // wir die claude-Version per `claude --version` zur Laufzeit ziehen, wird die Range
  // als Auswahl-Kriterium relevant.
  claudeCodeRange: string;
  patterns: PatternSet;
  fixtures: PatternFixture[];
}

// Wieviele Zeilen am Buffer-Ende durchsucht werden. Permission-Prompts und der
// Claude-Code-Eingabe-Prompt liegen immer am unteren Rand — alles ältere ist
// historisch und darf nicht ungewollt matchen (z.B. ein vorhergehender (y/n)-
// Dialog, der inzwischen quittiert wurde).
const TAIL_WINDOW = 8;

// --- Pattern-Definition: Claude Code 1.x ----------------------------------

const CC_1X_PATTERNS: PatternSet = {
  // Wenn im Tail sichtbar, bedeutet das: Claude ist noch am Arbeiten — `waiting`
  // wäre ein False-Positive. Claude Code 2.x hält den `>` Input-Prompt permanent
  // unten, daher darf der Input-Prompt allein nicht als `waiting`-Signal gelten.
  waitingBlockers: [
    /\besc to interrupt\b/i,
  ],
  // Esc-to-interrupt im Tail = Claude rechnet definitiv noch (Perambulating,
  // extended thinking, Tool-Calls). Erzwingt `running` auch wenn der Buffer
  // seit dem letzten Tick nicht geändert hat (bufferChanged=false).
  runningIndicators: [
    /\besc to interrupt\b/i,
  ],
  // Permission-Prompt: Claude Code 1.x zeigt strukturierte Dialoge mit einer
  // „Do you want to…"-Frage + nummerierten Optionen + Pfeil-Indikator. Wir
  // matchen mehrere Varianten parallel, damit die Erkennung auch beim leicht
  // anders formatierten Bash-/Edit-/Tool-Permission-Dialog greift.
  permissionPrompt: [
    // Klassische Frageformulierung.
    /\bdo you want to\b[^?]*\?/i,
    // Nummerierte Menü-Auswahl mit `❯`-Pfeil + Yes (älteres Format).
    /❯\s*\d+\.\s+yes\b/i,
    // Klein-Variante: `(y/n)` / `(Y/N)`.
    /\([yY]\/[nN]\)\s*>?\s*$/m,
    // Eckige-Klammer-Variante.
    /\[[yY]\/[nN]\]\s*>?\s*$/m,
    // Claude Code 2.x interaktives Auswahlmenü: feste Footer-Zeile mit
    // Navigations-Hint — eindeutiger als der Prompt-Text selbst.
    /Enter to select\b/i,
    // Allgemein: nummerierte Liste mit `>`-Cursor auf der ersten Option
    // (Claude Code 2.x Selection-UI).
    /^>\s*\d+\.\s+\S/m,
  ],

  // Waiting: Claude hat seine Antwort abgeschlossen und zeigt den Eingabe-Prompt.
  // Die letzte sichtbare Nicht-Leerzeile ist entweder das Prompt-Symbol (`>` / `❯`)
  // oder — in Claude Code 1.x — der Hint „? for shortcuts", den Claude Code
  // direkt unter den Prompt-Cursor hängt (dann ist `>` vorletzte, `? for shortcuts`
  // letzte Zeile).
  waiting: [
    // Reines `>`-Prompt am Zeilenende; toleriert Trailing-Whitespace (Cursor
    // wird vom Renderer als Leerzeichen serialisiert).
    /^>\s*$/,
    // Pfeil-Variante.
    /^❯\s*$/,
    // Claude Code 2.x: zwei Layout-Varianten je nach TUI-Zustand.
    // Variante A (während Antwort, Input komprimiert): `> ? for shortcuts` auf EINER Zeile.
    // `^\s*` Toleranz, weil Claude Code 2.x den Hint im Box-Layout mit 2 Spaces einrückt.
    /^\s*[>❯]\s+\?\s+for shortcuts\s*$/i,
    // Variante B (nach Antwort, Input expandiert): `? for shortcuts` als letzte
    // Zeile, `> [user-input]` eine Zeile darüber. Im echten Claude-Code-2.x-Layout
    // hängt der Hint UNTER der Box-Bottom-Border und ist mit 2 Leerzeichen eingerückt
    // (`"  ? for shortcuts"`). Daher führendes `\s*` zwingend.
    /^\s*\?\s+for shortcuts\s*$/i,
    // Älteres Convention-Format (vor 1.0): `Human: ` als Eingabe-Aufforderung.
    /^human:\s*$/i,
  ],
};

const CC_1X: PatternVersion = {
  id: 'cc-1.x',
  description: 'Claude Code 1.x TUI (Phase-2-Baseline)',
  claudeCodeRange: '>=1.0.0 <2.0.0',
  patterns: CC_1X_PATTERNS,
  fixtures: [
    {
      description: 'Permission-Prompt mit „Do you want to…"-Frage',
      lines: [
        '  Edit: src/foo.ts',
        '',
        '  Do you want to make this edit to foo.ts?',
        '  ❯ 1. Yes',
        '    2. Yes, and don\'t ask again this session',
        '    3. No, and tell Claude what to do differently (esc)',
        '',
      ],
      bufferChanged: false,
      expected: 'permission-prompt',
    },
    {
      description: 'Claude Code 2.x Auswahlmenü (Enter to select)',
      lines: [
        'Was möchtest du auswählen?',
        '',
        '> 1. Option A',
        '   Die erste Option',
        '2. Option B',
        '',
        'Enter to select · ↑/↓ to navigate · Esc to cancel',
      ],
      bufferChanged: false,
      expected: 'permission-prompt',
    },
    {
      description: 'Permission-Prompt mit (y/n)-Shortform',
      lines: [
        'Bash: rm -rf /tmp/foo',
        'Do you want to continue? (y/n) >',
      ],
      bufferChanged: false,
      expected: 'permission-prompt',
    },
    {
      description: 'Waiting-Prompt: nur `>` am Ende',
      lines: [
        '● Done',
        '',
        '> ',
      ],
      bufferChanged: false,
      expected: 'waiting',
    },
    {
      description: 'Waiting-Prompt: `❯` (neueres Symbol)',
      lines: [
        '● Done',
        '',
        '❯ ',
      ],
      bufferChanged: false,
      expected: 'waiting',
    },
    {
      description: 'Waiting-Prompt: `> ? for shortcuts` ohne esc-Hint (Claude fertig)',
      // Claude Code 2.x zeigt `> ? for shortcuts` immer, aber `esc to interrupt`
      // verschwindet, wenn Claude fertig ist — erst dann ist waiting valide.
      lines: [
        '● Hallo! Gut, danke.',
        '⋇ Brewed for 2s',
        '',
        '> ? for shortcuts ',
      ],
      bufferChanged: false,
      expected: 'waiting',
    },
    {
      description: 'Waiting-Prompt Variante B: `? for shortcuts` als eigene letzte Zeile',
      // Nach Antwort expandiert Claude Code den Input-Bereich: Prompt-Zeile (`>`) und
      // Hint-Zeile (`? for shortcuts`) getrennt. Alles oberhalb ist variabler Claude-
      // Output — wir prüfen nur die letzte Zeile.
      lines: [
        '[variabler Claude-Output]',
        '',
        '> ',
        '? for shortcuts',
      ],
      bufferChanged: false,
      expected: 'waiting',
    },
    {
      description: 'Waiting im Box-Layout (Claude Code 2.x) — Hint unter Bottom-Border mit 2-Spaces-Einrückung',
      // Echtes Layout aus dem laufenden Tool (Diagnose 2026-05-12): rounded box
      // rund um den Input, Hint-Zeile UNTER der Box mit Leerzeichen-Einrückung
      // plus Trailing-Spaces durch Zellen-Padding. Der `^\s*`-Anker im Pattern
      // muss diese Einrückung tolerieren — sonst hängt der Status auf running.
      lines: [
        '● Hier.',
        '✻ Crunched for 1s  ',
        '──────────────────────────────────────────────────────────────────────',
        '> okay ich glaube der test ist fertig                                  ',
        '──────────────────────────────────────────────────────────────────────',
        '  ? for shortcuts                                                     ',
      ],
      bufferChanged: false,
      expected: 'waiting',
    },
    {
      description: 'Kein Waiting wenn `esc to interrupt` im Tail (Claude läuft noch)',
      lines: [
        '────────────────────────────────────────',
        '  esc to interrupt    ● high · /effort  ',
        '> ? for shortcuts ',
      ],
      bufferChanged: true,
      expected: 'running',
    },
    {
      description: 'Running via runningIndicator auch wenn bufferChanged=false (Perambulating)',
      // Extended thinking / Tool-Aufrufe schreiben kein JSONL und ändern den
      // Buffer nicht unbedingt in jedem Tick — trotzdem ist Claude aktiv.
      lines: [
        '+Perambulating... (12s · ↑ 379 tokens · thought for 2s)',
        '● Reading src/foo.ts',
        '────────────────────────────────────────',
        '  esc to interrupt    ● high · /effort  ',
        '> ? for shortcuts ',
      ],
      bufferChanged: false,
      expected: 'running',
    },
    {
      description: 'Running: keine Patterns, aber Buffer ändert sich',
      lines: [
        '● Reading src/foo.ts',
        '  └─ 142 lines',
        '● Now editing…',
      ],
      bufferChanged: true,
      expected: 'running',
    },
    {
      description: 'Idle: keine Patterns, Buffer steht still',
      lines: [
        '● Reading src/foo.ts',
        '  └─ 142 lines',
      ],
      bufferChanged: false,
      expected: 'idle',
    },
    {
      description: 'Leerer Buffer → idle',
      lines: [],
      bufferChanged: false,
      expected: 'idle',
    },
    {
      description: 'Alte (y/n)-Spur in historischem Output triggert NICHT permission-prompt',
      // Der historische Dialog liegt außerhalb von TAIL_WINDOW (= 8), die letzten
      // Zeilen zeigen nur normalen Output. Wäre der Tail-Cut weg, würde der Match
      // false-positive feuern.
      lines: [
        'Do you want to continue? (y/n) >',
        '> y',
        '● Yes',
        '',
        '● Step 1',
        '● Step 2',
        '● Step 3',
        '● Step 4',
        '● Step 5',
        '● Step 6',
        '● Step 7',
        '● Step 8',
      ],
      bufferChanged: true,
      expected: 'running',
    },
  ],
};

// Registry aller bekannten Pattern-Versionen. Neue Claude-Code-Generationen kommen
// als zusätzlicher Eintrag dazu — alte Versionen werden NICHT entfernt, damit
// alte Fixtures grün bleiben und A/B-Vergleiche möglich sind.
export const PATTERN_VERSIONS: readonly PatternVersion[] = [CC_1X];

// Default-Version: derzeit Claude Code 1.x. Sobald die Detection an einer
// neueren Version greifen soll, wird hier umgeschaltet (oder die Auswahl
// per Settings/Health-Check dynamisch gemacht — siehe Backlog).
export const DEFAULT_PATTERN_VERSION_ID: PatternVersionId = CC_1X.id;

// Lookup-Helper. Fällt auf die Default-Version zurück, wenn der angegebene
// Id nicht registriert ist — robust gegen Renderer/Main-Drift.
export function getPatternVersion(id?: PatternVersionId): PatternVersion {
  if (id) {
    const found = PATTERN_VERSIONS.find((v) => v.id === id);
    if (found) return found;
  }
  return PATTERN_VERSIONS.find((v) => v.id === DEFAULT_PATTERN_VERSION_ID) ?? CC_1X;
}

// --- Detection-Funktion ----------------------------------------------------

export interface DetectFromBufferInput {
  // Sichtbare Buffer-Zeilen, bereits ANSI-frei. Der Renderer zieht sie via
  // `terminal.buffer.active.getLine(i).translateToString(true)` — translateToString
  // liefert reinen Text ohne Escape-Sequenzen, was die Patterns simpel hält.
  lines: string[];
  // Hinweis aus dem Renderer, ob sich der Buffer-Inhalt seit dem letzten Tick
  // verändert hat (Hash-Vergleich). Drives den running/idle-Fallback, wenn weder
  // permission-prompt noch waiting matchen.
  bufferChanged: boolean;
  // Optionaler Override für die Pattern-Generation. Default: DEFAULT_PATTERN_VERSION_ID.
  versionId?: PatternVersionId;
}

// Reine Klassifikation. Ablauf:
//   1. Tail-Fenster bilden (letzte TAIL_WINDOW Zeilen, Trailing-Leerzeilen weggekürzt).
//   2. Permission-Prompt-Patterns gegen den Tail-Text (mehrzeilig joined) testen.
//   3. Waiting-Patterns gegen die LETZTE Nicht-Leerzeile testen (Prompt-Symbol-Match).
//   4. Fallback: bufferChanged → running, sonst → idle.
//
// Die Trennung Permission > Waiting > Activity ist absichtlich, weil ein
// Permission-Prompt am Tail genauso ein leeres `> `-Symbol als letzte Zeile
// hat (der Cursor nach der Frage). Würden wir waiting zuerst prüfen, würde
// jeder Permission-Prompt als waiting durchgehen.
export function detectFromBuffer(input: DetectFromBufferInput): TuiDetectedState {
  const version = getPatternVersion(input.versionId);

  // Trailing-Empty-Lines abschneiden — der serialisierte Buffer endet oft mit
  // ein paar Leerzeilen (xterm füllt die letzten Reihen auf), die unsere Tail-
  // Logik verzerren würden.
  const trimmed = trimTrailingEmpty(input.lines);
  if (trimmed.length === 0) return 'idle';

  const tail = trimmed.slice(-TAIL_WINDOW);
  const tailText = tail.join('\n');

  for (const re of version.patterns.permissionPrompt) {
    if (re.test(tailText)) return 'permission-prompt';
  }

  // noUncheckedIndexedAccess macht den Index-Lookup `string | undefined`. Wir
  // haben `trimmed.length === 0` oben schon abgefangen, aber der Compiler weiß
  // das nicht — daher der ?? '' Fallback.
  const lastLine = trimmed[trimmed.length - 1] ?? '';
  for (const re of version.patterns.waiting) {
    if (re.test(lastLine)) {
      // Blocker-Check: wenn ein waitingBlocker-Muster im Tail steht (z.B.
      // „esc to interrupt"), ist Claude noch aktiv — waiting wäre ein
      // False-Positive weil der Input-Prompt in Claude Code 2.x permanent
      // sichtbar ist.
      const blockers = version.patterns.waitingBlockers ?? [];
      if (blockers.some((b) => b.test(tailText))) break;
      return 'waiting';
    }
  }

  // runningIndicators im Tail → running, auch ohne bufferChanged (Claude
  // rechnet, schreibt aber gerade kein JSONL — Perambulating / extended thinking).
  const runningInds = version.patterns.runningIndicators ?? [];
  if (runningInds.some((r) => r.test(tailText))) return 'running';

  return input.bufferChanged ? 'running' : 'idle';
}

// Hilfsfunktion: leere Trailing-Zeilen wegkürzen. Eine Zeile gilt als leer,
// wenn sie nur aus Whitespace besteht — xterm rendert leere Buffer-Zellen als
// Leerzeichen, die unser Tail-Match sonst durcheinanderbringen würden.
function trimTrailingEmpty(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && /^\s*$/.test(lines[end - 1] ?? '')) end--;
  return lines.slice(0, end);
}
