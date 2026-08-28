/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    // Relax rules that are too noisy for an existing codebase migration
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-unused-expressions": "warn",
    "@typescript-eslint/no-empty-object-type": "off",
    "react/prop-types": "off", // Using TypeScript for prop validation
    "react/no-unescaped-entities": "error",
    "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
    "no-case-declarations": "warn",
    // React Compiler rules — too strict for existing patterns (setState in
    // effects for initialization, inline components for simple wrappers).
    // Re-enable when migrating to React Compiler.
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
  ignorePatterns: [
    "dist/",
    "node_modules/",
    "convex/_generated/",
    "*.config.*",
    "postcss.config.*",
  ],
};
