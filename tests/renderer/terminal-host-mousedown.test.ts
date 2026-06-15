import { describe, expect, it } from 'vitest';
import { decideHostMouseDown } from '../../src/renderer/panels/terminal/terminalHostMouseDown';

// Bugfix 2026-06-15: Rechtsklick-Kontextmenue — Kopieren/Einfuegen tat nichts,
// weil der mousedown eines Menuepunkts zum Pane-Handler hochbubbelte und das
// Menue schloss, bevor das click-Event den Button-onClick erreichte. Der Fix:
// Klicks im Menue lassen den Handler aussteigen ('ignore'), das Menue bleibt
// bis zum click bestehen.
describe('decideHostMouseDown', () => {
  it("Klick INNERHALB des Menues → 'ignore' (Button-onClick darf feuern)", () => {
    expect(
      decideHostMouseDown({
        targetInContextMenu: true,
        contextMenuOpen: true,
        button: 0,
      }),
    ).toBe('ignore');
  });

  it("Linksklick ausserhalb bei offenem Menue → 'dismiss'", () => {
    expect(
      decideHostMouseDown({
        targetInContextMenu: false,
        contextMenuOpen: true,
        button: 0,
      }),
    ).toBe('dismiss');
  });

  it("Linksklick ohne offenes Menue → 'focus' (xterm-Fokus-Fang)", () => {
    expect(
      decideHostMouseDown({
        targetInContextMenu: false,
        contextMenuOpen: false,
        button: 0,
      }),
    ).toBe('focus');
  });

  it("Rechtsklick (button !== 0) bei offenem Menue → 'focus', nicht 'dismiss'", () => {
    // Rechtsklick oeffnet via onContextMenu ein neues Menue an neuer Position;
    // der mousedown soll es nicht im selben Zug schliessen.
    expect(
      decideHostMouseDown({
        targetInContextMenu: false,
        contextMenuOpen: true,
        button: 2,
      }),
    ).toBe('focus');
  });

  it("Klick im Menue hat Vorrang vor allem anderen", () => {
    // Auch wenn (theoretisch) button !== 0: Ziel im Menue → immer 'ignore'.
    expect(
      decideHostMouseDown({
        targetInContextMenu: true,
        contextMenuOpen: true,
        button: 2,
      }),
    ).toBe('ignore');
  });
});
