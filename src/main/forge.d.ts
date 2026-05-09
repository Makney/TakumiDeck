// Globale Konstanten, die der Forge-Vite-Plugin zur Build-Zeit injiziert.
// MAIN_WINDOW entspricht dem Renderer-Namen aus forge.config.ts.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

declare module 'electron-squirrel-startup' {
  const started: boolean;
  export default started;
}
