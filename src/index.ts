import { Command } from "@effect/cli";
import { NodeSdk } from "@effect/opentelemetry";
import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

import { registerCdCommand } from "./app/cd-command";
import { registerCloneCommand } from "./app/clone-command";
import { CommandTrackerTag } from "./app/command-tracking-service";
import { registerRunCommand } from "./app/run-command";
import { registerStatusCommand } from "./app/status-command";
import { registerUpCommand } from "./app/up-command";
import { registerUpgradeCommand } from "./app/upgrade-command";
import { CommandRegistryTag, type CommandRegistry } from "./domain/command-registry-port";
import { exitCode, extractErrorMessage, type DevError } from "./domain/errors";
import { TracingTag } from "./domain/tracing-port";
import { VersionTag } from "./domain/version-port";
import { setupApplication } from "./wiring";

/**
 * Display help for the main dev command
 */
const displayMainHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("A CLI tool for quick navigation and environment management\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev <command> [options]\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev cd myproject           # Navigate to a project directory");
    yield* Effect.logInfo("  dev clone user/repo        # Clone a repository");
    yield* Effect.logInfo("  dev up                     # Install and update development tools");
    yield* Effect.logInfo("  dev status                 # Check environment health");
    yield* Effect.logInfo("  dev run start              # Execute project tasks\n");

    yield* Effect.logInfo("COMMANDS");
    yield* Effect.logInfo("  cd           Navigate to directories using fuzzy search");
    yield* Effect.logInfo("  clone        Clone repositories from various providers");
    yield* Effect.logInfo("  up           Install and update development tools using mise");
    yield* Effect.logInfo("  run          Execute project tasks and scripts using mise");
    yield* Effect.logInfo("  status       Check the health of your development environment");
    yield* Effect.logInfo("  upgrade      Upgrade the dev CLI tool and essential tools\n");

    yield* Effect.logInfo("Use 'dev <command> --help' for command-specific help.\n");
  });

/**
 * Register all commands with the command registry
 */
const registerAllCommands: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  yield* registerCdCommand;
  yield* registerCloneCommand;
  yield* registerUpCommand;
  yield* registerRunCommand;
  yield* registerStatusCommand;
  yield* registerUpgradeCommand;
});

/**
 * Check if help was requested and display appropriate help
 */
const checkAndDisplayHelp = (
  args: readonly string[],
  registry: CommandRegistry,
): Effect.Effect<boolean, never, never> =>
  Effect.gen(function* () {
    const hasHelp = args.includes("--help") || args.includes("-h");

    if (!hasHelp) {
      return false;
    }

    const firstArg = args[0];
    const commandName = firstArg && !firstArg.startsWith("-") ? firstArg : undefined;

    if (commandName) {
      const command = yield* registry.getByName(commandName);
      if (command) {
        yield* command.displayHelp();
      } else {
        yield* displayMainHelp();
      }
    } else {
      yield* displayMainHelp();
    }

    return true;
  });

/**
 * Create the main command dynamically from the registry
 */
const createMainCommand = (
  registry: CommandRegistry,
): Effect.Effect<Command.Command<"dev", any, any, any>, never, never> =>
  Effect.gen(function* () {
    const commands = yield* registry.getCommands();
    // TypeScript requires a non-empty array for withSubcommands
    // We know we have commands registered, so this cast is safe
    const nonEmptyCommands = commands as unknown as readonly [
      Command.Command<any, any, any, any>,
      ...Command.Command<any, any, any, any>[],
    ];
    return Command.make("dev", {}, () => Effect.logInfo("Use --help to see available commands")).pipe(
      Command.withSubcommands(nonEmptyCommands),
    );
  });

/**
 * CLI application runner that executes Effect CLI commands with proper error handling
 * @param registry - The command registry to build commands from
 * @param metadata - CLI metadata including name, version, and description
 * @returns Effect that never fails (errors are caught and logged)
 */
const runCli = (
  registry: CommandRegistry,
  metadata: {
    name: string;
    version: string;
    description?: string;
  },
): Effect.Effect<void, never, any> => {
  return Effect.scoped(
    Effect.gen(function* () {
      // Add shutdown finalizer for graceful cleanup
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.logDebug("🔧 Cleaning up CLI resources...");
          if (process.exitCode === 130) {
            yield* Effect.logDebug("💡 Shutdown initiated by user interrupt (Ctrl+C)");
          }
          yield* Effect.logDebug("✅ CLI cleanup complete");
        }),
      );

      yield* Effect.logDebug("🚀 Starting Effect CLI...");

      // Get args (just the command arguments, not executable/script)
      const args = process.argv.slice(2);

      // Check for help flags and show custom help instead
      const helpDisplayed = yield* checkAndDisplayHelp(args, registry);

      if (helpDisplayed) {
        // Custom help was displayed, exit gracefully
        return;
      }

      // Create the main command from registry
      const mainCommand = yield* createMainCommand(registry);

      // Create CLI runner
      const cli = Command.run(mainCommand, {
        name: metadata.name,
        version: metadata.version,
      });

      // Execute CLI effect directly - cli() returns an Effect
      // Pass the full process.argv since @effect/cli expects it
      yield* cli(process.argv);

      yield* Effect.logDebug("✅ CLI execution completed successfully");
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const errorMessage = extractErrorMessage(error);
          yield* Effect.logError(`❌ CLI error: ${errorMessage}`);
          yield* Effect.sync(() => {
            process.exitCode = 1;
          });
        }),
      ),
    ),
  );
};

const program = Effect.scoped(
  Effect.gen(function* () {
    // Add shutdown finalizer for graceful cleanup
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logDebug("🔧 Cleaning up resources...");
        if (process.exitCode === 130) {
          yield* Effect.logDebug("💡 Shutdown initiated by user interrupt (Ctrl+C)");
          yield* Effect.annotateCurrentSpan("application.shutdown.reason", "user_interrupt");
        }
        yield* Effect.logDebug("✅ Cleanup complete");
      }).pipe(Effect.withSpan("cleanup")),
    );

    // Run CLI with services provided from the outside
    yield* Effect.gen(function* () {
      // Get services
      const commandTracker = yield* CommandTrackerTag;
      const versionService = yield* VersionTag;
      const registry = yield* CommandRegistryTag;
      const version = yield* versionService.getVersion;

      // Register all commands
      yield* registerAllCommands;

      // Add cleanup for command tracker
      yield* Effect.addFinalizer(() => commandTracker.gracefulShutdown().pipe(Effect.catchAll(() => Effect.void)));

      // Record command run
      const runId = yield* commandTracker.recordCommandRun().pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Failed to record command run: ${error._tag}`);
            return "unknown-run-id";
          }),
        ),
      );

      // Execute CLI
      const cliExecution = runCli(registry, {
        name: "dev",
        version: version,
        description: "A CLI tool for quick navigation and environment management",
      }).pipe(Effect.withSpan("cli.run"));

      yield* cliExecution.pipe(
        Effect.tap(() =>
          commandTracker
            .completeCommandRun(runId, typeof process.exitCode === "number" ? process.exitCode : 0)
            .pipe(
              Effect.catchAll((error) => Effect.logWarning(`Failed to complete command run tracking: ${error._tag}`)),
            ),
        ),
        Effect.tapError(() =>
          commandTracker
            .completeCommandRun(runId, typeof process.exitCode === "number" ? process.exitCode : 1)
            .pipe(
              Effect.catchAll((error) => Effect.logWarning(`Failed to complete command run tracking: ${error._tag}`)),
            ),
        ),
      );
    }).pipe(Effect.withSpan("cli.execute"));

    yield* Effect.logDebug("✅ CLI execution completed");
  }).pipe(Effect.withSpan("cli.main")),
).pipe(
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      // Try to handle as DevError first
      if (error && typeof error === "object" && "_tag" in error) {
        const devError = error as DevError;
        yield* Effect.logError(`❌ ${devError._tag}: ${extractErrorMessage(devError)}`);
        yield* Effect.sync(() => {
          process.exitCode = exitCode(devError);
        });
      } else {
        // Handle unknown errors
        const errorMessage = extractErrorMessage(error);
        yield* Effect.logError(`❌ Unknown error: ${errorMessage}`);
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
      }
    }),
  ),
  Effect.catchAllCause((cause) =>
    Effect.gen(function* () {
      yield* Effect.logError(`❌ Unexpected error: ${String(cause)}`);
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
    }),
  ),
) as Effect.Effect<void, never, never>;

// Create the main program with tracing
const mainProgram = Effect.gen(function* () {
  // Setup application and get the app layer
  const { appLayer } = yield* setupApplication();

  // Get tracing configuration from the tracing service
  const sdkConfig = yield* Effect.gen(function* () {
    const tracing = yield* TracingTag;
    return yield* tracing.createSdkConfig();
  }).pipe(
    Effect.provide(appLayer),
    Effect.catchAll((error) => {
      console.warn("Failed to initialize tracing configuration, using defaults:", error);
      return Effect.succeed({
        resource: {
          serviceName: "dev-cli",
          serviceVersion: "0.0.1",
        },
        spanProcessor: undefined, // Will use default NoopSpanProcessor
      });
    }),
  );

  // Create tracing layer with the configuration
  const TracingLive = NodeSdk.layer(() => sdkConfig);

  // Run the program with tracing
  yield* program.pipe(Effect.provide(Layer.mergeAll(TracingLive, appLayer)));
}).pipe(Effect.scoped);

// Run the program with BunRuntime
BunRuntime.runMain(mainProgram as Effect.Effect<void, never, never>);
