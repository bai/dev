import type { DevCommand } from "~/types/command";

export const helpCommand: DevCommand = {
  name: "help",
  description: "Shows help information for all available commands",
  help: `
The help command displays usage information for the dev CLI:

- Lists all available commands with descriptions
- Shows usage examples and tips
- Provides guidance on getting started

Examples:
  dev help                # Show general help
  dev --help              # Same as help
  dev -h                  # Same as help
  `,

  async exec(context) {
    const { logger, config } = context;

    logger.info("🚀 dev: A CLI tool for quick directory navigation and environment management.");
    logger.info("");
    logger.info("📖 Usage:");

    // Get all commands from the registry through the command context
    const registry = (context as any).registry;
    if (registry) {
      const commands = registry.getVisible().sort((a: DevCommand, b: DevCommand) => a.name.localeCompare(b.name));

      for (const command of commands) {
        if (command.name === "help") continue; // Skip showing help for help command

        const aliasText = command.aliases ? ` (aliases: ${command.aliases.join(", ")})` : "";
        logger.info(`  dev ${command.name.padEnd(20)} ${command.description}${aliasText}`);
      }
    } else {
      // Fallback to hardcoded list if registry not available
      logger.info("  dev cd                     Navigate to a directory in ~/src");
      logger.info("  dev cd <folder_name>       Jump directly to matching directory");
      logger.info("  dev clone <repo>           Clone a repository with automatic provider detection");
      logger.info("  dev status                 Show comprehensive status and health check");
      logger.info("  dev auth                   Authenticate with GitHub, GitLab, and Google Cloud");
      logger.info("  dev up                     Install development tools for current project");
      logger.info("  dev run <task>             Run project tasks using mise");
      logger.info("  dev setup                  Set up the dev CLI environment");
      logger.info("  dev upgrade                Update the dev CLI tool");
    }

    logger.info("");
    logger.info("💡 Tips:");
    logger.info("  - Use 'dev cd' without arguments for interactive fuzzy search");
    logger.info("  - Clone repos with just the name if using default org: 'dev clone myrepo'");
    logger.info("  - Run 'dev up' in any git repository to set up development tools");
    logger.info("  - Use 'dev run <task>' to execute project-specific tasks with mise");
    logger.info("  - Use 'dev status' to check your environment setup and validate installation");
    logger.info("");
    logger.info("📚 For detailed help on a specific command, run: dev <command> --help");
  },
};
