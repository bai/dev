import * as fs from "fs";
import * as path from "path";

import { stringify } from "@iarna/toml";

import { devDir } from "~/lib/constants";
import type { DevCommand } from "~/lib/core/command-types";
import { isGitRepository, runCommand, validateTool } from "~/lib/core/command-utils";
import { miseRepoConfig } from "~/lib/tools/mise";

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
      const repoMiseConfigDir = path.join(cwd, ".config", "mise");
      const repoMiseConfigFile = path.join(repoMiseConfigDir, "config.toml");

      // Check if we're in a git repository and need to create mise config
      if (isGitRepository(cwd)) {
        if (!fs.existsSync(repoMiseConfigFile)) {
          logger.warn(`Mise configuration not found at ${repoMiseConfigFile}. Attempting to create one...`);

          if (!fs.existsSync(repoMiseConfigDir)) {
            fs.mkdirSync(repoMiseConfigDir, { recursive: true });
            logger.info(`Created directory: ${repoMiseConfigDir}`);
          }

          const configContent = stringify(miseRepoConfig);
          fs.writeFileSync(repoMiseConfigFile, configContent);
          logger.success(`Successfully created ${repoMiseConfigFile} with mise repository configuration.`);
        } else {
          logger.debug(`Mise configuration found at ${repoMiseConfigFile}. Proceeding with 'mise install'.`);
        }
      } else {
        logger.info(`No .git directory found in ${cwd}. Skipping mise config check, proceeding with 'mise install'.`);
      }

      // Run mise install
      logger.debug("Running mise install...");
      runCommand(["mise", "install"], context, { inherit: true });
      logger.debug("Successfully completed mise install");
    } catch (error: any) {
      logger.error(`Up command failed: ${error.message}`);
      throw error;
    }
  },
};
