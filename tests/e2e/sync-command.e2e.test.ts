import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture } from "../support/e2e-test-harness";

describe("sync command e2e", () => {
  it(
    "runs 'sync' and attempts git pulls",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["sync"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Sync complete!");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("git pull");
      }),
    20_000,
  );

  it(
    "runs 'sync' and handles empty workspace repositories",
    async () =>
      withFixture(
        async (fixture) => {
          const result = await runCli(fixture, ["sync"]);
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain("No repositories found to sync.");
        },
        { seedDefaultRepositories: false },
      ),
    20_000,
  );

  it(
    "runs 'sync' and reports pull failures without crashing",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["sync"], {
          envOverrides: {
            DEV_E2E_GIT_PULL_FAIL: "1",
          },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Sync complete!");
        expect(result.stdout).toContain("Failed:");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("git pull");
      }),
    20_000,
  );
});
