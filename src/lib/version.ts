import { execSync } from "child_process";

import { devDir } from "~/lib/constants";

/**
 * Gets the current Git commit SHA for the dev directory.
 *
 * @returns The short (7-character) Git commit SHA, or "unknown" if unable to retrieve
 */
export const getCurrentGitCommitSha = (): string => {
  try {
    const sha = execSync("git rev-parse --short=7 HEAD", {
      cwd: devDir,
      encoding: "utf-8",
    }).trim();
    return sha;
  } catch (error) {
    return "unknown";
  }
};
