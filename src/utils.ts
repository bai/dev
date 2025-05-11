import os from "os";
import path from "path";
import { SpawnSyncOptions } from "bun";

// Provider type
export type GitProvider = 'github' | 'gitlab';

// Common variables
export const homeDir = os.homedir();
export const baseSearchDir = path.join(homeDir, "src");
export const defaultOrg = "flywheelsoftware";

// Organization to provider mapping
export const orgToProvider: Record<string, GitProvider> = {
  "flywheelsoftware": "gitlab",
  // Add more mappings as needed, e.g.:
  // "otherorg": "github",
};

export const defaultGitHubUrl = `https://github.com/${defaultOrg}`;
export const defaultGitLabUrl = `https://gitlab.com/${defaultOrg}`;

// Standardized stdio configuration for spawn calls
export const stdioInherit: SpawnSyncOptions["stdio"] = ["inherit", "inherit", "inherit"];
export const stdioPipe: SpawnSyncOptions["stdio"] = ["ignore", "pipe", "pipe"];

// Common utility to handle errors from subprocesses
export function handleCommandError(
  error: Error & { code?: string },
  commandName: string,
  requiredCommands: string
): never {
  if (error.code === "ENOENT") {
    console.error(
      `Error: A required command (${requiredCommands}) could not be found. Please ensure they are installed and in your PATH.`
    );
  } else {
    console.error(`Failed to execute ${commandName}: ${error.message}`);
  }
  process.exit(1);
}

// Handles changing directory through shell wrapper
export function handleCdToPath(targetPath: string): void {
  // Special format for the shell wrapper to interpret: "CD:<path>"
  console.log(`CD:${targetPath}`);
  process.exit(0);
}

// Shows usage information
export function showUsage(): never {
  console.error(`dev: A CLI tool for quick directory navigation and environment management.

Usage:
  dev cd                     Interactively select a directory from ~/src using fzf.
                             (Searches for directories at depth 3 in ~/src)

  dev cd <folder_name>       Finds and outputs the path to <folder_name> within ~/src.
                             (Searches for a directory named <folder_name> at depth 3)

  dev clone <repo>           Clones a repository into ~/src with automatic provider detection.
                             Examples:
                               dev clone https://github.com/${defaultOrg}/repo
                               dev clone repo (uses provider based on organization mapping)
                               dev clone org/repo (provider chosen based on 'org')
                               dev clone --gitlab repo (explicitly uses GitLab)
                               dev clone --org customorg repo

  dev up                     Runs 'mise up' to update development tools.

  dev upgrade                Updates the dev CLI tool to the latest version.
`);
  process.exit(1);
}
