#!/usr/bin/env bun
import { Cause, Effect, Exit, Runtime } from "effect";

import { createCliAdapter } from "./cli/wiring";
import { exitCode, type DevError } from "./domain/errors";

const program = Effect.gen(function* () {
  // Create CLI adapter
  const adapter = createCliAdapter();

  // Set program metadata
  adapter.setMetadata({
    name: "dev",
    description: "A CLI tool for quick directory navigation and environment management",
    version: "2.0.0",
  });

  // Show help when no command is provided
  if (process.argv.slice(2).length === 0) {
    process.argv.push("help");
  }

  // Parse and execute command
  yield* Effect.tryPromise({
    try: () => adapter.parseAndExecute(process.argv),
    catch: (error) => {
      // Convert unknown errors to DevError
      if (error && typeof error === "object" && "_tag" in error) {
        return error as DevError;
      }
      return { _tag: "UnknownError", reason: error } as const;
    },
  });
});

async function main() {
  const runtime = Runtime.defaultRuntime;
  const exit = await Runtime.runPromiseExit(runtime)(program);

  Exit.match(exit, {
    onSuccess: () => {
      // Successful execution
      process.exitCode = 0;
    },
    onFailure: (cause) => {
      // Handle failures using Cause.failureOrCause
      const failureOrCause = Cause.failureOrCause(cause);
      if (failureOrCause._tag === "Left") {
        // It's a failure (error)
        const error = failureOrCause.left;
        if (error && typeof error === "object" && "_tag" in error) {
          const devError = error as DevError;
          console.error(`❌ ${devError._tag}: ${JSON.stringify(devError)}`);
          process.exitCode = exitCode(devError);
        } else {
          console.error(`❌ Error:`, error);
          process.exitCode = 1;
        }
      } else {
        // It's a defect (unexpected error)
        console.error(`💥 Unexpected error:`, failureOrCause.right);
        process.exitCode = 1;
      }
    },
  });
}

main();
