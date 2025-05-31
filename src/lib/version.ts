import { devDir } from "~/lib/constants";

/**
 * Gets the current Git commit SHA for the dev directory.
 *
 * @returns The short (7-character) Git commit SHA, or "unknown" if unable to retrieve
 */
export const getCurrentGitCommitSha = (): string => {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--short=7", "HEAD"], {
      cwd: devDir,
    });

    if (result.success && result.stdout) {
      return result.stdout.toString().trim();
    }

    return "unknown";
  } catch (error) {
    return "unknown";
  }
};
