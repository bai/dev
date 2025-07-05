import path from "path";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    dir: "./",
    reporters: ["verbose"],
    globals: false,
    testTimeout: 50000,
    env: loadEnv("", process.cwd(), ""),
  },
});
