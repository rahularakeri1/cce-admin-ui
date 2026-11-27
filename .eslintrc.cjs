module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: ["eslint:recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  rules: {
    "react-refresh/only-export-components": "warn",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    // TypeScript already reports undefined names (and knows DOM/React types such as RequestInit and React.ReactNode),
    // so core no-undef only produces false positives on .ts/.tsx files.
    "no-undef": "off",
    "no-unused-vars": "off",
  },
  ignorePatterns: ["dist", "node_modules"],
};
