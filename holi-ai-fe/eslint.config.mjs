import sonarjs from "eslint-plugin-sonarjs";
import react from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "next-env.d.ts",
      "next.config.mjs",
      "eslint.config.mjs"
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ...sonarjs.configs.recommended,
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ...react.configs.flat.recommended,
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        jsxPragma: undefined,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      ...tsPlugin.configs["stylistic"].rules,
      "sonarjs/pseudo-random": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "sonarjs/no-ignored-exceptions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "sonarjs/cognitive-complexity": "off",
      "no-negated-condition": "error",

      "@typescript-eslint/no-deprecated": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      "react/jsx-no-constructed-context-values": "error",
      "react/prefer-read-only-props": "error",
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      "sonarjs/no-clear-text-protocols": "off",
      "react/prop-types": "off",
    }
  }
];