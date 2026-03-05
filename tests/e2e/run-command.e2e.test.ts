import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture } from "../support/e2e-test-harness";

describe("run command e2e", () => {
  it(
    "runs 'run' with task arguments",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["run", "build", "prod"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Task 'build prod' completed successfully");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("mise run build prod");
      }),
    20_000,
  );

  it(
    "runs 'run' without task and lists available tasks",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["run"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Available tasks:");
        expect(result.stdout).toContain("build");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("mise tasks --list");
      }),
    20_000,
  );

  it(
    "runs 'run' without task and handles empty task list",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["run"], {
          envOverrides: {
            DEV_E2E_MISE_NO_TASKS: "1",
          },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("No tasks found in current directory");
      }),
    20_000,
  );

  it(
    "fails 'run' when the task command fails",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["run", "build"], {
          envOverrides: {
            DEV_E2E_MISE_RUN_FAIL: "1",
          },
        });
        expect(result.exitCode).toBe(9);
        expect(`${result.stdout}\n${result.stderr}`).toContain("Task 'build' failed");
      }),
    20_000,
  );
});
