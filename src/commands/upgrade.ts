import path from "path";

import { devDir } from "~/lib/constants";
import type { DevCommand } from "~/types/command";
import { runCommand } from "~/utils/command-utils";

export const upgradeCommand: DevCommand = {
  name: "upgrade",
  description: "Updates the dev CLI tool to the latest version",
  help: `
The upgrade command updates your dev CLI tool by running the setup script:

- Pulls latest changes from the repository
- Installs any new dependencies
- Updates shell integration if needed

Examples:
  dev upgrade             # Upgrade to latest version
  `,

  async exec(context) {
    const { logger } = context;

    try {
      logger.info("🔄 Upgrading dev CLI tool...");
      const setupScriptPath = path.join(devDir, "hack", "setup.sh");

      // Run the setup script
      runCommand(["zsh", setupScriptPath], context, { inherit: true });

      logger.success("✅ dev CLI tool successfully upgraded!");
    } catch (error: any) {
      logger.error(`Upgrade failed: ${error.message}`);
      throw error;
    }
  },
};
