// Configuração ESLint base compartilhada por todos os pacotes TS do monorepo.
// apps/web e services/* estendem isto e adicionam apenas o que for específico
// do seu próprio ambiente (regras de React, regras de Node, etc.).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    ignores: ["dist/**", "build/**", "node_modules/**", "coverage/**"],
  },
);
