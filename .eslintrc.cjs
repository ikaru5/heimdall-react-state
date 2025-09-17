module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["react-hooks"],
  extends: ["eslint:recommended", "plugin:react-hooks/recommended", "prettier"],
  settings: {
    react: {
      version: "detect"
    }
  },
  overrides: [
    {
      files: ["test/**/*.js"],
      env: {
        node: true
      }
    }
  ],
  rules: {
    "no-console": "warn"
  }
};
