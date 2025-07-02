import type { DevCommand } from "~/lib/core/command-types";
import { arg, getArg } from "~/lib/core/command-utils";

// Define valid service choices
const validServices = ["github", "gitlab", "gcloud", "all"] as const;
type ServiceChoice = (typeof validServices)[number];

async function executeCommand(command: string, args: string[], logger: any): Promise<void> {
  try {
    const process = Bun.spawn([command, ...args], {
      stdio: ["inherit", "inherit", "inherit"],
    });

    const exitCode = await process.exited;

    if (exitCode === 0) {
      logger.success(`'${command} ${args.join(" ")}' executed successfully.`);
    } else {
      logger.error(`'${command} ${args.join(" ")}' exited with code ${exitCode}.`);
    }
  } catch (err: any) {
    logger.error(`Failed to start '${command} ${args.join(" ")}':`, err.message);
    if (err.code === "ENOENT") {
      logger.error(`The command '${command}' was not found. Please ensure it is installed and in your PATH.`);
    }
    // Continue execution to allow subsequent auth attempts
  }
}

export const authCommand: DevCommand = {
  name: "auth",
  description: "Authenticate with various development services",
  help: `
The auth command helps you authenticate with development services:

Available Services:
  github                  # Authenticate with GitHub CLI
  gitlab                  # Authenticate with GitLab CLI
  gcloud                  # Authenticate with Google Cloud CLI
  all                     # Authenticate with all services

Examples:
  dev auth github         # Authenticate with GitHub only
  dev auth all            # Authenticate with all services
  dev auth                # Interactive service selection
  `,

  arguments: [
    arg("service", "Service to authenticate with (github, gitlab, gcloud, all)", { required: false }),
  ],

  async exec(context) {
    const { logger } = context;

    const serviceArg = getArg(context, "service");

    // If no service specified, prompt for selection
    if (!serviceArg) {
      logger.info("🔐 Available authentication services:");
      logger.info("  github  - GitHub CLI authentication");
      logger.info("  gitlab  - GitLab CLI authentication");
      logger.info("  gcloud  - Google Cloud CLI authentication");
      logger.info("  all     - Authenticate with all services");
      logger.info("");
      logger.info("💡 Run: dev auth <service> to authenticate with a specific service");
      return;
    }

    // Validate service choice
    if (!validServices.includes(serviceArg as ServiceChoice)) {
      throw new Error(`Invalid service: ${serviceArg}. Must be one of: ${validServices.join(", ")}`);
    }

    const serviceChoice = serviceArg as ServiceChoice;

    // Helper functions
    const handleGithubAuth = async () => {
      logger.info("🔑 Attempting GitHub CLI authentication...");
      try {
        await executeCommand("gh", ["auth", "login"], logger);
      } catch (error) {
        logger.info("💡 If 'gh' is not installed, install it first: https://cli.github.com/");
      }
    };

    const handleGitlabAuth = async () => {
      logger.info("🔑 Attempting GitLab CLI authentication...");
      try {
        await executeCommand("glab", ["auth", "login"], logger);
      } catch (error) {
        logger.info("💡 If 'glab' is not installed, install it first: https://gitlab.com/gitlab-org/cli");
      }
    };

    const handleGcloudAuth = async () => {
      logger.info("🔑 Attempting Google Cloud user authentication...");
      try {
        await executeCommand("gcloud", ["auth", "login", "--quiet"], logger);
        logger.info("🔑 Attempting Google Cloud application-default authentication...");
        await executeCommand("gcloud", ["auth", "application-default", "login", "--quiet"], logger);
      } catch (error) {
        logger.info("💡 If 'gcloud' is not installed, install it first: https://cloud.google.com/sdk/docs/install");
      }
    };

    switch (serviceChoice) {
      case "github":
        await handleGithubAuth();
        break;
      case "gitlab":
        await handleGitlabAuth();
        break;
      case "gcloud":
        await handleGcloudAuth();
        break;
      case "all":
        logger.info("🚀 Starting authentication for all services...");
        await handleGithubAuth();
        await handleGitlabAuth();
        await handleGcloudAuth();
        logger.success("✅ All authentication processes attempted. Please check the output for status.");
        break;
    }
  },
};
