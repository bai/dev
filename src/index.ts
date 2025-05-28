import fs from "fs";

import { Command } from "commander";

import { baseSearchDir } from "~/lib/constants";
import { showUsage } from "~/lib/handlers";
import { ensureMiseVersionOrUpgrade } from "~/lib/mise-version";
import { runPeriodicUpgradeCheck } from "~/lib/run-update-check";
import { ensureDatabaseIsUpToDate } from "~/lib/setup";
import { getCurrentGitCommitSha } from "~/lib/version";
import { handleAuthCommand } from "~/cmd/auth";
import { handleDirectCd, handleInteractiveCd } from "~/cmd/cd";
import { handleCloneCommand } from "~/cmd/clone";
import { handleRunCommand } from "~/cmd/run";
import { handleSetupCommand } from "~/cmd/setup";
import { handleStatusCommand } from "~/cmd/status";
import { handleUpCommand } from "~/cmd/up";
import { handleUpgradeCommand } from "~/cmd/upgrade";

(async () => {
  try {
    await ensureDatabaseIsUpToDate();
    await runPeriodicUpgradeCheck();
    await ensureMiseVersionOrUpgrade("run");

    // Ensure base search directory exists
    if (!fs.existsSync(baseSearchDir)) {
      try {
        fs.mkdirSync(baseSearchDir, { recursive: true });
        console.log(`📁 Created base search directory: ${baseSearchDir}`);
      } catch (error: any) {
        console.error(`❌ Error: Failed to create base search directory: ${baseSearchDir}`);
        console.error(`   ${error.message}`);
        if (error.code === "EACCES") {
          console.error("💡 Permission denied. Run `dev status` to check environment health.");
        } else if (error.code === "ENOSPC") {
          console.error("💡 No space left on device. Free up some disk space and try again.");
        }
        process.exit(1);
      }
    }

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
          handleDirectCd(folderName);
        } else {
          handleInteractiveCd();
        }
      });

    // up command
    program
      .command("up")
      .description("Installs development tools for the current project")
      .action(async () => {
        await handleUpCommand();
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
      .action((repo: string, options: { gitlab?: boolean; github?: boolean; org?: string }) => {
        const args = [repo];

        if (options.gitlab) {
          args.unshift("--gitlab");
        } else if (options.github) {
          args.unshift("--github");
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
      .action(async () => {
        await handleStatusCommand();
      });

    // run command
    program
      .command("run")
      .description("Runs 'mise run <task>' to execute project tasks")
      .argument("<task>", "Task to run")
      .argument("[args...]", "Additional arguments to pass to the task")
      .action(async (task: string, args: string[]) => {
        await handleRunCommand([task, ...args]);
      });

    // setup command
    program
      .command("setup")
      .description("Sets up the dev CLI tool")
      .action(async () => {
        await handleSetupCommand();
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
