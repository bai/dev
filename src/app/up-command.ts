import { Command } from "@effect/cli";
import { Effect } from "effect";

import { FileSystemPortTag } from "../domain/file-system-port";
import { MisePortTag } from "../domain/mise-port";

// Create the up command using @effect/cli (no arguments needed)
export const upCommand = Command.make("up", {}, () =>
  Effect.gen(function* () {
    const mise = yield* MisePortTag;
    const fileSystem = yield* FileSystemPortTag;

    yield* Effect.logInfo("Setting up development environment...");

    // Check mise installation - attempt to get installation info
    const miseInfo = yield* Effect.either(mise.checkInstallation());

    if (miseInfo._tag === "Left") {
      yield* Effect.logWarning("⚠️ Mise is not installed. Installing...");
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
  }),
);
