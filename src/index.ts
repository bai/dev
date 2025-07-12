import { Command } from "@effect/cli";
import { NodeSdk } from "@effect/opentelemetry";
import { BunRuntime } from "@effect/platform-bun";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect } from "effect";

import { cdCommand } from "./app/cd-command";
import { cloneCommand } from "./app/clone-command";
import { CommandTrackerTag } from "./app/command-tracking-service";
import { runCommand } from "./app/run-command";
import { statusCommand } from "./app/status-command";
import { upCommand } from "./app/up-command";
import { upgradeCommand } from "./app/upgrade-command";
import { VersionTag } from "./app/version-service";
import { setupApplication } from "./app-layer";
import { exitCode, extractErrorMessage, type DevError } from "./domain/errors";

// Create main command with all subcommands
const mainCommand = Command.make("dev", {}, () => Effect.logInfo("Use --help to see available commands")).pipe(
  Command.withSubcommands([
    cdCommand,
    cloneCommand,
    upCommand,
    runCommand,
    statusCommand,
    upgradeCommand,
  ]),
);

/**
 * CLI application runner that executes Effect CLI commands with proper error handling
 * @param mainCommand - The main CLI command to execute
 * @param metadata - CLI metadata including name, version, and description
 * @returns Effect that never fails (errors are caught and logged)
 */
const runCli = (
  mainCommand: Command.Command<string, any, any, any>,
  metadata: {
    name: string;
    version: string;
    description?: string;
  },
): Effect.Effect<void, never, any> => {
  const cli = Command.run(mainCommand, {
    name: metadata.description || metadata.name,
    version: metadata.version,
  });

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

      // Get args (trim node and script name from argv)
      const args = process.argv.slice(2);

      // Execute CLI effect directly - cli() returns an Effect
      yield* cli(["node", "script", ...args]);

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
          yield* Effect.annotateCurrentSpan("shutdown_reason", "user_interrupt");
        }
        yield* Effect.logDebug("✅ Cleanup complete");
      }).pipe(Effect.withSpan("cleanup")),
    );

    // Setup application
    yield* Effect.logDebug("🚀 Starting dev CLI...");
    const { appLayer } = yield* setupApplication().pipe(Effect.withSpan("setup-application"));

    // Run CLI with services from appLayer
    yield* Effect.gen(function* () {
      // Get services
      const commandTracker = yield* CommandTrackerTag;
      const versionService = yield* VersionTag;
      const version = yield* versionService.getVersion;

      // Add cleanup for command tracker
      yield* Effect.addFinalizer(() => commandTracker.gracefulShutdown().pipe(Effect.catchAll(() => Effect.void)));

      // Track CLI metadata
      yield* Effect.annotateCurrentSpan("cli_name", "dev");
      yield* Effect.annotateCurrentSpan("cli_version", version);

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
      const cliExecution = runCli(mainCommand as any, {
        name: "dev",
        version: version,
        description: "A CLI tool for quick navigation and environment management",
      }).pipe(Effect.withSpan("run-cli"));

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
    }).pipe(Effect.provide(appLayer), Effect.withSpan("cli-execution"));

    yield* Effect.logDebug("✅ CLI execution completed");
  }).pipe(Effect.withSpan("dev-cli-main")),
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

// Tracing configuration
const TracingLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: "dev-cli",
    serviceVersion: "0.0.1",
  },
  spanProcessor:
    process.env.NODE_ENV === "development"
      ? new BatchSpanProcessor(new ConsoleSpanExporter())
      : new NoopSpanProcessor(),
}));

// Run the program with BunRuntime and tracing
BunRuntime.runMain(program.pipe(Effect.provide(TracingLive)));
