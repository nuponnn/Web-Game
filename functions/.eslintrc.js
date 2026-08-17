module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
    "/scripts/**/*", // Ignore one-off tools (เช่น migrateLocations.js).
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
    // ผ่อนสำหรับ dev เกม ไม่ใช่ library
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "max-len": ["error", { "code": 120 }],
    "object-curly-spacing": ["error", "always"], // ให้ตรงกับสไตล์ { a, b } ที่เขียนอยู่แล้ว
  },
};
