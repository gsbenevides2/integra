import css from "@eslint/css";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import pluginReact from "eslint-plugin-react";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

const IMPORT_GROUPS = [
  // Side effect imports (e.g. `import "./styles.css"`).
  ["^\\u0000"],
  // Node.js builtins.
  ["^node:"],
  // Our own `@server`/`@public` path aliases.
  ["^@server(/|$)", "^@public(/|$)"],
  // Everything else from node_modules.
  ["^@?\\w"],
  // Relative imports.
  ["^\\."],
];

// .tsx/.jsx only: React always first, above every other import.
const REACT_FIRST_IMPORT_GROUPS = [
  ["^\\u0000"],
  ["^react$", "^react-dom(/|$)"],
  ["^node:"],
  ["^@server(/|$)", "^@public(/|$)"],
  ["^@?\\w"],
  ["^\\."],
];

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js, "simple-import-sort": simpleImportSort },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "simple-import-sort/imports": ["error", { groups: IMPORT_GROUPS }],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "simple-import-sort/imports": ["error", { groups: REACT_FIRST_IMPORT_GROUPS }],
    },
  },
  tseslint.configs.recommended,
  { ...pluginReact.configs.flat.recommended, files: ["**/*.{jsx,tsx}"] },
  {
    ...betterTailwindcss.configs.recommended,
    files: ["**/*.{jsx,tsx}"],
    settings: {
      "better-tailwindcss": {
        entryPoint: "public/styles/global.css",
      },
    },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
  },
  {
    // Tests mock third-party shapes and use underscore-prefixed unused args.
    files: ["test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/react-in-jsx-scope": "off",
      "react/display-name": "off",
      "better-tailwindcss/no-unknown-classes": "off",
    },
  },
  eslintConfigPrettier,
]);
