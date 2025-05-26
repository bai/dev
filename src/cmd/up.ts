import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "bun";

import { devDir } from "~/lib/constants";
import { handleCommandError } from "~/lib/handlers";

/**
 * Handles the 'up' subcommand.
 * Checks for and creates a local mise config if in a git repository and config is missing.
 * Then, runs 'mise install' command directly to update development tools.
 */
export function handleUpCommand(): void {
  try {
    const cwd = process.cwd();
    const gitRepoPath = path.join(cwd, ".git");
    const userMiseConfigDir = path.join(cwd, ".config", "mise");
    const userMiseConfigFile = path.join(userMiseConfigDir, "config.toml");
    const templateConfigPath = path.join(devDir, "hack", "configs", "mise-config-repo.toml");

    if (fs.existsSync(gitRepoPath)) {
      if (!fs.existsSync(userMiseConfigFile)) {
        console.log(`⚠️  Mise configuration not found at ${userMiseConfigFile}. Attempting to create one...`);
        if (!fs.existsSync(templateConfigPath)) {
          console.error(`❌ Error: Template config file not found at ${templateConfigPath}`);
          process.exit(1);
        }
        if (!fs.existsSync(userMiseConfigDir)) {
          fs.mkdirSync(userMiseConfigDir, { recursive: true });
          console.log(`📁 Created directory: ${userMiseConfigDir}`);
        }
        const templateContent = fs.readFileSync(templateConfigPath, "utf-8");

        fs.writeFileSync(userMiseConfigFile, templateContent);
        console.log(`✅ Successfully created ${userMiseConfigFile} with content from ${templateConfigPath}.`);
      } else {
        console.log(`✅ Mise configuration found at ${userMiseConfigFile}. Proceeding with 'mise install'.`);
      }
    } else {
      console.log(`ℹ️  No .git directory found in ${cwd}. Skipping mise config check, proceeding with 'mise install'.`);
    }

    const proc = spawnSync(["mise", "install"], {
      stdio: ["ignore", "inherit", "inherit"], // Inherit stdout and stderr to pass through to the user
    });

    if (proc.exitCode !== 0) {
      console.error("❌ Error running 'mise install' command");
      process.exit(proc.exitCode || 1);
    }
  } catch (error: any) {
    handleCommandError(error, "mise install", "mise");
  }
}
