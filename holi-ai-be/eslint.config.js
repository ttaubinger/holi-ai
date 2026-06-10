const js = require("@eslint/js");
const globals = require("globals");
const importPlugin = require("eslint-plugin-import");

module.exports = [
  js.configs.recommended,
  {
    plugins: {
      import: importPlugin
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-console": "off",
      "no-useless-catch": "error",
      "max-lines-per-function": ["error", { "max": 15 }],
      "import/no-useless-path-segments": ["error", { "noUselessIndex": true }]
    }
  }
];
