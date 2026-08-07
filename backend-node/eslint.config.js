const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/generated/**"],
  },
  ...tseslint.configs.recommended,
);
