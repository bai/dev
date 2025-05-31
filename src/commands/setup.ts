import type { DevCommand } from "~/lib/core/command-types";
import { refreshDevConfigFromRemoteUrl } from "~/lib/dev-config";
import { setupGoogleCloudConfig } from "~/lib/tools/gcloud";
import { setupMiseGlobalConfig } from "~/lib/tools/mise";

export const setupCommand: DevCommand = {
  name: "setup",
  description: "Sets up the dev CLI tool",
  help: `
The setup command configures your dev CLI environment:

- Refreshes dev configuration from remote source
- Sets up Google Cloud configuration
- Configures mise global settings
- Provides usage examples

Examples:
  dev setup               # Complete setup process
  `,

  async exec(context) {
    const { logger } = context;

    try {
      // Step 1: Refresh dev config
      await refreshDevConfigFromRemoteUrl();

      // Step 2: Google Cloud Config
      await setupGoogleCloudConfig();

      // Step 3: Mise Configuration
      await setupMiseGlobalConfig();

      logger.info("");
      logger.success("🎉 Dev CLI setup complete!");
      logger.info("");
      logger.info("💡 Usage examples:");
      logger.info("   dev cd         → Interactive directory navigation");
      logger.info("   dev cd <name>  → Jump to matching directory");
      logger.info("   dev up         → Update development tools");
      logger.info("   dev upgrade    → Update dev CLI itself");
      logger.info("   dev help       → Show all available commands");
      logger.info("");
    } catch (error: any) {
      logger.error(`Setup failed: ${error.message}`);
      throw error;
    }
  },
};
