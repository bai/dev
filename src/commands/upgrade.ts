import type { DevCommand } from "~/lib/core/command-types";
import { refreshDevConfigFromRemoteUrl } from "~/lib/dev-config";
import { setupGoogleCloudConfig } from "~/lib/tools/gcloud";
import { setupMiseGlobalConfig } from "~/lib/tools/mise";

export const upgradeCommand: DevCommand = {
  name: "upgrade",
  description: "Updates the dev CLI tool itself",
  help: `
The upgrade command updates your dev CLI tool itself:

- Pulls latest changes from the repository
- Installs any new dependencies
- Updates shell integration if needed
- Refreshes dev configuration from remote source
- Sets up Google Cloud configuration
- Configures mise global settings
- Provides usage examples

Examples:
  dev upgrade             # Upgrade to latest version
  `,

  async exec(context) {
    const { logger } = context;

    try {
      logger.info("🔄 Upgrading dev CLI tool...");

      // Step 1: Refresh dev config
      await refreshDevConfigFromRemoteUrl();

      // Step 2: Google Cloud Config
      await setupGoogleCloudConfig();

      // Step 3: Mise Configuration
      await setupMiseGlobalConfig();

      logger.info("");
      logger.success("🎉 Dev CLI upgrade and setup complete!");
      logger.info("");
      logger.info("💡 Usage examples:");
      logger.info("   dev cd         → Interactive directory navigation");
      logger.info("   dev cd <name>  → Jump to matching directory");
      logger.info("   dev up         → Update development tools");
      logger.info("   dev upgrade    → Update dev CLI itself");
      logger.info("   dev help       → Show all available commands");
      logger.info("");
    } catch (error: any) {
      logger.error(`Upgrade failed: ${error.message}`);
      throw error;
    }
  },
};
