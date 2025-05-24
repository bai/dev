import { execSync } from "child_process";
import { devDir } from "~/utils/constants";

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
