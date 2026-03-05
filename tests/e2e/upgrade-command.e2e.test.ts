import fs from "fs/promises";
import path from "path";

import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture } from "../support/e2e-test-harness";

describe("upgrade command e2e", () => {
  it(
    "runs 'upgrade' and completes full upgrade workflow",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["upgrade"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Upgrade completed successfully");

        const miseConfigPath = path.join(fixture.homeDir, ".config", "mise", "config.toml");
        const miseConfigExists = await fs
          .access(miseConfigPath)
          .then(() => true)
          .catch(() => false);

        expect(miseConfigExists).toBe(true);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("git pull");
        expect(commandLog).toContain("bun install");
        expect(commandLog).toContain("mise version --json");
      }),
    20_000,
  );

  it(
    "runs 'upgrade' and rewrites local config URL when it drifts",
    async () =>
      withFixture(async (fixture) => {
        const localConfigPath = path.join(fixture.configHome, "dev", "config.json");
        const localConfigContent = await fs.readFile(localConfigPath, "utf8");
        const localConfig = JSON.parse(localConfigContent) as Record<string, unknown>;
        const driftedConfig = { ...localConfig, configUrl: "https://example.com/stale-config.json" };
        await fs.writeFile(localConfigPath, JSON.stringify(driftedConfig, null, 2), "utf8");

        const result = await runCli(fixture, ["upgrade"]);
        expect(result.exitCode).toBe(0);

        const rewrittenConfigContent = await fs.readFile(localConfigPath, "utf8");
        const rewrittenConfig = JSON.parse(rewrittenConfigContent) as Record<string, unknown>;
        expect(rewrittenConfig["configUrl"]).toBe("http://127.0.0.1:1/config.json");
      }),
    20_000,
  );
});
