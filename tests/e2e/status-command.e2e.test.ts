import { describe, expect, it } from "vitest";

import { runCli, withFixture } from "../support/e2e-test-harness";

describe("status command e2e", () => {
  it(
    "runs 'status' with all checks healthy",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["status"]);
        expect(result.exitCode).toBe(0);
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
});
