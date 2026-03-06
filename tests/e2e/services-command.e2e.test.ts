import fs from "fs/promises";
import path from "path";

import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture } from "../support/e2e-test-harness";

describe("services command e2e", () => {
  it(
    "runs 'services up' and invokes docker compose",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["services", "up"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("docker compose -f");
        expect(commandLog).toContain("up -d postgres17 valkey");
      }),
    20_000,
  );

  it(
    "runs 'services start' alias with a specific service",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["services", "start", "postgres17"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("up -d postgres17");
      }),
    20_000,
  );

  it(
    "runs 'services down' for a specific service",
    async () =>
      withFixture(async (fixture) => {
        const setupResult = await runCli(fixture, ["services", "up"]);
        expect(setupResult.exitCode).toBe(0);

        const result = await runCli(fixture, ["services", "down", "postgres17"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("stop postgres17");
      }),
    20_000,
  );

  it(
    "runs 'services stop' alias for a specific service",
    async () =>
      withFixture(async (fixture) => {
        const setupResult = await runCli(fixture, ["services", "up"]);
        expect(setupResult.exitCode).toBe(0);

        const result = await runCli(fixture, ["services", "stop", "postgres17"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("stop postgres17");
      }),
    20_000,
  );

  it(
    "runs 'services restart' for a specific service",
    async () =>
      withFixture(async (fixture) => {
        const setupResult = await runCli(fixture, ["services", "up"]);
        expect(setupResult.exitCode).toBe(0);

        const result = await runCli(fixture, ["services", "restart", "postgres17"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("restart postgres17");
      }),
    20_000,
  );

  it(
    "runs 'services logs' with follow and tail options",
    async () =>
      withFixture(async (fixture) => {
        const setupResult = await runCli(fixture, ["services", "up"]);
        expect(setupResult.exitCode).toBe(0);

        const result = await runCli(fixture, ["services", "logs", "valkey", "--follow", "--tail", "25"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("logs -f --tail 25 valkey");
      }),
    20_000,
  );

  it(
    "runs 'services reset' and removes compose file",
    async () =>
      withFixture(async (fixture) => {
        const setupResult = await runCli(fixture, ["services", "up"]);
        expect(setupResult.exitCode).toBe(0);

        const result = await runCli(fixture, ["services", "reset"]);
        expect(result.exitCode).toBe(0);

        const composePath = path.join(fixture.stateDir, "docker", "docker-compose.yml");
        const composeExists = await fs
          .access(composePath)
          .then(() => true)
          .catch(() => false);
        expect(composeExists).toBe(false);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).toContain("down -v");
      }),
    20_000,
  );

  it(
    "fails 'services up' when docker is unavailable",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["services", "up"], {
          envOverrides: {
            DEV_E2E_DOCKER_INFO_FAIL: "1",
          },
        });
        expect(result.exitCode).toBe(1);
        expect(`${result.stdout}\n${result.stderr}`).toContain("Docker is not available");
      }),
    20_000,
  );
});
