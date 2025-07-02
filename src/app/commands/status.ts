import { exitCode } from "../../domain/errors";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Git } from "../../domain/ports/Git";
import type { Mise } from "../../domain/ports/Mise";
import type { Network } from "../../domain/ports/Network";

interface StatusContext extends CommandContext {
  mise: Mise;
  git: Git;
  fileSystem: FileSystem;
  network: Network;
}

interface StatusItem {
  component: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: any;
}

export const statusCommand: CliCommandSpec = {
  name: "status",
  aliases: ["doctor"],
  description: "Check system status and configuration",
  help: `
Check the status of your development environment:

Usage:
  dev status              # Show status information
  dev doctor              # Alias for status
  dev status --json       # Output status as JSON

This command checks:
- Mise installation and version
- Git configuration
- Network connectivity
- File system permissions
  `,

  options: [
    {
      flags: "--json",
      description: "Output status as JSON",
    },
  ],

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as StatusContext;
    const jsonOutput = ctx.options.json;

    const statusItems: StatusItem[] = [];

    // Check Mise
    try {
      const miseInfo = await ctx.mise.checkInstallation();

      if (typeof miseInfo === "object" && "_tag" in miseInfo) {
        statusItems.push({
          component: "mise",
          status: "error",
          message: "Mise is not installed or not working",
          details: miseInfo,
        });
      } else {
        statusItems.push({
          component: "mise",
          status: "ok",
          message: `Mise ${miseInfo.version} is installed`,
          details: miseInfo,
        });
      }
    } catch (error) {
      statusItems.push({
        component: "mise",
        status: "error",
        message: "Failed to check mise installation",
        details: error,
      });
    }

    // Check Git
    try {
      const gitVersion = await ctx.git.getCurrentCommitSha();

      if (typeof gitVersion === "object" && "_tag" in gitVersion) {
        statusItems.push({
          component: "git",
          status: "error",
          message: "Git is not available or not in a git repository",
          details: gitVersion,
        });
      } else {
        statusItems.push({
          component: "git",
          status: "ok",
          message: "Git is available",
          details: { currentSha: gitVersion },
        });
      }
    } catch (error) {
      statusItems.push({
        component: "git",
        status: "error",
        message: "Failed to check git status",
        details: error,
      });
    }

    // Check Network connectivity
    try {
      const isConnected = await ctx.network.checkConnectivity("https://github.com");

      statusItems.push({
        component: "network",
        status: isConnected ? "ok" : "warning",
        message: isConnected ? "Network connectivity is good" : "Network connectivity issues detected",
      });
    } catch (error) {
      statusItems.push({
        component: "network",
        status: "error",
        message: "Failed to check network connectivity",
        details: error,
      });
    }

    // Check file system permissions for base directory
    try {
      const baseDir = ctx.config.get("paths.base", "~/src");
      const resolvedPath = ctx.fileSystem.resolvePath(baseDir);

      if (await ctx.fileSystem.exists(resolvedPath)) {
        statusItems.push({
          component: "filesystem",
          status: "ok",
          message: `Base directory ${baseDir} exists and is accessible`,
        });
      } else {
        statusItems.push({
          component: "filesystem",
          status: "warning",
          message: `Base directory ${baseDir} does not exist`,
        });
      }
    } catch (error) {
      statusItems.push({
        component: "filesystem",
        status: "error",
        message: "Failed to check file system status",
        details: error,
      });
    }

    // Output results
    if (jsonOutput) {
      console.log(JSON.stringify(statusItems, null, 2));
    } else {
      ctx.logger.info("System Status:");
      ctx.logger.info("");

      for (const item of statusItems) {
        const icon = item.status === "ok" ? "✅" : item.status === "warning" ? "⚠️" : "❌";
        ctx.logger.info(`${icon} ${item.component}: ${item.message}`);
      }

      ctx.logger.info("");

      const errorCount = statusItems.filter((item) => item.status === "error").length;
      const warningCount = statusItems.filter((item) => item.status === "warning").length;

      if (errorCount > 0) {
        ctx.logger.error(`Found ${errorCount} error(s) and ${warningCount} warning(s)`);
      } else if (warningCount > 0) {
        ctx.logger.warn(`Found ${warningCount} warning(s)`);
      } else {
        ctx.logger.success("All systems are operational");
      }
    }

    // Exit with error code if there are errors (as specified in the spec)
    const hasErrors = statusItems.some((item) => item.status === "error");
    if (hasErrors) {
      // Set exit code via process.exitCode instead of process.exit()
      process.exitCode = 3; // As specified in the spec: "exits 3 if any error item"
    }
  },
};
