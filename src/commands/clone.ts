import fs from "fs";
import path from "path";

import { baseSearchDir } from "~/lib/constants";
import type { DevCommand } from "~/lib/core/command-types";
import { arg, getArg, hasOption, option, runCommand } from "~/lib/core/command-utils";
import { devConfig } from "~/lib/dev-config";
import { handleCdToPath } from "~/lib/handlers";

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

    try {
      const repoArg = getArg(context, "repo");
      const forceGitlab = hasOption(context, "gitlab");
      const forceGithub = hasOption(context, "github");

      if (forceGitlab && forceGithub) {
        throw new Error("Cannot specify both --gitlab and --github options");
      }

      // Parse clone parameters
      const cloneParams = parseCloneArguments(repoArg, forceGitlab, forceGithub);

      // Determine final repository URL and local path
      let repoUrl: string;
      let repoPath: string;

      if (isFullUrl(cloneParams.repoArg)) {
        // Handle full URL case
        const parsedPath = parseRepoUrlToPath(cloneParams.repoArg);
        if (!parsedPath) {
          throw new Error("Could not parse repository URL");
        }
        repoUrl = cloneParams.repoArg;
        repoPath = parsedPath;
      } else {
        // Handle shorthand format
        const org = cloneParams.explicitOrg || devConfig.defaultOrg;
        const provider = cloneParams.useGitLab ? "gitlab.com" : "github.com";
        repoPath = path.join(baseSearchDir, provider, org, cloneParams.repoArg);

        repoUrl = cloneParams.useGitLab
          ? `https://gitlab.com/${org}/${cloneParams.repoArg}`
          : `https://github.com/${org}/${cloneParams.repoArg}`;
      }

      logger.info("🚀 Cloning repository...");
      logger.info(`   Repository: ${repoUrl}`);
      logger.info(`   Local path: ${repoPath}`);

      await cloneRepository(repoUrl, repoPath, logger, context);
    } catch (error: any) {
      logger.error(`Clone command failed: ${error.message}`);
      throw error;
    }
  },
};

interface CloneParams {
  repoArg: string;
  useGitLab: boolean;
  explicitOrg?: string;
}

/**
 * Parses clone command arguments into structured parameters
 */
function parseCloneArguments(repoArg: string, forceGitlab: boolean, forceGithub: boolean): CloneParams {
  let useGitLab = forceGitlab;
  let explicitOrg: string | undefined;

  // Check if repo arg contains org/repo format
  if (repoArg.includes("/") && !isFullUrl(repoArg)) {
    const parts = repoArg.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      explicitOrg = parts[0];
      repoArg = parts[1];

      // Check if the org has a provider mapping (unless forced)
      if (!forceGitlab && !forceGithub && explicitOrg in devConfig.orgToProvider) {
        useGitLab = devConfig.orgToProvider[explicitOrg] === "gitlab";
      }
    }
  } else if (!forceGitlab && !forceGithub) {
    // Use default org's provider mapping
    useGitLab = devConfig.orgToProvider[devConfig.defaultOrg] === "gitlab";
  }

  return { repoArg, useGitLab, explicitOrg };
}

/**
 * Checks if a string is a full URL (HTTP/HTTPS/SSH)
 */
function isFullUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://") || str.includes("@");
}

/**
 * Parses repository URL to determine the local filesystem path.
 */
function parseRepoUrlToPath(repoUrl: string): string | null {
  try {
    let orgName = "";
    let repoName = "";

    // Handle SSH URL format (git@github.com:foo/repo.git)
    if (repoUrl.includes("@")) {
      const sshMatch = repoUrl.match(/@([^:]+):([^/]+)\/([^.]+)/);
      if (sshMatch && sshMatch[1] && sshMatch[2] && sshMatch[3]) {
        const domain = sshMatch[1]; // github.com
        orgName = sshMatch[2]; // foo
        repoName = sshMatch[3]; // repo
        return path.join(baseSearchDir, domain, orgName, repoName);
      } else {
        throw new Error(`Invalid SSH repository URL format: ${repoUrl}`);
      }
    }
    // Handle HTTPS URL format (https://github.com/foo/repo)
    else {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (pathParts.length >= 2) {
        const firstPart = pathParts[0];
        const secondPart = pathParts[1];

        if (firstPart && secondPart) {
          orgName = firstPart;
          // Remove .git suffix if present
          repoName = secondPart.replace(/\.git$/, "");
          return path.join(baseSearchDir, url.hostname, orgName, repoName);
        }
      }
      throw new Error(`URL path does not contain organization and repository: ${repoUrl}`);
    }
  } catch (error: any) {
    throw new Error(`Invalid repository URL: ${repoUrl} - ${error.message}`);
  }
}

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
      throw new Error(errorMessage);
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
    let errorMessage = error.message;
    if (error.message.includes("exit code 128")) {
      errorMessage += "\n💡 Repository might not exist or you may not have permission to access it.";
      errorMessage += "\n   - Check if the repository URL is correct";
      errorMessage += "\n   - Verify you have access to the repository";
      errorMessage += "\n   - Try authenticating with 'dev auth'";
    } else if (error.message.includes("exit code 130")) {
      errorMessage += "\n💡 Operation was interrupted by the user.";
    }

    throw new Error(errorMessage);
  }
}
