import { spawnSync } from "bun";
import * as fs from "fs";
import * as path from "path";
import { handleCommandError, stdioInherit } from "~/utils";

/**
 * Handles the 'up' subcommand.
 * Checks for and creates a local mise config if in a git repository and config is missing.
 * Then, runs 'mise up' command directly to update development tools.
 */
export function handleUpCommand(): void {
  try {
    const cwd = process.cwd();
    const gitRepoPath = path.join(cwd, ".git");
    const userMiseConfigDir = path.join(cwd, ".config", "mise");
    const userMiseConfigFile = path.join(userMiseConfigDir, "config.toml");
    const templateConfigPath = path.join(
      cwd,
      "hack",
      "configs",
      "mise-config-repo.toml"
    );

    if (fs.existsSync(gitRepoPath)) {
      if (!fs.existsSync(userMiseConfigFile)) {
        console.log(
          `Mise configuration not found at ${userMiseConfigFile}. Attempting to create one...`
        );
        if (!fs.existsSync(templateConfigPath)) {
          console.error(
            `Error: Template config file not found at ${templateConfigPath}`
          );
          process.exit(1);
        }
        if (!fs.existsSync(userMiseConfigDir)) {
          fs.mkdirSync(userMiseConfigDir, { recursive: true });
          console.log(`Created directory: ${userMiseConfigDir}`);
        }
        let templateContent = fs.readFileSync(templateConfigPath, "utf-8");

        fs.writeFileSync(userMiseConfigFile, templateContent);
        console.log(
          `Successfully created ${userMiseConfigFile} with content from ${templateConfigPath}.`
        );
      } else {
        console.log(
          `Mise configuration found at ${userMiseConfigFile}. Proceeding with 'mise up'.`
        );
      }
    } else {
      console.log(
        `No .git directory found in ${cwd}. Skipping mise config check, proceeding with 'mise up'.`
      );
    }

    const proc = spawnSync(["mise", "up"], {
      stdio: stdioInherit, // Inherit all IO to pass through to the user
    });

    if (proc.exitCode !== 0) {
      console.error("Error running 'mise up' command");
      process.exit(proc.exitCode || 1);
    }
  } catch (error: any) {
    handleCommandError(error, "mise up", "mise");
  }
}
