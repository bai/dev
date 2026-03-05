import fs from "fs/promises";
import path from "path";

import { describe, expect, it } from "vitest";

import { runCli, withFixture } from "../support/e2e-test-harness";

describe("dev command e2e", () => {
  it(
    "shows main help output for --help",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["--help"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("USAGE");
        expect(result.stdout).toContain("dev <command> [options]");
      }),
    20_000,
  );

  it(
    "shows command-specific help for known commands",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["clone", "--help"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("dev clone <repo>");
      }),
    20_000,
  );

  it(
    "falls back to main help for unknown command help requests",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["unknown-command", "--help"]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("COMMANDS");
        expect(result.stdout).toContain("Use 'dev <command> --help'");
      }),
    20_000,
  );

  it(
    "bootstraps local configuration when config file is missing",
    async () =>
      withFixture(
        async (fixture) => {
          const result = await runCli(fixture, ["--help"]);
          expect(result.exitCode).toBe(0);

          const configPath = path.join(fixture.configHome, "dev", "config.json");
          const configExists = await fs
            .access(configPath)
            .then(() => true)
            .catch(() => false);

          expect(configExists).toBe(true);
        },
        { includeLocalConfig: false },
      ),
    20_000,
  );
});
