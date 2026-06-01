import { Field, type TabBaseProps } from './shared';

export function TerminalTab({ settings, setField }: TabBaseProps) {
  return (
    <div className="td-settings-section">
      <Field label="Schriftart" hint="Komma-getrennte Fallback-Liste. Erste vorhandene Font wird verwendet.">
        <input
          type="text"
          className="td-settings-input"
          value={settings.terminal_font_family}
          onChange={(e) => setField('terminal_font_family', e.target.value)}
          spellCheck={false}
        />
      </Field>

      <Field label="Schriftgröße (px)">
        <input
          type="number"
          min={9}
          max={28}
          className="td-settings-input td-settings-input--narrow"
          value={settings.terminal_font_size}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) setField('terminal_font_size', n);
          }}
        />
      </Field>
    </div>
  );
}
