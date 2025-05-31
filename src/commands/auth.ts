import { spawn } from "child_process";

import type { DevCommand } from "~/lib/core/command-types";
import { arg, getArg, validateChoice } from "~/lib/core/command-utils";

async function executeCommand(command: string, args: string[], logger: any): Promise<void> {
  return new Promise((resolve) => {
    const process = spawn(command, args, { stdio: "inherit" });

    process.on("close", (code) => {
      if (code === 0) {
        logger.success(`'${command} ${args.join(" ")}' executed successfully.`);
        resolve();
      } else {
        logger.error(`'${command} ${args.join(" ")}' exited with code ${code}.`);
        // Resolve instead of reject to allow subsequent auth attempts
        resolve();
      }
    });

    process.on("error", (err: any) => {
      logger.error(`Failed to start '${command} ${args.join(" ")}':`, err.message);
      if (err.code === "ENOENT") {
        logger.error(`The command '${command}' was not found. Please ensure it is installed and in your PATH.`);
      }
      // Resolve instead of reject to allow subsequent auth attempts
      resolve();
    });
  });
}

export const authCommand: DevCommand = {
  name: "auth",
  description: "Authenticate with Google Cloud",
  help: `
The auth command helps you authenticate with Google Cloud:

Services:
  gcloud              Authenticate with Google Cloud (both user and app-default)
  gcloud login        Authenticate with Google Cloud (user account only)
  gcloud app-login    Authenticate with Google Cloud (application default only)

Examples:
  dev auth                    # Authenticate with Google Cloud (both types)
  dev auth gcloud             # Authenticate with Google Cloud (both types)
  dev auth gcloud login       # Google Cloud user authentication only
  dev auth gcloud app-login   # Google Cloud application-default only
  `,

  arguments: [
    arg("service", "Service to authenticate with (gcloud)", { required: false }),
    arg("subcommand", "Subcommand for gcloud (login, app-login)", { required: false }),
  ],

  async exec(context) {
    const { logger } = context;

    const service = getArg(context, "service");
    const subcommand = getArg(context, "subcommand");

    // Helper functions
    const handleGcloudLogin = async () => {
      logger.info("🔑 Attempting Google Cloud user authentication...");
      try {
        await executeCommand("gcloud", ["auth", "login", "--quiet"], logger);
      } catch (error) {
        logger.info("💡 If 'gcloud' is not installed, install it first: https://cloud.google.com/sdk/docs/install");
      }
    };

    const handleGcloudAppLogin = async () => {
      logger.info("🔑 Attempting Google Cloud application-default authentication...");
      try {
        await executeCommand("gcloud", ["auth", "application-default", "login", "--quiet"], logger);
      } catch (error) {
        logger.info("💡 If 'gcloud' is not installed, install it first: https://cloud.google.com/sdk/docs/install");
      }
    };

    if (!service) {
      // No specific service specified, attempt Google Cloud authentication
      logger.info("🚀 Starting Google Cloud authentication process...");

      logger.info("🔄 --- Google Cloud User Login ---");
      await handleGcloudLogin();

      logger.info("🔄 --- Google Cloud Application-Default Login ---");
      await handleGcloudAppLogin();

      logger.success("✅ Google Cloud authentication processes attempted. Please check the output for status.");
      return;
    }

    // Validate service choice
    const validServices = ["gcloud"];
    const serviceChoice = validateChoice(context, "service", validServices);

    switch (serviceChoice) {
      case "gcloud":
        if (subcommand === "app-login") {
          await handleGcloudAppLogin();
        } else if (subcommand === "login") {
          await handleGcloudLogin();
        } else {
          logger.info("🔑 Starting Google Cloud authentication...");
          await handleGcloudLogin();
          logger.info("🔄 --- Next: Google Cloud Application-Default Login ---");
          await handleGcloudAppLogin();
        }
        break;
    }
  },
};
