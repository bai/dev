/**
 * @type {import('prettier').Config}
 */
const config = {
  endOfLine: "lf",
  bracketSpacing: true,
  bracketSameLine: false,
  singleQuote: false,
  jsxSingleQuote: false,
  trailingComma: "all",
  semi: true,
  printWidth: 120,
  arrowParens: "always",
  quoteProps: "consistent",
  importOrder: [
    "^server-only|client-only$",
    "",
    "^react-scan$",
    "",
    "^(react/(.*)$)|^(react-dom/(.*)$)|^(react$)",
    "",
    "^(next/(.*)$)|^(next$)",
    "",
    "<THIRD_PARTY_MODULES>",
    "",
    "^~/lib/(.*)$",
    "^~/lib/utils/(.*)$",
    "^~/hooks/(.*)$",
    "^~/components/(.*)$",
    "^~/(server|trpc)/(.*)$",
    "^~/(.*)$",
    "",
    "^[./]",
  ],
  importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
  importOrderTypeScriptVersion: "5.8.0",
  plugins: ["@ianvs/prettier-plugin-sort-imports", "prettier-plugin-multiline-arrays"],
};

export default config;
