const config = {
  collectCoverageFrom: ["src/**/*.js", "!src/types.js"],
  coveragePathIgnorePatterns: ["/node_modules/"],
  coverageReporters: ["text", "lcov", "clover", "json-summary"],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coverageProvider: "v8",
  extensionsToTreatAsEsm: [".jsx"],
  setupFilesAfterEnv: ["<rootDir>/test/setupTests.js"],
  testEnvironment: "jsdom",
  testMatch: ["**/test/**/*.test.[jt]s?(x)"],
  transform: {
    "^.+\\.[jt]sx?$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2021",
          parser: {
            syntax: "ecmascript",
            jsx: true,
            dynamicImport: true,
          },
          transform: {
            react: {
              runtime: "automatic",
            },
          },
        },
        module: {
          type: "es6",
        },
      },
    ],
  },
};

module.exports = config;
