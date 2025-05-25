import { handleCommandError } from "~/lib/handlers";
import { setupBunRuntime, setupGoogleCloudConfig, setupMiseGlobalConfig } from "~/lib/setup";

/**
 * Handles the 'setup' subcommand.
 * Sets up the dev CLI tool by configuring mise global configuration,
 * Google Cloud config, and bun runtime.
 */
export async function handleSetupCommand(): Promise<void> {
  try {
    // Step 8: Google Cloud Config
    await setupGoogleCloudConfig();

    console.log("");

    // Step 9: Mise Configuration
    await setupMiseGlobalConfig();

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
