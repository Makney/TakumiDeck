import { useEffect, useState, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { AppSettings } from '@shared/types';
import { clampFontSize } from '../../components/terminalFontZoom';
import { safeFit } from './terminalHelpers';

// Phase-2 Season-28: Lokaler Font-Size-Override pro Tab plus die beiden
// Sync-Effekte (Settings-Hot-Update ↔ Ctrl+Mausrad-Override). null = User hat
// nicht gezoomt, dann gilt settings.terminal_font_size. Den Override-Setter
// braucht der Init-Effekt fuer den attachCustomWheelEventHandler, deshalb
// gibt der Hook beides zurueck.
export function useTerminalFontZoom(
  terminalRef: RefObject<Terminal | null>,
  fitRef: RefObject<FitAddon | null>,
  settings: AppSettings,
): {
  fontSizeOverride: number | null;
  setFontSizeOverride: React.Dispatch<React.SetStateAction<number | null>>;
} {
  // Lokaler Font-Size-Override pro Tab. null = User hat nicht gezoomt, dann
  // gilt settings.terminal_font_size. Bei einem Settings-Hot-Update setzen wir
  // den Override zurueck (Settings sind die Wahrheit, sobald der User sie
  // explizit aendert).
  const [fontSizeOverride, setFontSizeOverride] = useState<number | null>(null);

  // Hot-Update der Schriftart, wenn der User die Settings ändert.
  // Phase-2 Season-28: Wenn der User in den Settings die Schriftgroesse aendert,
  // hat das Vorrang vor dem lokalen Ctrl+Mausrad-Override — sonst wuerde der
  // User das Settings-Modal anpassen und das Terminal wuerde sich nicht ruehren.
  // Der Override wird zurueckgesetzt; spaetere Wheel-Aktionen starten dann auf
  // dem neuen Settings-Wert.
  useEffect(() => {
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = settings.terminal_font_family;
    terminal.options.fontSize = clampFontSize(settings.terminal_font_size);
    setFontSizeOverride(null);
    safeFit(fit);
  }, [settings.terminal_font_family, settings.terminal_font_size, terminalRef, fitRef]);

  // Phase-2 Season-28: Wenn der Override sich aendert (Ctrl+Mausrad), die
  // xterm-Schriftgroesse aktualisieren und Layout neu fitten. Bei Override=null
  // ist Setting-Wert die Wahrheit und der obige Effect uebernimmt.
  useEffect(() => {
    if (fontSizeOverride === null) return;
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal) return;
    terminal.options.fontSize = clampFontSize(fontSizeOverride);
    safeFit(fit);
  }, [fontSizeOverride, terminalRef, fitRef]);

  return { fontSizeOverride, setFontSizeOverride };
}
