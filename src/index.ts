#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { exitCode, unknownError, type DevError } from "./domain/errors";
import { createDevCli, setupApplicationWithConfig } from "./wiring";

const program = Effect.scoped(
  Effect.gen(function* () {
    // Add shutdown finalizer for graceful cleanup
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logDebug("🔧 Cleaning up resources...");
        // Log interruption if it was caused by signal
        if (process.exitCode === 130) {
          yield* Effect.logDebug("💡 Shutdown initiated by user interrupt (Ctrl+C)");
        }
        yield* Effect.logDebug("✅ Cleanup complete");
      }),
    );

    // Log application start
    yield* Effect.logDebug("🚀 Starting dev CLI with dynamic configuration...");

    // Create CLI instance
    const cli = createDevCli();

    // Parse and execute command (trim node and script name from argv)
    let args = process.argv.slice(2);

    // Show help when no command is provided
    if (args.length === 0) {
      args = ["help"];
    }

    // Execute with the dynamically built app layer
    // Note: The CLI now handles its own dynamic layer setup internally
    yield* Effect.tryPromise({
      try: () => cli.parseAndExecute(args),
      catch: (error) => {
        // Convert unknown errors to DevError
        if (error && typeof error === "object" && "_tag" in error) {
          return error as DevError;
        }
        return unknownError(error);
      },
    });

    yield* Effect.logDebug("✅ Command execution completed successfully");
  }),
).pipe(
  Effect.catchAll((error: DevError) => {
    // Handle errors and set appropriate exit codes
    return Effect.gen(function* () {
      yield* Effect.logError(`❌ ${error._tag}: ${JSON.stringify(error)}`);
      yield* Effect.sync(() => {
        process.exitCode = exitCode(error);
      });
    });
  }),
  // Add interruption handling
  Effect.onInterrupt(() =>
    Effect.gen(function* () {
      yield* Effect.logDebug("⚠️  Received interrupt signal, cleaning up...");
      yield* Effect.sync(() => {
        process.exitCode = 130; // Standard exit code for SIGINT
      });
    }),
  ),
);

// Use BunRuntime.runMain for proper resource cleanup and graceful shutdown
// BunRuntime.runMain automatically handles SIGINT and SIGTERM for graceful interruption
BunRuntime.runMain(program);
