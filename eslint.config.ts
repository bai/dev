import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import { rules as eslintConfigPrettier } from "eslint-config-prettier";
import pluginImport from "eslint-plugin-import";
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
    rules: {
      "no-process-exit": ["error"],
    },
  },
  {
    files: ["src/index.ts"],
    rules: {
      "no-process-exit": "off", // Allow only in main entry point
    },
  },

  {
    rules: eslintConfigPrettier,
  },

  {
    plugins: {
      "unused-imports": pluginUnusedImports,
      "import": pluginImport,
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
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
  },

  {
    rules: {
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "warn",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
    },
  },

  // Hexagonal Architecture Import Restrictions
  // - Domain: Can only import from Effect and other domain modules
  // - App: Can import from Domain and Effect (NOT from Infra or CLI)
  // - Infra: Can import from Domain, Effect, and external libs (NOT from App or CLI)
  // - Root (index.ts, wiring.ts): Can import from any layer (composition root)
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/domain",
              from: ["./src/app", "./src/infra", "./src/index.ts"],
              message: "Domain layer must not import from App, Infra, or CLI layers",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.ts"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/app",
              from: ["./src/infra", "./src/index.ts"],
              message: "App layer must not import from Infra or CLI layers",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/infra/**/*.ts"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/infra",
              from: ["./src/app", "./src/index.ts"],
              message: "Infra layer must not import from App or CLI layers",
            },
          ],
        },
      ],
    },
  },
);
