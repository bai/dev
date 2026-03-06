import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture } from "../support/e2e-test-harness";

describe("up command e2e", () => {
  it(
    "runs 'up' and executes mise install",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["up"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Development environment setup complete");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("mise install");
      }),
    20_000,
  );

  it(
    "runs 'up' and installs mise when it is missing",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["up"], {
          envOverrides: {
            DEV_E2E_MISE_MISSING: "1",
          },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Mise installed successfully");

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("sh -c curl -sSfL https://mise.run | sh");
        expect(commandLog).toContain("mise install");
      }),
    20_000,
  );

  it(
    "fails 'up' when mise install tools fails",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["up"], {
          envOverrides: {
            DEV_E2E_MISE_INSTALL_FAIL: "1",
          },
        });

        expect(result.exitCode).toBe(1);
        expect(`${result.stdout}\n${result.stderr}`).toContain("Failed to install tools");
      }),
    20_000,
  );
});
