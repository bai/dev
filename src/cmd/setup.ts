import { handleCommandError } from "~/lib/handlers";
import { setupMiseGlobalConfig } from "~/lib/setup-mise-global-config";

/**
 * Handles the 'setup' subcommand.
 * Sets up the dev CLI tool by configuring mise global configuration.
 */
export async function handleSetupCommand(): Promise<void> {
  try {
    console.log("🔧 Setting up dev CLI tool...");
    await setupMiseGlobalConfig();
    console.log("✅ Setup completed successfully!");
  } catch (error: any) {
    handleCommandError(error, "setup", "dev");
  }
}
