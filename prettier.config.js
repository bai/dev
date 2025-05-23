/**
 * @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions & import("@ianvs/prettier-plugin-sort-imports").PluginConfig}
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
  plugins: ["prettier-plugin-multiline-arrays"],
};

export default config;
