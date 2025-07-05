#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { HealthCheckSchedulerServiceTag } from "./app/services/HealthCheckSchedulerService";
import { VersionServiceTag } from "./app/services/VersionService";
import { TracingLive } from "./config/tracing";
import { exitCode, type DevError } from "./domain/errors";
import { getMainCommand, setupApplicationWithConfig } from "./wiring";

// CLI application runner (moved from cli/effect-cli.ts)
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
          yield* Effect.logError(`❌ CLI error: ${String(error)}`);
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
        // Log interruption if it was caused by signal
        if (process.exitCode === 130) {
          yield* Effect.logDebug("💡 Shutdown initiated by user interrupt (Ctrl+C)");
          yield* Effect.annotateCurrentSpan("shutdown_reason", "user_interrupt");
        }
        yield* Effect.logDebug("✅ Cleanup complete");
      }).pipe(Effect.withSpan("cleanup")),
    );

    // Log application start
    yield* Effect.logDebug("🚀 Starting dev CLI with Effect CLI...");

    // Setup application layers
    const { appLayer } = yield* setupApplicationWithConfig().pipe(Effect.withSpan("setup-application"));

    // Get the main command
    const mainCommand = getMainCommand();

    // Run the CLI with version from VersionService - provide appLayer first
    yield* Effect.gen(function* () {
      // Get version from VersionService (now within appLayer context)
      const versionService = yield* VersionServiceTag;
      const version = yield* versionService.getVersion;
      
      // Annotate span with CLI information
      yield* Effect.annotateCurrentSpan("cli_name", "dev");
      yield* Effect.annotateCurrentSpan("cli_version", version);

      // Run the CLI with metadata
      yield* runCli(mainCommand as any, {
        name: "dev",
        version: version,
        description: "A CLI tool for quick navigation and environment management",
      }).pipe(Effect.withSpan("run-cli"));

      // After CLI execution completes, schedule background health checks
      const healthScheduler = yield* HealthCheckSchedulerServiceTag;
      yield* healthScheduler
        .scheduleHealthChecks()
        .pipe(
          Effect.catchAll((error) => Effect.logWarning(`Health check scheduling failed: ${error.message}`)),
          Effect.withSpan("health-check-scheduling")
        );
    }).pipe(Effect.provide(appLayer), Effect.withSpan("cli-execution"));

    yield* Effect.logDebug("✅ CLI execution completed successfully");
  }).pipe(Effect.withSpan("dev-cli-main")),
).pipe(
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      // Try to handle as DevError first
      if (error && typeof error === "object" && "_tag" in error) {
        const devError = error as DevError;
        yield* Effect.logError(`❌ ${devError._tag}: ${String(devError)}`);
        yield* Effect.sync(() => {
          process.exitCode = exitCode(devError);
        });
      } else {
        // Handle unknown errors
        yield* Effect.logError(`❌ Unknown error: ${String(error)}`);
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

// Run the program with BunRuntime and tracing
BunRuntime.runMain(program.pipe(Effect.provide(TracingLive)));
