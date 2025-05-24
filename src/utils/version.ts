import { execSync } from "child_process";
import path from "path";
import { homeDir } from "~/utils/constants";

export const getCurrentGitCommitSha = (): string => {
  try {
    const devDir = path.join(homeDir, ".dev");
    const sha = execSync("git rev-parse --short=7 HEAD", {
      cwd: devDir,
      encoding: "utf-8",
    }).trim();
    return sha;
  } catch (error) {
    return "unknown";
  }
};
