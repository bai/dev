import fs from "fs";
import path from "path";

import { baseSearchDir } from "~/lib/constants";
import { devConfig } from "~/lib/dev-config";

/**
 * Handles command execution errors with appropriate error messages and exits the process.
 *
 * @param error - The error object, potentially with a code property
 * @param commandName - Name of the command that failed
 * @param requiredCommands - Comma-separated list of required commands
 * @param context - Optional context information for the error
 * @throws Never returns - always exits the process with code 1
 */
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

/**
 * Handles changing directory through shell wrapper by outputting a special format.
 * Converts the relative path to an absolute path and validates that the target path exists before attempting to
 * change directory.
 *
 * @param targetPath - The absolute path to change directory to
 * @throws Never returns - always exits the process (code 0 on success, code 1 on error)
 */
export function handleCdToPath(targetPath: string): void {
  const absolutePath = path.join(baseSearchDir, targetPath.replace(/\/$/, ""));

  // Validate path exists before attempting to cd
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: Directory does not exist: ${absolutePath}`);
    process.exit(1);
  }

  // Special format for the shell wrapper to interpret: "CD:<path>"
  console.log(`CD:${absolutePath}`);
  process.exit(0);
}

/**
 * Displays comprehensive usage information for the dev CLI tool.
 * Shows all available commands, their syntax, examples, and helpful tips.
 *
 * @throws Never returns - always exits the process with code 0
 */
export function showUsage(): never {
  console.log(`🚀 dev: A CLI tool for quick directory navigation and environment management.

📖 Usage:
  dev cd                     Interactively select a directory using fzf and cd into it.

  dev cd <folder_name>       Finds and outputs the path to <folder_name> within ~/src, then cds into it.
                             (Searches for a directory named <folder_name> at depth 3)

  dev clone <repo>           Clones a repository into ~/src with automatic provider detection.
                             Examples:
                               dev clone https://github.com/${devConfig.defaultOrg}/repo
                               dev clone repo (uses provider based on organization mapping)
                               dev clone org/repo (provider chosen based on 'org')
                               dev clone --gitlab repo (explicitly uses GitLab)

  dev status                 Shows comprehensive status information and validates CLI functionality.
                             Displays tool availability, git status, configuration, and health checks.

  dev auth                   Attempts to authenticate with GitHub, GitLab, and Google Cloud.
                             For GitHub and GitLab, this will guide you to use 'gh auth login' and 'glab auth login'.
                             For Google Cloud, it will attempt 'gcloud auth login' and 'gcloud auth application-default login'.

  dev up                     Installs development tools for the current project.

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
