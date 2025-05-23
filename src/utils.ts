import os from "os";
import path from "path";
import fs from "fs";
import type { SpawnOptions } from "bun";

// Provider type
export type GitProvider = "github" | "gitlab";

// Common variables
export const homeDir = os.homedir();
export const baseSearchDir = path.join(homeDir, "src");
export const defaultOrg = "flywheelsoftware";

// Organization to provider mapping
export const orgToProvider: Record<string, GitProvider> = {
  flywheelsoftware: "gitlab",
  // Add more mappings as needed, e.g.:
  // "otherorg": "github",
};

export const defaultGitHubUrl = `https://github.com/${defaultOrg}`;
export const defaultGitLabUrl = `https://gitlab.com/${defaultOrg}`;

// Properly typed stdio configurations for Bun's spawnSync
export const stdioInherit: ["inherit", "inherit", "inherit"] = [
  "inherit",
  "inherit",
  "inherit",
];
export const stdioPipe: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];

// Validation utilities
export function validateBaseSearchDir(): void {
  if (!fs.existsSync(baseSearchDir)) {
    console.error(
      `Error: Base search directory does not exist: ${baseSearchDir}`
    );
    console.error(
      `Please create the directory first: mkdir -p ${baseSearchDir}`
    );
    process.exit(1);
  }
}

export function validateCommand(command: string, friendlyName?: string): void {
  // This is a basic check - in practice, you might want to use `which` or similar
  const displayName = friendlyName || command;
  console.log(`Checking for required command: ${displayName}...`);
}

// Enhanced error handling with more context
export function handleCommandError(
  error: Error & { code?: string },
  commandName: string,
  requiredCommands: string,
  context?: string
): never {
  const contextMsg = context ? ` (${context})` : "";

  if (error.code === "ENOENT") {
    console.error(`❌ Error: Required command not found${contextMsg}`);
    console.error(`   Command: ${requiredCommands}`);
    console.error(
      `   Please ensure the following are installed and in your PATH:`
    );
    console.error(
      `   ${requiredCommands
        .split(", ")
        .map((cmd) => `   - ${cmd}`)
        .join("\n")}`
    );
    console.error(`\n💡 Installation suggestions:`);

    if (requiredCommands.includes("fd")) {
      console.error(`   - fd: brew install fd`);
    }
    if (requiredCommands.includes("fzf")) {
      console.error(`   - fzf: brew install fzf`);
    }
    if (requiredCommands.includes("git")) {
      console.error(`   - git: brew install git`);
    }
    if (requiredCommands.includes("mise")) {
      console.error(`   - mise: brew install mise`);
    }
  } else {
    console.error(
      `❌ Failed to execute ${commandName}${contextMsg}: ${error.message}`
    );
  }
  process.exit(1);
}

// Handles changing directory through shell wrapper
export function handleCdToPath(targetPath: string): void {
  // Validate path exists before attempting to cd
  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Error: Directory does not exist: ${targetPath}`);
    process.exit(1);
  }

  // Special format for the shell wrapper to interpret: "CD:<path>"
  console.log(`CD:${targetPath}`);
  process.exit(0);
}

// Enhanced usage information with better formatting
export function showUsage(): never {
  console.log(`🚀 dev: A CLI tool for quick directory navigation and environment management.

📖 Usage:
  dev ls                     Interactively select a directory from ~/src using fzf and cd into it.
                             (Searches for directories at depth 3 in ~/src)

  dev cd                     Same as 'dev ls' - interactively select a directory using fzf.

  dev cd <folder_name>       Finds and outputs the path to <folder_name> within ~/src, then cds into it.
                             (Searches for a directory named <folder_name> at depth 3)

  dev clone <repo>           Clones a repository into ~/src with automatic provider detection.
                             Examples:
                               dev clone https://github.com/${defaultOrg}/repo
                               dev clone repo (uses provider based on organization mapping)
                               dev clone org/repo (provider chosen based on 'org')
                               dev clone --gitlab repo (explicitly uses GitLab)
                               dev clone --org customorg repo

  dev open [folder_name]     Opens a directory in your default editor/IDE.
                             Without arguments, opens current directory.
                             With folder name, searches and opens that project.

  dev status                 Shows status information about your dev environment.
                             Displays tool availability, git status, and configuration.

  dev test                   Runs basic tests to validate CLI functionality.
                             Checks installation, configuration, and dependencies.

  dev auth                   Attempts to authenticate with GitHub, GitLab, and Google Cloud.
                             For GitHub and GitLab, this will guide you to use 'gh auth login' and 'glab auth login'.
                             For Google Cloud, it will attempt 'gcloud auth login' and 'gcloud auth application-default login'.

  dev up                     Runs 'mise up' to update development tools.

  dev upgrade                Updates the dev CLI tool to the latest version.

  dev help                   Shows this help message.

💡 Tips:
  - Use 'dev cd' without arguments for interactive fuzzy search
  - Clone repos with just the name if using default org: 'dev clone myrepo'
  - Run 'dev up' in any git repository to set up development tools
  - Use 'dev status' to check your environment setup
  - Use 'dev open myproject' to quickly open projects in your editor
  - Use 'dev test' to validate your CLI installation
`);
  process.exit(0);
}
