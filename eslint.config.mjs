// ESLint v9 Flat-Config für TakumiDeck.
// Drei Scopes: Main/Preload (Node), Renderer (Browser + React), Shared (beides).
// Pflicht-Tools-Pass aus docs/code-review/REVIEW_PLAN.md.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  // Ignorierte Pfade — Build-Output, Reports, generierte Files
  {
    ignores: [
      ".vite/**",
      "out/**",
      "dist/**",
      "node_modules/**",
      ".fallow-reports/**",
      "**/*.d.ts",
    ],
  },

  // Basis für alle TS/TSX-Dateien
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: {
        // Type-aware Linting via projectService (TS-ESLint v8+): aktiviert
        // no-floating-promises / no-misused-promises / await-thenable.
        // allowDefaultProject: Build-Configs sind in tsconfig.node.json,
        // werden vom projectService sonst nicht gefunden.
        projectService: {
          allowDefaultProject: [
            "forge.config.ts",
            "vite.*.config.ts",
            "vitest.config.ts",
            "*.config.mjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused-Vars: erlaubt _-Prefix als „bewusst ignoriert"
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // any erlauben, aber als Warnung — Type-Schulden sichtbar machen
      "@typescript-eslint/no-explicit-any": "warn",
      // Empty-Object-Type als Warnung — Pre-Commit (--max-warnings=0) erzwingt Fix.
      "@typescript-eslint/no-empty-object-type": "warn",
      // Type-aware: nicht-awaited Promises sind in Electron-IPC-Handlern fast immer Bugs.
      "@typescript-eslint/no-floating-promises": "error",
      // checksVoidReturn.attributes: false — React-onClick={async ...} ist idiomatic.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
    },
  },

  // Build-Configs (Top-Level): Node-Globals für __dirname/process etc.
  {
    files: ["forge.config.ts", "vite.*.config.ts", "vitest.config.ts", "*.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Renderer: React + react-hooks (Pflicht-Plugin laut Memory-Regeln)
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      // Wir nutzen TS für Prop-Validierung, nicht prop-types
      "react/prop-types": "off",
    },
  },

  // Main + Preload: Node-Globals
  {
    files: ["src/main/**/*.ts", "src/preload/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Shared: beide Welten (läuft sowohl im Main- als auch im Renderer-Bundle)
  {
    files: ["src/shared/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
