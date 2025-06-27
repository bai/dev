import fs from "fs";
import path from "path";

import type { DevCommand } from "~/lib/core/command-types";
import { arg, getArg, hasOption, option, runCommand } from "~/lib/core/command-utils";
import { devConfig } from "~/lib/dev-config";
import { ExternalToolError, FileSystemError, UserInputError } from "~/lib/errors";
import { expandToFullGitUrl, parseRepoUrlToPath } from "~/lib/get-repo-url";
import { handleCdToPath } from "~/lib/handle-cd-to-path";

export const cloneCommand: DevCommand = {
  name: "clone",
  description: "Clones a repository into ~/src with automatic provider detection",
  help: `
The clone command clones repositories with smart provider detection:

Repository Formats:
  myrepo                  # Uses default org and provider
  org/myrepo              # Uses specified org, auto-detects provider
  https://github.com/org/myrepo  # Full URL
  git@github.com:org/myrepo.git  # SSH URL

Provider Options:
  --gitlab                # Force GitLab as provider
  --github                # Force GitHub as provider

Examples:
  dev clone myproject                    # Clone using default org
  dev clone myorg/myproject              # Clone from specific org
  dev clone --gitlab myproject           # Force GitLab provider
  dev clone https://github.com/org/repo  # Clone from full URL
  `,

  arguments: [
    arg("repo", "Repository to clone (name, org/repo, or full URL)", { required: true }),
  ],

  options: [
    option("--gitlab", "Use GitLab as the provider"),
    option("--github", "Use GitHub as the provider"),
  ],

  async exec(context) {
    const { logger } = context;

    const repoArg = getArg(context, "repo");
    const forceGitlab = hasOption(context, "gitlab");
    const forceGithub = hasOption(context, "github");

    if (forceGitlab && forceGithub) {
      throw new UserInputError("Cannot specify both --gitlab and --github options", {
        command: "clone",
        extra: { forceGitlab, forceGithub },
      });
    }

    // Convert to forced provider format for expandToFullGitUrl
    let forceProvider: "github" | "gitlab" | undefined;
    if (forceGitlab) {
      forceProvider = "gitlab";
    } else if (forceGithub) {
      forceProvider = "github";
    }

    // Expand shorthand to full URL
    const repoUrl = expandToFullGitUrl(repoArg, devConfig.defaultOrg, devConfig.orgToProvider, forceProvider);

    // Parse URL to get local path
    const repoPath = parseRepoUrlToPath(repoUrl);
    if (!repoPath) {
      throw new UserInputError("Could not determine local path for repository", {
        command: "clone",
        extra: { repoArg, repoUrl },
      });
    }

    logger.info("🚀 Cloning repository...");
    logger.info(`   Repository: ${repoUrl}`);
    logger.info(`   Local path: ${repoPath}`);

    await cloneRepository(repoUrl, repoPath, logger, context);
  },
};

/**
 * Clones a repository to the specified path.
 */
async function cloneRepository(repoUrl: string, targetPath: string, logger: any, context: any): Promise<void> {
  // Check if directory already exists
  if (fs.existsSync(targetPath)) {
    logger.info(`📁 Directory already exists: ${targetPath}`);
    logger.info(`🚀 Navigating to existing directory...`);
    handleCdToPath(targetPath);
    return;
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    try {
      logger.info(`📁 Creating parent directory: ${parentDir}`);
      fs.mkdirSync(parentDir, { recursive: true });
    } catch (error: any) {
      let errorMessage = `Error creating directory ${parentDir}: ${error.message}`;
      if (error.code === "EACCES") {
        errorMessage += "\n💡 Permission denied. Try running with sudo or check directory permissions.";
      } else if (error.code === "ENOSPC") {
        errorMessage += "\n💡 No space left on device. Free up some disk space and try again.";
      }
      throw new FileSystemError(errorMessage, {
        command: "clone",
        extra: { targetPath, parentDir, errorCode: error.code },
      });
    }
  }

  // Clone the repository
  try {
    logger.info(`📥 Cloning ${repoUrl}...`);

    await runCommand(["git", "clone", repoUrl, targetPath], context, { inherit: true });

    logger.success(`✅ Successfully cloned ${repoUrl} to ${targetPath}`);
    logger.info(`🚀 Navigating to ${path.basename(targetPath)}...`);
    logger.info(`💡 To open in your editor, run: dev open ${path.basename(targetPath)}`);

    handleCdToPath(targetPath);
  } catch (error: any) {
    // Clean up partial clone if it exists
    if (fs.existsSync(targetPath)) {
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        logger.info("🧹 Cleaned up partial clone.");
      } catch (cleanupError) {
        logger.warn("⚠️  Could not clean up partial clone directory.");
      }
    }

    // Add more context for common git errors
    if (error.message.includes("exit code 128")) {
      throw new ExternalToolError(
        `Repository clone failed: Repository might not exist or you may not have permission to access it.\n` +
          `💡 Troubleshooting:\n` +
          `   - Check if the repository URL is correct\n` +
          `   - Verify you have access to the repository\n` +
          `   - Try authenticating with 'dev auth'`,
        {
          command: "clone",
          extra: { repoUrl, targetPath, tool: "git", exitCode: 128 },
        },
      );
    } else if (error.message.includes("exit code 130")) {
      throw new ExternalToolError("Operation was interrupted by the user.", {
        command: "clone",
        extra: { repoUrl, targetPath, tool: "git", exitCode: 130 },
      });
    }

    // Re-throw other errors as-is if they're already CLI errors, otherwise wrap them
    throw error;
  }
}
