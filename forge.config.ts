import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Seed-basierte Dep-Closure: nur die in vite.main.config.ts externalisierten
// Native-Module + ihre Transitiven landen im ASAR-node_modules. Alle anderen
// prod-Deps werden von Vite ins main/renderer-Bundle inlined und sind dadurch
// in node_modules redundant (ca. 30 MiB Doppelung sonst).
//
// Seed muss synchron mit vite.main.config.ts:21-28 sein. Wenn dort ein neues
// External hinzukommt, muss es auch hier rein.
const EXTERNAL_NATIVE_SEED = ['better-sqlite3', '@lydell/node-pty'];

function computeNativeDepClosure(rootDir: string, seed: string[]): Set<string> {
  const allowed = new Set<string>();
  const queue: string[] = [...seed];
  while (queue.length > 0) {
    const dep = queue.shift()!;
    if (allowed.has(dep)) continue;
    allowed.add(dep);
    const depPkgPath = join(rootDir, 'node_modules', dep, 'package.json');
    if (!existsSync(depPkgPath)) continue;
    try {
      const depPkg = JSON.parse(readFileSync(depPkgPath, 'utf8'));
      queue.push(...Object.keys(depPkg.dependencies ?? {}));
      // optionalDependencies fuer Plattform-Binaries (@lydell/node-pty-win32-x64)
      queue.push(...Object.keys(depPkg.optionalDependencies ?? {}));
    } catch {
      // unlesbares package.json wird ignoriert — dep faellt aus der Closure.
    }
  }
  return allowed;
}

const prodDeps = computeNativeDepClosure(__dirname, EXTERNAL_NATIVE_SEED);

// Set der Scopes ("@<scope>"), die mindestens ein prod-Paket enthalten. Wir
// muessen die Scope-Verzeichnisse durchlassen, sonst schliesst electron-packager
// den gesamten Subtree aus; gleichzeitig wollen wir nicht Scopes durchlassen,
// die ausschliesslich devDeps enthalten (@babel, @eslint, @vitejs, …).
const prodScopes = new Set<string>();
for (const dep of prodDeps) {
  if (dep.startsWith('@')) {
    const slashIdx = dep.indexOf('/');
    if (slashIdx > 0) prodScopes.add(dep.slice(0, slashIdx));
  }
}

function isProdDepPath(file: string): boolean {
  // Erwartet Pfade in Form "/node_modules/<pkg>" oder "/node_modules/<scope>/<pkg>"
  // (und tiefere Pfade darunter). Forge nutzt Forward-Slashes intern, auch unter Win.
  const segments = file.split('/');
  if (segments.length < 3) return false;
  const seg2 = segments[2];
  if (!seg2 || seg2 === '.bin' || seg2 === '.package-lock.json') return false;
  // Scope-Verzeichnis: nur durchlassen, wenn der Scope ein prod-Paket enthaelt.
  if (seg2.startsWith('@') && segments.length === 3) return prodScopes.has(seg2);
  const pkgName = seg2.startsWith('@')
    ? segments.length >= 4 && segments[3]
      ? `${seg2}/${segments[3]}`
      : null
    : seg2;
  return pkgName !== null && prodDeps.has(pkgName);
}

// Electron-Forge-Konfiguration: Vite-Build, Native-Module-Unpack für better-sqlite3,
// Fuses-Hardening (Cookie-Encryption, ASAR-Integrity).
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'TakumiDeck',
    appBundleId: 'dev.takumideck.app',
    // electron-packager waehlt die plattform-passende Endung (.ico fuer win32) —
    // deshalb wird der Pfad OHNE Extension angegeben. Brandiert das Exe-Icon.
    icon: './build/icon',
    // electron-updater liest <resourcesPath>/app-update.yml beim Download-Pfad
    // (AppUpdater.js getOrCreateDownloadHelper -> updaterCacheDirName; NsisUpdater
    // -> publisherName). Forge erzeugt die Datei NICHT (electron-builder-Konvention) —
    // wir packen sie deshalb explizit als extraResource. Pfad relativ zum Repo-Root.
    // icon.ico ist zusaetzlich als extraResource enthalten, damit der Main-Prozess
    // im gepackten Build das BrowserWindow-Icon ueber process.resourcesPath finden kann.
    extraResource: ['./build/app-update.yml', './build/icon.ico'],
    // Eigener Ignore-Filter ueberschreibt den Default des Vite-Plugins (der ALLES
    // ausser /.vite ausschliesst — siehe @electron-forge/plugin-vite VitePlugin.js
    // Z.124-131). Wir lassen /.vite + /package.json + node_modules-Eintraege durch,
    // **aber nur fuer Pakete in der prod-Dep-Closure** (siehe computeProdDepClosure
    // oben). Damit landen externalisierte Native-Module (better-sqlite3, @lydell/
    // node-pty) und ihre Transitiven sauber im Bundle, devDeps bleiben drausssen.
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (file === '/package.json') return false;
      if (file === '/node_modules') return false;
      if (file.startsWith('/node_modules/')) {
        return !isProdDepPath(file);
      }
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'TakumiDeck',
      // Setup.exe-Icon (im Windows-Explorer + waehrend der Installation sichtbar).
      setupIcon: './build/icon.ico',
    }),
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
