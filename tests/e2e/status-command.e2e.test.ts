import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture, type E2eFixture } from "../support/e2e-test-harness";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForCommandLogEntry = async (fixture: E2eFixture, entry: string, timeoutMs = 7_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const commandLog = await readCommandLog(fixture);
    if (commandLog.includes(entry)) {
      return commandLog;
    }
    await sleep(100);
  }

  return readCommandLog(fixture);
};

describe("status command e2e", () => {
  it(
    "runs 'status' with all checks healthy",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["status"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("🔧 Development Tools:");
        expect(result.stdout).toContain("✅ git");
        expect(result.stdout).toContain("✅ mise");
        expect(result.stdout).toContain("✅ bun");
        expect(result.stdout).toContain("✅ fzf");
        expect(result.stdout).toContain("✅ gcloud");
        expect(result.stdout).toContain("⬆️ Last Upgraded:");
        expect(result.stdout.indexOf("⬆️ Last Upgraded:")).toBeGreaterThan(result.stdout.indexOf("🐳 Docker Services:"));
        expect(result.stdout).toContain("All green.");
      }),
    20_000,
  );

  it(
    "runs 'status' and exits non-zero when an essential tool is missing",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["status"], {
          envOverrides: {
            DEV_E2E_GCLOUD_MISSING: "1",
          },
        });
        expect(result.exitCode).toBe(3);
        expect(`${result.stdout}\n${result.stderr}`).toContain("gcloud");
      }),
    20_000,
  );

  it(
    "runs 'status' with docker unavailable and reports docker services as unavailable",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["status"], {
          envOverrides: {
            DEV_E2E_DOCKER_INFO_FAIL: "1",
          },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Docker not available");
      }),
    20_000,
  );

  it(
    "runs 'status' with outdated docker version and reports warning summary",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["status"], {
          envOverrides: {
            DEV_E2E_DOCKER_OLD_VERSION: "1",
          },
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("docker 28.0.0");
        expect(result.stdout).toContain("requires >=29.1.3");
      }),
    20_000,
  );

  it(
    "runs 'status' and starts background auto-upgrade when no recent upgrade run exists",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["status"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Starting automatic background upgrade");

        const commandLog = await waitForCommandLogEntry(fixture, "git pull");
        expect(commandLog).toContain("git pull");
      }),
    20_000,
  );

  it(
    "runs 'status' and skips background auto-upgrade when the last upgrade run is recent",
    async () =>
      withFixture(async (fixture) => {
        const upgradeResult = await runCli(fixture, ["upgrade"]);
        expect(upgradeResult.exitCode).toBe(0);

        const result = await runCli(fixture, ["status"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toContain("Starting automatic background upgrade");
      }),
    20_000,
  );
});
