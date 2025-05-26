import fs from "fs";
import path from "path";

import { spawnSync } from "bun";

import { baseSearchDir } from "~/lib/constants";
import { devConfig } from "~/lib/dev-config";
import { handleCdToPath, handleCommandError } from "~/lib/handlers";

/**
 * Handles the clone command implementation.
 *
 * @param args Command arguments (excluding the 'clone' part)
 */
export function handleCloneCommand(args: string[]): void {
  if (args.length === 0) {
    console.error("❌ Error: Repository argument is required for 'clone' command.");
    console.error("\n💡 Usage examples:");
    console.error("   dev clone myrepo");
    console.error("   dev clone org/myrepo");
    console.error("   dev clone https://github.com/org/myrepo");
    console.error("   dev clone --gitlab myrepo");
    process.exit(1);
  }

  // Parse arguments and determine clone parameters
  const cloneParams = parseCloneArguments(args);

  // Validate repository URL/name
  if (!cloneParams.repoArg) {
    console.error("❌ Error: Invalid repository specification.");
    process.exit(1);
  }

  // Determine final repository URL and local path
  let repoUrl: string;
  let repoPath: string;

  if (isFullUrl(cloneParams.repoArg)) {
    // Handle full URL case
    const parsedPath = parseRepoUrlToPath(cloneParams.repoArg);
    if (!parsedPath) {
      console.error("❌ Error: Could not parse repository URL.");
      process.exit(1);
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

  console.log(`🚀 Cloning repository...`);
  console.log(`   Repository: ${repoUrl}`);
  console.log(`   Local path: ${repoPath}`);

  cloneRepository(repoUrl, repoPath);
}

interface CloneParams {
  repoArg: string;
  useGitLab: boolean;
  explicitOrg?: string;
}

/**
 * Parses clone command arguments into structured parameters
 */
function parseCloneArguments(args: string[]): CloneParams {
  let useGitLab = false;
  let repoArg = "";
  let explicitOrg: string | undefined;

  if (args.length === 1) {
    repoArg = args[0]!;

    // Check if repo arg contains org/repo format
    if (repoArg.includes("/") && !isFullUrl(repoArg)) {
      const parts = repoArg.split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        explicitOrg = parts[0];
        repoArg = parts[1];

        // Check if the org has a provider mapping
        if (explicitOrg in devConfig.orgToProvider) {
          useGitLab = devConfig.orgToProvider[explicitOrg] === "gitlab";
        }
      }
    } else {
      // Use default org's provider mapping
      useGitLab = devConfig.orgToProvider[devConfig.defaultOrg] === "gitlab";
    }
  } else if (args.length === 2 && (args[0] === "--github" || args[0] === "--gitlab")) {
    useGitLab = args[0] === "--gitlab";
    repoArg = args[1]!;
  } else {
    console.error("❌ Error: Invalid arguments for 'clone' command.");
    console.error("Usage: dev clone [--github|--gitlab] <repository>");
    console.error("       dev clone <organization/repository>");
    process.exit(1);
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
 *
 * @param repoUrl The repository URL (HTTPS or SSH format)
 * @returns The local filesystem path or null if parsing failed
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
      try {
        // Try to extract the path from URL
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
      } catch (urlError) {
        throw new Error(`Invalid repository URL: ${repoUrl}`);
      }
    }
  } catch (error: any) {
    console.error(`❌ Error parsing repository URL: ${error.message}`);
  }

  return null;
}

/**
 * Clones a repository to the specified path.
 *
 * @param repoUrl The repository URL to clone from
 * @param targetPath The local path to clone to
 */
function cloneRepository(repoUrl: string, targetPath: string): void {
  // Check if directory already exists
  if (fs.existsSync(targetPath)) {
    console.log(`📁 Directory already exists: ${targetPath}`);
    console.log(`🚀 Navigating to existing directory...`);
    handleCdToPath(targetPath);
    return;
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    try {
      console.log(`📁 Creating parent directory: ${parentDir}`);
      fs.mkdirSync(parentDir, { recursive: true });
    } catch (error: any) {
      console.error(`❌ Error creating directory ${parentDir}: ${error.message}`);
      if (error.code === "EACCES") {
        console.error("💡 Permission denied. Try running with sudo or check directory permissions.");
      } else if (error.code === "ENOSPC") {
        console.error("💡 No space left on device. Free up some disk space and try again.");
      }
      process.exit(1);
    }
  }

  // Clone the repository
  try {
    console.log(`📥 Cloning ${repoUrl}...`);

    const proc = spawnSync(["git", "clone", repoUrl, targetPath], {
      stdio: ["ignore", "inherit", "inherit"], // Inherit stdout and stderr to show progress
    });

    if (proc.exitCode !== 0) {
      let errorMessage = `❌ Error cloning repository: git exited with code ${proc.exitCode}`;

      // Add more context for common git errors
      if (proc.exitCode === 128) {
        errorMessage += "\n💡 Repository might not exist or you may not have permission to access it.";
        errorMessage += "\n   - Check if the repository URL is correct";
        errorMessage += "\n   - Verify you have access to the repository";
        errorMessage += "\n   - Try authenticating with 'dev auth'";
      } else if (proc.exitCode === 130) {
        errorMessage += "\n💡 Operation was interrupted by the user.";
      }

      console.error(errorMessage);

      // Clean up partial clone if it exists
      if (fs.existsSync(targetPath)) {
        try {
          fs.rmSync(targetPath, { recursive: true, force: true });
          console.log("🧹 Cleaned up partial clone.");
        } catch (cleanupError) {
          console.warn("⚠️  Could not clean up partial clone directory.");
        }
      }

      process.exit(proc.exitCode || 1);
    }

    console.log(`✅ Successfully cloned ${repoUrl} to ${targetPath}`);
    console.log(`🚀 Navigating to ${path.basename(targetPath)}...`);
    console.log(`💡 To open in your editor, run: dev open ${path.basename(targetPath)}`);

    handleCdToPath(targetPath);
  } catch (error: any) {
    handleCommandError(error, "git clone", "git", "repository cloning");
  }
}
