import { NodeSdk } from "@effect/opentelemetry";
import { BunRuntime } from "@effect/platform-bun";
import { ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions";
import { Cause, Effect, Layer } from "effect";

import { registerAllCommands, runCli } from "~/bootstrap/cli-router";
import { CommandRegistry } from "~/bootstrap/command-registry-port";
import { setupApplication } from "~/bootstrap/wiring";
import { CommandTracker } from "~/capabilities/analytics/command-tracking-service";
import type { DevError } from "~/core/errors";
import { Tracing } from "~/core/observability/tracing-port";
import { Version } from "~/core/runtime/version-port";
import { UpdateChecker } from "~/features/upgrade/update-check-service";

export type ProgramError = DevError;

export const handleProgramError = (error: ProgramError): Effect.Effect<number, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logError(`❌ ${error._tag}: ${error.message}`);
    return error.exitCode;
  });

export const handleProgramCause = (cause: Cause.Cause<unknown>): Effect.Effect<number, never, never> =>
  Effect.gen(function* () {
    if (Cause.isInterruptedOnly(cause)) {
      yield* Effect.logDebug("💡 Shutdown initiated by user interrupt (Ctrl+C)");
      return 130;
    }

    yield* Effect.logError(`❌ Unexpected error: ${String(cause)}`);
    return 1;
  });

export const program = Effect.scoped(
  Effect.gen(function* () {
    // Add shutdown finalizer for graceful cleanup
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logDebug("🔧 Cleaning up resources...");
        yield* Effect.logDebug("✅ Cleanup complete");
      }).pipe(Effect.withSpan("cleanup")),
    );

    // Run CLI with services provided from the outside
    const commandExitCode = yield* Effect.gen(function* () {
      // Get services
      const commandTracker = yield* CommandTracker;
      const updateChecker = yield* UpdateChecker;
      const versionService = yield* Version;
      const registry = yield* CommandRegistry;
      const version = yield* versionService.getVersion();

      // Register all commands
      yield* registerAllCommands;

      // Trigger periodic background auto-upgrade when applicable
      yield* updateChecker.runPeriodicUpgradeCheck().pipe(Effect.withSpan("upgrade.periodic_check"));

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

      const cliExitCode = yield* cliExecution.pipe(
        Effect.as(0),
        Effect.catchAll(handleProgramError),
        Effect.catchAllCause(handleProgramCause),
      );

      yield* commandTracker
        .completeCommandRun(runId, cliExitCode)
        .pipe(Effect.catchAll((error) => Effect.logWarning(`Failed to complete command run tracking: ${error._tag}`)));

      return cliExitCode;
    }).pipe(Effect.withSpan("cli.execute"));

    if (commandExitCode === 130) {
      yield* Effect.annotateCurrentSpan("application.shutdown.reason", "user_interrupt");
    }

    yield* Effect.logDebug("✅ CLI execution completed");
    return commandExitCode;
  }).pipe(Effect.withSpan("cli.main")),
).pipe(Effect.catchAll(handleProgramError), Effect.catchAllCause(handleProgramCause));

// Create the main program with tracing
export const mainProgram = Effect.gen(function* () {
  // Setup application and get the app layer
  const setup = yield* setupApplication();
  const appLayer = setup.appLayer;

  // Get tracing configuration from the tracing service
  const sdkConfig = yield* Effect.gen(function* () {
    const tracing = yield* Tracing;
    return yield* tracing.createSdkConfig();
  }).pipe(
    Effect.provide(appLayer),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`Failed to initialize tracing configuration, using defaults: ${error.message}`);
        return {
          resource: {
            serviceName: "cli",
            serviceVersion: "0.0.1",
            attributes: {
              [ATTR_SERVICE_NAMESPACE]: "dev",
            },
          },
          spanProcessor: undefined, // Will use default NoopSpanProcessor
        };
      }),
    ),
  );

  // Create tracing layer with the configuration
  const TracingLive = NodeSdk.layer(() => sdkConfig);

  // Run the program with tracing
  return yield* program.pipe(Effect.provide(Layer.mergeAll(TracingLive, appLayer)));
}).pipe(Effect.scoped, Effect.catchAll(handleProgramError), Effect.catchAllCause(handleProgramCause));

// Run the program with BunRuntime
export const runMainProgram = () =>
  BunRuntime.runMain(
    mainProgram.pipe(
      Effect.tap((code) =>
        Effect.sync(() => {
          process.exitCode = code;
        }),
      ),
      Effect.asVoid,
    ) as Effect.Effect<void, never, never>,
  );

if (import.meta.main) {
  runMainProgram();
}
