import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { type CliCommandSpec, type CommandContext } from "../../domain/models";
import { KeychainService } from "../../domain/ports/Keychain";

// Interface removed - services now accessed via Effect Context

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

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const keychain = yield* KeychainService;
      const service = context.args.service;
      const account = context.args.account;

      if (service === "list") {
        yield* Effect.logInfo("Credential management is handled through the system keychain");
        yield* Effect.logInfo("Use 'Keychain Access' app on macOS to view stored credentials");
        return;
      }

      if (service === "remove") {
        if (!account) {
          yield* Effect.logError("Account name is required for remove command");
          return yield* Effect.fail(unknownError("Account name is required for remove command"));
        }

        yield* keychain.removeCredential("dev-cli", account);
        yield* Effect.logInfo(`✅ Credentials for ${account} removed successfully`);
        return;
      }

      // Set credentials for a service
      const serviceName = service.toLowerCase();
      const supportedServices = ["github", "gitlab"];

      if (!supportedServices.includes(serviceName)) {
        yield* Effect.logError(`Unsupported service: ${serviceName}`);
        yield* Effect.logInfo(`Supported services: ${supportedServices.join(", ")}`);
        return yield* Effect.fail(unknownError(`Unsupported service: ${serviceName}`));
      }

      // Prompt for username
      const username = yield* promptInputEffect("Username: ");
      if (!username) {
        yield* Effect.logError("Username is required");
        return yield* Effect.fail(unknownError("Username is required"));
      }

      // Prompt for token/password
      const token = yield* promptPasswordEffect("Token/Password: ");
      if (!token) {
        yield* Effect.logError("Token/Password is required");
        return yield* Effect.fail(unknownError("Token/Password is required"));
      }

      // Store in keychain
      yield* keychain.setCredential(`dev-cli-${serviceName}`, username, token);
      yield* Effect.logInfo(`✅ Credentials for ${serviceName} stored successfully`);
    });
  },
};

// Helper functions for input (these would ideally use a proper CLI input library)
const promptInputEffect = (prompt: string): Effect.Effect<string, DevError> =>
  Effect.tryPromise({
    try: async () => {
      process.stdout.write(prompt);

      for await (const line of console) {
        return line.trim();
      }

      return "";
    },
    catch: (error) => unknownError(`Failed to get input: ${error}`),
  });

const promptPasswordEffect = (prompt: string): Effect.Effect<string, DevError> =>
  // In a real implementation, this would hide the input
  // For now, just use regular input
  promptInputEffect(prompt);
