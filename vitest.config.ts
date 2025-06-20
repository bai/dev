import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    dir: "./",
    reporters: ["verbose"],
    globals: true,
    testTimeout: 50000,
    env: loadEnv("", process.cwd(), ""),
  },
});
