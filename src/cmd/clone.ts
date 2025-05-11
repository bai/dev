import { spawnSync } from "bun";
import {
  baseSearchDir,
  handleCommandError,
  defaultOrg,
  defaultGitHubUrl,
  defaultGitLabUrl,
  orgToProvider,
  stdioInherit,
  type GitProvider,
} from "~/utils";
import path from "path";
import fs from "fs";

/**
 * Handles the clone command implementation.
 *
 * @param args Command arguments (excluding the 'clone' part)
 */
export function handleCloneCommand(args: string[]): void {
  if (args.length === 0) {
    console.error(
      "Error: Repository argument is required for 'clone' command."
    );
    process.exit(1);
  } else if (
    args.length === 1 ||
    (args.length === 2 && (args[0] === "--github" || args[0] === "--gitlab"))
  ) {
    // Determine if we're using explicit provider flag
    let useGitLab = false;
    let repoArg = "";

    if (args.length === 2 && args[1]) {
      useGitLab = args[0] === "--gitlab";
      repoArg = args[1];
    } else if (args.length === 1 && args[0]) {
      repoArg = args[0];
    } else {
      console.error(
        "Error: Repository argument is required for 'clone' command."
      );
      process.exit(1);
    }

    let explicitOrg: string | null = null;

    // Check if repo arg contains org/repo format
    if (
      repoArg.includes("/") &&
      !repoArg.startsWith("http") &&
      !repoArg.includes("@")
    ) {
      const parts = repoArg.split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        explicitOrg = parts[0];
        repoArg = parts[1];

        // Check if the org has a provider mapping
        if (explicitOrg && explicitOrg in orgToProvider) {
          useGitLab = orgToProvider[explicitOrg] === "gitlab";
        }
      }
    } else if (args.length === 1) {
      // Use default org's provider mapping
      useGitLab = orgToProvider[defaultOrg] === "gitlab";
    }

    // Check if the argument is a full URL
    if (
      repoArg.startsWith("http://") ||
      repoArg.startsWith("https://") ||
      repoArg.includes("@")
    ) {
      // Handle full URL case
      const repoPath = parseRepoUrlToPath(repoArg);
      if (repoPath) {
        cloneRepository(repoArg, repoPath);
      }
    } else {
      // Handle shorthand format
      const org = explicitOrg || defaultOrg;
      const provider = useGitLab ? "gitlab.com" : "github.com";
      const repoPath = path.join(baseSearchDir, provider, org, repoArg);

      const repoUrl = useGitLab
        ? `https://gitlab.com/${org}/${repoArg}`
        : `https://github.com/${org}/${repoArg}`;

      cloneRepository(repoUrl, repoPath);
    }
  } else if (args.length === 3 && (args[0] === "--org" || args[0] === "-o")) {
    // Handle --org flag
    const customOrg = args[1];
    const repoArg = args[2];

    if (!customOrg || !repoArg) {
      console.error(
        "Error: Organization and repository are required with --org flag."
      );
      process.exit(1);
    }

    // Check if the org has a provider mapping
    const useGitLab =
      customOrg in orgToProvider
        ? orgToProvider[customOrg] === "gitlab"
        : orgToProvider[defaultOrg] === "gitlab";
    const provider = useGitLab ? "gitlab.com" : "github.com";

    if (
      repoArg.startsWith("http://") ||
      repoArg.startsWith("https://") ||
      repoArg.includes("@")
    ) {
      // Handle full URL case
      const repoPath = parseRepoUrlToPath(repoArg);
      if (repoPath) {
        cloneRepository(repoArg, repoPath);
      }
    } else {
      // Handle shorthand format with custom org
      const repoPath = path.join(baseSearchDir, provider, customOrg, repoArg);
      const repoUrl = useGitLab
        ? `https://gitlab.com/${customOrg}/${repoArg}`
        : `https://github.com/${customOrg}/${repoArg}`;

      cloneRepository(repoUrl, repoPath);
    }
  } else {
    console.error("Error: Invalid arguments for 'clone' command.");
    console.error("Usage: dev clone [--github|--gitlab] <repository>");
    console.error("       dev clone [--org|-o] <organization> <repository>");
    console.error("       dev clone <organization/repository>");
    process.exit(1);
  }
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
      const sshMatch = repoUrl.match(/@([^:]+):([^\/]+)\/([^.]+)/);
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
        throw new Error(
          `URL path does not contain organization and repository: ${repoUrl}`
        );
      } catch (urlError) {
        throw new Error(`Invalid repository URL: ${repoUrl}`);
      }
    }
  } catch (error: any) {
    console.error(`Error parsing repository URL: ${error.message}`);
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
    console.error(`Error: Directory already exists: ${targetPath}`);
    console.error(
      `To continue with an existing directory, cd into it with: dev cd ${path.basename(
        targetPath
      )}`
    );
    process.exit(1);
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    try {
      console.log(`Creating parent directory: ${parentDir}`);
      fs.mkdirSync(parentDir, { recursive: true });
    } catch (error: any) {
      console.error(`Error creating directory ${parentDir}: ${error.message}`);
      if (error.code === "EACCES") {
        console.error(
          "Permission denied. Try running with sudo or check directory permissions."
        );
      } else if (error.code === "ENOSPC") {
        console.error(
          "No space left on device. Free up some disk space and try again."
        );
      }
      process.exit(1);
    }
  }

  // Clone the repository
  try {
    console.log(`Cloning ${repoUrl} into ${targetPath}...`);

    const proc = spawnSync(["git", "clone", repoUrl, targetPath], {
      stdio: stdioInherit, // Inherit all IO to show progress
    });

    if (proc.exitCode !== 0) {
      let errorMessage = `Error cloning repository: git exited with code ${proc.exitCode}`;

      // Add more context for common git errors
      if (proc.exitCode === 128) {
        errorMessage +=
          "\nRepository might not exist or you may not have permission to access it.";
      } else if (proc.exitCode === 130) {
        errorMessage += "\nOperation was interrupted by the user.";
      }

      console.error(errorMessage);
      process.exit(proc.exitCode || 1);
    }

    console.log(`Successfully cloned ${repoUrl} to ${targetPath}`);
    console.log(
      `To navigate to this directory, run: dev cd ${path.basename(targetPath)}`
    );
  } catch (error: any) {
    handleCommandError(error, "git clone", "git");
  }
}
