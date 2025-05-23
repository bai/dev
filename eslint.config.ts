import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import { rules as eslintConfigPrettier } from "eslint-config-prettier";
import pluginOnlyWarn from "eslint-plugin-only-warn";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  {
    ignores: ["**/**/node_modules"],
  },

  {
    rules: eslintConfigPrettier,
  },

  {
    plugins: {
      onlyWarn: pluginOnlyWarn,
    },
  },

  {
    plugins: {
      "unused-imports": pluginUnusedImports,
    },
  },

  {
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        projectService: true,
        ecmaVersion: "latest",
        sourceType: "module",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
    },
  },
);
