import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Electron-Forge-Konfiguration: Vite-Build, Native-Module-Unpack für better-sqlite3,
// Fuses-Hardening (Cookie-Encryption, ASAR-Integrity).
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'TakumiDeck',
    appBundleId: 'dev.takumideck.app',
    // Eigener Ignore-Filter überschreibt den Default des Vite-Plugins (der ALLES außer
    // /.vite ausschließt — siehe @electron-forge/plugin-vite VitePlugin.js Z.124-131).
    // Wir behalten zusätzlich /package.json und /node_modules, damit externalisierte
    // Native-Module (better-sqlite3, @lydell/node-pty) zur Laufzeit aufgelöst werden
    // können. Electron-Packager prune'd anschließend devDependencies aus node_modules.
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (file === '/package.json') return false;
      if (file.startsWith('/node_modules')) return false;
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ name: 'TakumiDeck' }),
    // Nur win32 — TakumiDeck ist Win11-Target (siehe CLAUDE.md).
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // Hardening: prozess-spezifische V8-Snapshots deaktivieren (Single-Snapshot-Modus).
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    }),
  ],
};

export default config;
