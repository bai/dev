import { describe, expect, it } from "vitest";

import { runCli, withFixture } from "../support/e2e-test-harness";

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
});
