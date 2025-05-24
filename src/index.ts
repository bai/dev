import { validateBaseSearchDir, showUsage } from "./utils";
import { handleCdCommand } from "./cmd/cd";
import { handleLsCommand } from "./cmd/ls";
import { handleUpCommand } from "./cmd/up";
import { handleUpgradeCommand } from "./cmd/upgrade";
import { handleCloneCommand } from "./cmd/clone";
import { handleAuthCommand } from "./cmd/auth";
import { handleStatusCommand } from "./cmd/status";
import { handleRunCommand } from "./cmd/run";
import { Command } from "commander";
import { runPeriodicUpgradeCheck } from "~/utils/run-update-check";
import { getCurrentGitCommitSha } from "~/utils/version";

(async () => {
  try {
    await runPeriodicUpgradeCheck();

    // Validate base search directory exists
    validateBaseSearchDir();

    // Check for help commands before commander processes them
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === "help" || (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))) {
      showUsage();
    }

    const program = new Command();

    program
      .name("dev")
      .description("A CLI tool for quick directory navigation and environment management")
      .version(getCurrentGitCommitSha())
      .helpOption(false); // Disable commander.js help since we handle it custom

    // cd command - can be used with or without arguments
    program
      .command("cd")
      .description("Navigate to a directory in ~/src")
      .argument("[folder_name]", "Name of the folder to navigate to")
      .action((folderName?: string) => {
        if (folderName) {
          handleCdCommand([folderName]);
        } else {
          // If 'cd' is used without arguments, show the list of directories
          handleLsCommand();
        }
      });

    // ls command
    program
      .command("ls")
      .description("Interactively select a directory from ~/src using fzf and cd into it")
      .action(() => {
        handleLsCommand();
      });

    // up command
    program
      .command("up")
      .description("Runs 'mise up' to update development tools")
      .action(() => {
        handleUpCommand();
      });

    // upgrade command
    program
      .command("upgrade")
      .description("Updates the dev CLI tool to the latest version")
      .action(() => {
        handleUpgradeCommand();
      });

    // clone command
    program
      .command("clone")
      .description("Clones a repository into ~/src with automatic provider detection")
      .argument("<repo>", "Repository to clone (name, org/repo, or full URL)")
      .option("--gitlab", "Use GitLab as the provider")
      .option("--github", "Use GitHub as the provider")
      .option("-o, --org <organization>", "Specify the organization")
      .action((repo: string, options: { gitlab?: boolean; github?: boolean; org?: string }) => {
        const args = [repo];

        if (options.gitlab) {
          args.unshift("--gitlab");
        } else if (options.github) {
          args.unshift("--github");
        }

        if (options.org) {
          args.unshift("--org", options.org);
        }

        handleCloneCommand(args);
      });

    // auth command
    program
      .command("auth")
      .description("Authenticate with GitHub, GitLab, and Google Cloud")
      .argument("[service]", "Service to authenticate with (github, gitlab, gcloud)")
      .argument("[subcommand]", "Subcommand for gcloud (login, app-login)")
      .action(async (service?: string, subcommand?: string) => {
        const args: string[] = [];
        if (service) {
          args.push(service);
          if (subcommand) {
            args.push(subcommand);
          }
        }
        await handleAuthCommand(args);
      });

    // status command
    program
      .command("status")
      .description("Shows comprehensive status information and validates CLI functionality")
      .action(() => {
        handleStatusCommand();
      });

    // run command
    program
      .command("run")
      .description("Runs 'mise run <task>' to execute project tasks")
      .argument("<task>", "Task to run")
      .argument("[args...]", "Additional arguments to pass to the task")
      .action((task: string, args: string[]) => {
        handleRunCommand([task, ...args]);
      });

    // help command
    program
      .command("help")
      .description("Shows this help message")
      .action(() => {
        showUsage();
      });

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error: any) {
    console.error(`❌ Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
