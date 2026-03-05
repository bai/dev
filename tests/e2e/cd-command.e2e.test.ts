import fs from "fs/promises";
import path from "path";

import { describe, expect, it } from "vitest";

import { readCdTargets, runCli, withFixture } from "../support/e2e-test-harness";

describe("cd command e2e", () => {
  it(
    "runs 'cd' and writes shell integration target",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["cd", "alpha"]);
        expect(result.exitCode).toBe(0);

        const expectedTarget = path.join(fixture.baseSearchPath, "github.com", "acme", "alpha");
        const targets = await readCdTargets(fixture);
        expect(targets).toContain(expectedTarget);
      }),
    20_000,
  );

  it(
    "runs 'cd' interactively and selects a directory",
    async () =>
      withFixture(
        async (fixture) => {
          const selectedDirectory = path.join(fixture.baseSearchPath, "github.com", "acme", "interactive-only");
          await fs.mkdir(selectedDirectory, { recursive: true });

          const result = await runCli(fixture, ["cd"]);
          expect(result.exitCode).toBe(0);

          const targets = await readCdTargets(fixture);
          expect(targets).toContain(selectedDirectory);
        },
        { seedDefaultRepositories: false },
      ),
    20_000,
  );

  it(
    "fails 'cd' for an unknown directory",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["cd", "does-not-exist"]);
        expect(result.exitCode).toBe(1);
        expect(`${result.stdout}\n${result.stderr}`).toContain("does-not-exist");
      }),
    20_000,
  );
});
