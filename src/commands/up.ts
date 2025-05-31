import * as fs from "fs";
import * as path from "path";

import { devDir } from "~/lib/constants";
import type { DevCommand } from "~/types/command";
import { isGitRepository, runCommand, validateTool } from "~/utils/command-utils";

export const upCommand: DevCommand = {
  name: "up",
  description: "Installs development tools for the current project",
  help: `
The 'up' command helps set up your development environment:

1. If you're in a git repository without mise config, it creates one from a template
2. Runs 'mise install' to install all required development tools

Examples:
  dev up              # Set up current project
  `,

  async exec(context) {
    const { logger } = context;

    try {
      // Validate that mise is available
      validateTool("mise", context);

      const cwd = process.cwd();
      const userMiseConfigDir = path.join(cwd, ".config", "mise");
      const userMiseConfigFile = path.join(userMiseConfigDir, "config.toml");
      const templateConfigPath = path.join(devDir, "hack", "configs", "mise-config-repo.toml");

      // Check if we're in a git repository and need to create mise config
      if (isGitRepository(cwd)) {
        if (!fs.existsSync(userMiseConfigFile)) {
          logger.warn(`Mise configuration not found at ${userMiseConfigFile}. Attempting to create one...`);

          if (!fs.existsSync(templateConfigPath)) {
            throw new Error(`Template config file not found at ${templateConfigPath}`);
          }

          if (!fs.existsSync(userMiseConfigDir)) {
            fs.mkdirSync(userMiseConfigDir, { recursive: true });
            logger.info(`Created directory: ${userMiseConfigDir}`);
          }

          const templateContent = fs.readFileSync(templateConfigPath, "utf-8");
          fs.writeFileSync(userMiseConfigFile, templateContent);
          logger.success(`Successfully created ${userMiseConfigFile} with content from ${templateConfigPath}.`);
        } else {
          logger.success(`Mise configuration found at ${userMiseConfigFile}. Proceeding with 'mise install'.`);
        }
      } else {
        logger.info(`No .git directory found in ${cwd}. Skipping mise config check, proceeding with 'mise install'.`);
      }

      // Run mise install
      logger.info("Running mise install...");
      runCommand(["mise", "install"], context, { inherit: true });
      logger.success("Successfully completed mise install");
    } catch (error: any) {
      logger.error(`Up command failed: ${error.message}`);
      throw error;
    }
  },
};
