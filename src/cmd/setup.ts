import { refreshDevConfigFromRemoteUrl } from "~/lib/dev-config";
import { handleCommandError } from "~/lib/handlers";
import { setupGoogleCloudConfig, setupMiseGlobalConfig } from "~/lib/setup";

/**
 * Handles the 'setup' subcommand.
 * Sets up the dev CLI tool by configuring mise global configuration,
 * Google Cloud config, and bun runtime.
 */
export async function handleSetupCommand(): Promise<void> {
  try {
    // Step 1: Refresh dev config
    // console.log("🔄 Refreshing dev configuration...");
    await refreshDevConfigFromRemoteUrl();
    // console.log("✅ Dev configuration refreshed");

    // Step 2: Google Cloud Config
    // console.log("🔄 Setting up Google Cloud configuration...");
    await setupGoogleCloudConfig();
    // console.log("✅ Google Cloud configuration setup complete");

    // Step 3: Mise Configuration
    // console.log("🔄 Setting up mise global configuration...");
    await setupMiseGlobalConfig();
    // console.log("✅ Mise global configuration setup complete");

    console.log("");
    console.log("🎉 Dev CLI setup complete!");
    console.log("");
    console.log("💡 Usage examples:");
    console.log("   dev cd         → Interactive directory navigation");
    console.log("   dev cd <name>  → Jump to matching directory");
    console.log("   dev up         → Update development tools");
    console.log("   dev upgrade    → Update dev CLI itself");
    console.log("   dev help       → Show all available commands");
    console.log("");
  } catch (error: any) {
    handleCommandError(error, "setup", "dev");
  }
}
