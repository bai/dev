import fs from "fs";
import { baseSearchDir, defaultOrg } from "~/utils/constants";

// Validation utilities
export function validateBaseSearchDir(): void {
  if (!fs.existsSync(baseSearchDir)) {
    console.error(`Error: Base search directory does not exist: ${baseSearchDir}`);
    console.error(`Please create the directory first: mkdir -p ${baseSearchDir}`);
    process.exit(1);
  }
}

// Enhanced error handling with more context
export function handleCommandError(
  error: Error & { code?: string },
  commandName: string,
  requiredCommands: string,
  context?: string,
): never {
  const contextMsg = context ? ` (${context})` : "";

  if (error.code === "ENOENT") {
    console.error(`❌ Error: Required command not found${contextMsg}`);
    console.error(`   Command: ${requiredCommands}`);
    console.error(`   Please ensure the following are installed and in your PATH:`);
    console.error(
      `   ${requiredCommands
        .split(", ")
        .map((cmd) => `   - ${cmd}`)
        .join("\n")}`,
    );
  } else {
    console.error(`❌ Failed to execute ${commandName}${contextMsg}: ${error.message}`);
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

// Custom usage information with beautiful formatting and emojis
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

  dev status                 Shows comprehensive status information and validates CLI functionality.
                             Displays tool availability, git status, configuration, and health checks.

  dev auth                   Attempts to authenticate with GitHub, GitLab, and Google Cloud.
                             For GitHub and GitLab, this will guide you to use 'gh auth login' and 'glab auth login'.
                             For Google Cloud, it will attempt 'gcloud auth login' and 'gcloud auth application-default login'.

  dev up                     Runs 'mise up' to update development tools.

  dev run <task>             Runs 'mise run <task>' to execute project tasks.
                             All arguments after 'run' are passed through to mise.
                             Examples:
                               dev run my_super_task
                               dev run build --watch
                               dev run test --verbose

  dev upgrade                Updates the dev CLI tool to the latest version.

  dev help                   Shows this help message.

💡 Tips:
  - Use 'dev cd' without arguments for interactive fuzzy search
  - Clone repos with just the name if using default org: 'dev clone myrepo'
  - Run 'dev up' in any git repository to set up development tools
  - Use 'dev run <task>' to execute project-specific tasks with mise
  - Use 'dev status' to check your environment setup and validate installation
`);
  process.exit(0);
}
