import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { type CliCommandSpec, type CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { MiseService } from "../../domain/ports/Mise";

// Interface removed - services now accessed via Effect Context

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

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const mise = yield* MiseService;
      const fileSystem = yield* FileSystemService;

      yield* Effect.logInfo("Setting up development environment...");

      // Check mise installation - attempt to get installation info
      const miseInfo = yield* Effect.either(mise.checkInstallation());

      if (miseInfo._tag === "Left") {
        yield* Effect.log("WARN: Mise is not installed. Installing...");
        yield* mise.install();
        yield* Effect.logInfo("✅ Mise installed successfully");
      } else {
        yield* Effect.logInfo(`Mise version: ${miseInfo.right.version}`);
      }

      // Get current working directory
      const cwd = yield* fileSystem.getCwd();

      // Install tools for the current directory
      yield* Effect.logInfo("Installing development tools...");

      yield* mise.installTools(cwd);

      yield* Effect.logInfo("✅ Development environment setup complete!");
    });
  },
};
