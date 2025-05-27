import { baseSearchDir } from "~/lib/constants";

/**
 * Finds all directories at the third level within the base search directory.
 *
 * This function scans for directories at exactly 3 levels deep.
 * For example, if baseSearchDir is ~/src, it will find directories like:
 * - github.com/user/repo/
 * - gitlab.com/org/project/
 *
 * @returns An array of relative directory paths (e.g., ["github.com/user/repo", "gitlab.com/org/project"])
 */
export function findDirs(): string[] {
  const scanner = new Bun.Glob("*/*/*/");
  const matches = Array.from(scanner.scanSync({ cwd: baseSearchDir, onlyFiles: false }));

  return matches;
}
