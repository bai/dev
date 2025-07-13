import { Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag } from "../domain/command-registry-port";
import { FileSystemTag } from "../domain/file-system-port";
import { MiseTag } from "../domain/mise-port";

/**
 * Display help for the up command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Install and update development tools using mise\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev up\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev up                     # Install all tools from .mise.toml");
    yield* Effect.logInfo("  dev up                     # Update existing tools to required versions\n");
  });

// Create the up command using @effect/cli (no arguments needed)
export const upCommand = Command.make("up", {}, () =>
  Effect.gen(function* () {
    const mise = yield* MiseTag;
    const fileSystem = yield* FileSystemTag;

    yield* Effect.logInfo("Setting up development environment...");

    // Check mise installation - attempt to get installation info
    const miseInfo = yield* Effect.either(mise.checkInstallation()).pipe(Effect.withSpan("mise.check_installation"));

    if (miseInfo._tag === "Left") {
      yield* Effect.logWarning("⚠️ Mise is not installed. Installing...");
      yield* mise.install().pipe(Effect.withSpan("mise.install"));
      yield* Effect.logInfo("✅ Mise installed successfully");
    } else {
      yield* Effect.logInfo(`Mise version: ${miseInfo.right.version}`);
    }

    // Get current working directory
    const cwd = yield* fileSystem.getCwd().pipe(Effect.withSpan("filesystem.get_cwd"));
    yield* Effect.annotateCurrentSpan("cwd", cwd);

    // Install tools for the current directory
    yield* Effect.logInfo("Installing development tools...");

    yield* mise.installTools(cwd).pipe(Effect.withSpan("mise.install_tools"));

    yield* Effect.logInfo("✅ Development environment setup complete!");
  }).pipe(Effect.withSpan("up.execute")),
);

/**
 * Register the up command with the command registry
 */
export const registerUpCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "up",
    command: upCommand as Command.Command<string, never, any, any>,
    displayHelp,
  });
});
