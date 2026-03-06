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

        const miseConfigPath = path.join(fixture.toolConfigHome, "mise", "config.toml");
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
        const localConfigPath = fixture.configPath;
        const localConfigContent = await fs.readFile(localConfigPath, "utf8");
        const localConfig = JSON.parse(localConfigContent) as Record<string, unknown>;
        const driftedConfig = { ...localConfig, configUrl: "https://example.com/stale-config.json" };
        await fs.writeFile(localConfigPath, JSON.stringify(driftedConfig, null, 2), "utf8");

        const result = await runCli(fixture, ["upgrade"]);
        expect(result.exitCode).toBe(0);

        const rewrittenConfigContent = await fs.readFile(localConfigPath, "utf8");
        const rewrittenConfig = JSON.parse(rewrittenConfigContent) as Record<string, unknown>;
        expect(rewrittenConfig["configUrl"]).toBe("https://config.example.invalid/dev/config.json");
      }),
    20_000,
  );

  it(
    "runs 'upgrade' and continues when git pull fails during self-update",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["upgrade"], {
          envOverrides: {
            DEV_E2E_GIT_PULL_FAIL: "1",
          },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Upgrade completed successfully");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("git pull");
        expect(commandLog).toContain("bun install");
        expect(commandLog).toContain("mise version --json");
      }),
    20_000,
  );

  it(
    "fails 'upgrade' when remote config is invalid and preserves local config",
    async () =>
      withFixture(async (fixture) => {
        const invalidRemoteConfigUrl = "data:application/json,%7B%22defaultOrg%22%3A";
        const projectConfigPath = path.join(fixture.installDir, "config.json");
        const localConfigPath = fixture.configPath;
        const projectConfig = JSON.parse(await fs.readFile(projectConfigPath, "utf8")) as Record<string, unknown>;
        await fs.writeFile(projectConfigPath, JSON.stringify({ ...projectConfig, configUrl: invalidRemoteConfigUrl }, null, 2), "utf8");

        const localConfigContent = await fs.readFile(localConfigPath, "utf8");
        const localConfig = JSON.parse(localConfigContent) as Record<string, unknown>;
        await fs.writeFile(localConfigPath, JSON.stringify({ ...localConfig, configUrl: invalidRemoteConfigUrl }, null, 2), "utf8");
        const baselineLocalConfig = await fs.readFile(localConfigPath, "utf8");

        const result = await runCli(fixture, ["upgrade"]);
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toContain("Upgrade completed successfully");
        expect(result.stdout).not.toContain("Configuration refreshed successfully");

        const finalLocalConfig = await fs.readFile(localConfigPath, "utf8");
        expect(finalLocalConfig).toBe(baselineLocalConfig);
      }),
    20_000,
  );
});
