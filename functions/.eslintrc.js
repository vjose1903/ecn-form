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
    "prettier", // Debe ir al final para desactivar reglas conflictivas
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: [
    "@typescript-eslint",
    "import",
    "prettier", // Plugin de Prettier
  ],
  rules: {
    "prettier/prettier": "error", // Marca errores de Prettier como errores de ESLint
    quotes: "off", // Desactivado porque Prettier lo maneja
    indent: "off", // Desactivado porque Prettier lo maneja
    "max-len": "off", // Desactivado porque Prettier lo maneja
    "object-curly-spacing": "off", // Desactivado porque Prettier lo maneja
    "arrow-parens": "off", // Desactivado porque Prettier lo maneja
    "import/no-unresolved": 0,
    "require-jsdoc": "off", // Desactivado para simplificar
    "@typescript-eslint/no-explicit-any": "off", // Solo warning para any
  },
};
