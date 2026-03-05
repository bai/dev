import fs from "fs/promises";
import path from "path";

import { describe, expect, it } from "vitest";

import { readCommandLog, runCli, withFixture } from "../support/e2e-test-harness";

describe("clone command e2e", () => {
  it(
    "runs 'clone' and creates the destination repository path",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["clone", "acme/newrepo"]);
        expect(result.exitCode).toBe(0);

        const clonedPath = path.join(fixture.baseSearchPath, "github.com", "acme", "newrepo", ".git", "HEAD");
        const exists = await fs
          .access(clonedPath)
          .then(() => true)
          .catch(() => false);

        expect(exists).toBe(true);
      }),
    20_000,
  );

  it(
    "runs 'clone' with full URL and creates provider-specific path",
    async () =>
      withFixture(async (fixture) => {
        const result = await runCli(fixture, ["clone", "https://gitlab.com/acme/urlrepo.git"]);
        expect(result.exitCode).toBe(0);

        const clonedPath = path.join(fixture.baseSearchPath, "gitlab.com", "acme", "urlrepo", ".git", "HEAD");
        const exists = await fs
          .access(clonedPath)
          .then(() => true)
          .catch(() => false);

        expect(exists).toBe(true);
      }),
    20_000,
  );

  it(
    "runs 'clone' and skips cloning when destination already exists",
    async () =>
      withFixture(async (fixture) => {
        const existingRepoPath = path.join(fixture.baseSearchPath, "github.com", "acme", "already-there", ".git");
        await fs.mkdir(existingRepoPath, { recursive: true });
        await fs.writeFile(path.join(existingRepoPath, "HEAD"), "ref: refs/heads/main\n", "utf8");

        const result = await runCli(fixture, ["clone", "acme/already-there"]);
        expect(result.exitCode).toBe(0);

        const commandLog = await readCommandLog(fixture);
        expect(commandLog).not.toContain("git clone https://github.com/acme/already-there");
      }),
    20_000,
  );
});
