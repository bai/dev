import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Mise } from "../../domain/ports/Mise";

interface UpContext extends CommandContext {
  mise: Mise;
  fileSystem: FileSystem;
}

export const upCommand: CliCommandSpec = {
  name: "up",
  description: "Set up the development environment using mise",
  help: `
Set up your development environment:

Usage:
  dev up                  # Install tools for current directory

This command will:
1. Check if mise is installed
2. Install tools specified in .mise.toml or .tool-versions
3. Set up the development environment
  `,

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as UpContext;

    ctx.logger.info("Setting up development environment...");

    // Check mise installation
    const miseInfo = await ctx.mise.checkInstallation();

    if (typeof miseInfo === "object" && "_tag" in miseInfo) {
      ctx.logger.warn("Mise is not installed. Installing...");

      const installResult = await ctx.mise.install();
      if (typeof installResult === "object" && "_tag" in installResult) {
        ctx.logger.error(`Failed to install mise: ${installResult.reason}`);
        throw installResult;
      }

      ctx.logger.success("Mise installed successfully");
    } else {
      ctx.logger.info(`Mise version: ${miseInfo.version}`);
    }

    // Get current working directory
    const cwd = await ctx.fileSystem.getCwd();

    // Install tools for the current directory
    ctx.logger.info("Installing development tools...");

    const installResult = await ctx.mise.installTools(cwd);

    if (typeof installResult === "object" && "_tag" in installResult) {
      ctx.logger.error(`Failed to install tools: ${installResult.reason}`);
      throw installResult;
    }

    ctx.logger.success("Development environment setup complete!");
  },
};
