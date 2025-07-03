import { Effect } from "effect";

import { exitCode, statusCheckError, unknownError, type DevError } from "../../domain/errors";
import { type CliCommandSpec, type CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { GitService } from "../../domain/ports/Git";
import { MiseService } from "../../domain/ports/Mise";
import { NetworkService } from "../../domain/ports/Network";

// Interface removed - services now accessed via Effect Context

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

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const mise = yield* MiseService;
      const git = yield* GitService;
      const network = yield* NetworkService;
      const fileSystem = yield* FileSystemService;
      const jsonOutput = context.options.json;

      const statusItems: StatusItem[] = [];

      // Run all checks in parallel for better performance
      const [miseResult, gitResult, networkResult, filesystemResult] = yield* Effect.all(
        [
          Effect.either(mise.checkInstallation()),
          Effect.either(git.getCurrentCommitSha()),
          Effect.either(network.checkConnectivity("https://github.com")),
          Effect.either(
            Effect.gen(function* () {
              const baseDir = "~/src"; // TODO: Get from config when config service is available
              const resolvedPath = fileSystem.resolvePath(baseDir);
              const exists = yield* fileSystem.exists(resolvedPath);
              return { baseDir, exists };
            }),
          ),
        ],
        { concurrency: "unbounded" },
      );

      // Process Mise result
      if (miseResult._tag === "Left") {
        statusItems.push({
          component: "mise",
          status: "error",
          message: "Mise is not installed or not working",
          details: miseResult.left,
        });
      } else {
        statusItems.push({
          component: "mise",
          status: "ok",
          message: `Mise ${miseResult.right.version} is installed`,
          details: miseResult.right,
        });
      }

      // Process Git result
      if (gitResult._tag === "Left") {
        statusItems.push({
          component: "git",
          status: "error",
          message: "Git is not available or not in a git repository",
          details: gitResult.left,
        });
      } else {
        statusItems.push({
          component: "git",
          status: "ok",
          message: "Git is available",
          details: { currentSha: gitResult.right },
        });
      }

      // Process Network result
      if (networkResult._tag === "Left") {
        statusItems.push({
          component: "network",
          status: "error",
          message: "Failed to check network connectivity",
          details: networkResult.left,
        });
      } else {
        const isConnected = networkResult.right;
        statusItems.push({
          component: "network",
          status: isConnected ? "ok" : "warning",
          message: isConnected ? "Network connectivity is good" : "Network connectivity issues detected",
        });
      }

      // Process filesystem result

      if (filesystemResult._tag === "Left") {
        statusItems.push({
          component: "filesystem",
          status: "error",
          message: "Failed to check file system status",
          details: filesystemResult.left,
        });
      } else {
        const { baseDir, exists } = filesystemResult.right;
        if (exists) {
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
      }

      // Output results
      if (jsonOutput) {
        // Use Effect's logging system for consistent output handling
        yield* Effect.logInfo(JSON.stringify(statusItems, null, 2));
      } else {
        yield* Effect.logInfo("System Status:");
        yield* Effect.logInfo("");

        for (const item of statusItems) {
          const icon = item.status === "ok" ? "✅" : item.status === "warning" ? "⚠️" : "❌";
          yield* Effect.logInfo(`${icon} ${item.component}: ${item.message}`);
        }

        yield* Effect.logInfo("");

        const errorCount = statusItems.filter((item) => item.status === "error").length;
        const warningCount = statusItems.filter((item) => item.status === "warning").length;

        if (errorCount > 0) {
          yield* Effect.logError(`❌ ERROR: Found ${errorCount} error(s) and ${warningCount} warning(s)`);
        } else if (warningCount > 0) {
          yield* Effect.logWarning(`WARN: ⚠️ Found ${warningCount} warning(s)`);
        } else {
          yield* Effect.logInfo("✅ All systems are operational");
        }
      }

      // Exit with error code if there are errors (as specified in the spec)
      const hasErrors = statusItems.some((item) => item.status === "error");
      if (hasErrors) {
        const failedComponents = statusItems.filter((item) => item.status === "error").map((item) => item.component);

        const errorCount = statusItems.filter((item) => item.status === "error").length;
        const warningCount = statusItems.filter((item) => item.status === "warning").length;

        return yield* Effect.fail(
          statusCheckError(`Found ${errorCount} error(s) and ${warningCount} warning(s)`, failedComponents),
        );
      }
    });
  },
};
