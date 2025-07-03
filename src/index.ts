#!/usr/bin/env bun
import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";

import { createDevCli } from "./cli/wiring";
import { exitCode, unknownError, type DevError } from "./domain/errors";

const program = Effect.gen(function* () {
  // Create CLI instance
  const cli = createDevCli();

  // Set program metadata
  cli.setMetadata({
    name: "dev",
    description: "A CLI tool for quick directory navigation and environment management",
    version: "2.0.0",
  });

  // Parse and execute command (trim node and script name from argv)
  let args = process.argv.slice(2);

  // Show help when no command is provided
  if (args.length === 0) {
    args = ["help"];
  }

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
}).pipe(
  Effect.catchAll((error: DevError) => {
    // Handle errors and set appropriate exit codes
    return Effect.gen(function* () {
      yield* Effect.logError(`❌ ${error._tag}: ${JSON.stringify(error)}`);
      yield* Effect.sync(() => {
        process.exitCode = exitCode(error);
      });
    });
  }),
);

// Use BunRuntime.runMain for proper resource cleanup and graceful shutdown
BunRuntime.runMain(program);
