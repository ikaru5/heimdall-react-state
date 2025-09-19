import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

const baseLanguageOptions = {
  ecmaVersion: "latest",
  sourceType: "module",
  globals: {
    ...globals.browser,
    ...globals.node,
    ...globals.es2022,
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
};

const baseRules = {
  ...js.configs.recommended.rules,
  ...reactHooks.configs.recommended.rules,
  ...prettier.rules,
  "no-console": "warn",
};

export default [
  {
    ignores: ["node_modules", "coverage", "build", "dist"],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.cjs", "**/*.mjs"],
    languageOptions: baseLanguageOptions,
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: baseRules,
  },
  {
    files: ["test/**/*.js", "test/**/*.jsx", "test/**/*.cjs", "test/**/*.mjs"],
    languageOptions: {
      ...baseLanguageOptions,
      globals: {
        ...baseLanguageOptions.globals,
        ...globals.jest,
      },
    },
    rules: {
      ...baseRules,
      "no-unused-vars": "off",
    },
  },
];
