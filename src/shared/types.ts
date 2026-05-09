// Domänen-Typen, die zwischen Main und Renderer geteilt werden.
// Sprint 1: Settings + App-Misc + IpcResult.

// Result-Type-Pattern: IPC-Handler werfen nicht, sondern returnen ein Result.
// Renderer muss `ok` prüfen, bevor `data` benutzt wird.
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

// Plannutzungs-Bar-Konfiguration (im Settings-JSON serialisiert).
export interface LimitBar {
  id: string;
  label: string;
  window_hours: number;
  filter: 'all' | 'top_tier' | 'sonnet' | 'haiku' | 'custom';
  limit_method: 'p90' | 'fixed';
  model_pattern?: string;
  fixed_limit?: number;
}

// Vollständige Settings-Shape laut Architektur Kapitel 4.
// Wird als settings.json im AppData-Ordner persistiert.
export interface AppSettings {
  workspace_path: string;
  default_model: string;
  model_limits: Record<string, number>;
  default_limit: number;
  limit_bars: LimitBar[];
  p90_window_hours: number;
  token_warning_thresholds: {
    yellow: number;
    orange: number;
    red: number;
  };
  terminal_font_family: string;
  terminal_font_size: number;
  theme: 'dark' | 'light';
  accent_color: string;
  shortcuts: Record<string, string>;
}

// Bridge-API-Shape, die der Renderer über window.api erhält.
// Sprint 1 belegt nur die Felder settings + app; weitere Felder kommen mit den Sprints dazu.
export interface RendererApi {
  settings: {
    get: () => Promise<IpcResult<AppSettings>>;
    set: (patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>;
  };
  app: {
    getVersion: () => Promise<IpcResult<string>>;
    openDataFolder: () => Promise<IpcResult<string>>;
  };
}

declare global {
  interface Window {
    api: RendererApi;
  }
}
