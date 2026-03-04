import path from "path";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["verbose"],
    globals: false,
    env: loadEnv("", process.cwd(), ""),
  },
});
