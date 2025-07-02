import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { Keychain } from "../../domain/ports/Keychain";

interface AuthContext extends CommandContext {
  keychain: Keychain;
}

export const authCommand: CliCommandSpec = {
  name: "auth",
  description: "Manage authentication credentials",
  help: `
Manage authentication credentials for various services:

Usage:
  dev auth <service>      # Set credentials for a service
  dev auth list           # List stored services
  dev auth remove <service> # Remove credentials for a service

Examples:
  dev auth github         # Set GitHub credentials
  dev auth gitlab         # Set GitLab credentials
  dev auth remove github  # Remove GitHub credentials
  `,

  arguments: [
    {
      name: "service",
      description: "Service name (github, gitlab, etc.) or 'list'/'remove'",
      required: true,
    },
    {
      name: "account",
      description: "Account name (for remove command)",
      required: false,
    },
  ],

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as AuthContext;
    const service = ctx.args.service;
    const account = ctx.args.account;

    if (service === "list") {
      ctx.logger.info("Credential management is handled through the system keychain");
      ctx.logger.info("Use 'Keychain Access' app on macOS to view stored credentials");
      return;
    }

    if (service === "remove") {
      if (!account) {
        ctx.logger.error("Account name is required for remove command");
        return;
      }

      const result = await ctx.keychain.removeCredential("dev-cli", account);

      if (typeof result === "object" && "_tag" in result) {
        ctx.logger.error(`Failed to remove credentials: ${result.reason}`);
        throw result;
      }

      ctx.logger.success(`Credentials for ${account} removed successfully`);
      return;
    }

    // Set credentials for a service
    const serviceName = service.toLowerCase();
    const supportedServices = ["github", "gitlab"];

    if (!supportedServices.includes(serviceName)) {
      ctx.logger.error(`Unsupported service: ${serviceName}`);
      ctx.logger.info(`Supported services: ${supportedServices.join(", ")}`);
      return;
    }

    // Prompt for username
    const username = await promptInput("Username: ");
    if (!username) {
      ctx.logger.error("Username is required");
      return;
    }

    // Prompt for token/password
    const token = await promptPassword("Token/Password: ");
    if (!token) {
      ctx.logger.error("Token/Password is required");
      return;
    }

    // Store in keychain
    const result = await ctx.keychain.setCredential(`dev-cli-${serviceName}`, username, token);

    if (typeof result === "object" && "_tag" in result) {
      ctx.logger.error(`Failed to store credentials: ${result.reason}`);
      throw result;
    }

    ctx.logger.success(`Credentials for ${serviceName} stored successfully`);
  },
};

// Helper functions for input (these would ideally use a proper CLI input library)
async function promptInput(prompt: string): Promise<string> {
  process.stdout.write(prompt);

  for await (const line of console) {
    return line.trim();
  }

  return "";
}

async function promptPassword(prompt: string): Promise<string> {
  // In a real implementation, this would hide the input
  // For now, just use regular input
  return await promptInput(prompt);
}
