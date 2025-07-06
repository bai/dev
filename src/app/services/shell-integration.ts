import path from "path";

import { Context, Effect, Layer } from "effect";

import { configError, type ConfigError, type FileSystemError, type UnknownError } from "../../domain/errors";
import { FileSystemPortTag } from "../../domain/ports/file-system-port";
import { PathServiceTag } from "../../domain/services/path-service";

/**
 * Shell integration service for handling directory changes
 * This is app-level logic for shell integration using file-based approach
 */
export interface ShellIntegration {
  changeDirectory(
    targetPath: string,
  ): Effect.Effect<void, ConfigError | UnknownError | FileSystemError, FileSystemPortTag | PathServiceTag>;
}

// Helper function to get the cd target file path
const getCdFilePath = (pathService: { dataDir: string }): string => path.join(pathService.dataDir, "cd_target");

// Individual functions implementing the service methods
const changeDirectory = (targetPath: string) =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemPortTag;

    let absolutePath: string;
    const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

    if (path.isAbsolute(cleanedTargetPath)) {
      absolutePath = cleanedTargetPath;
    } else {
      absolutePath = path.join(pathService.baseSearchDir, cleanedTargetPath);
    }

    // Validate path exists before attempting to cd
    const exists = yield* fileSystem.exists(absolutePath);
    if (!exists) {
      return yield* Effect.fail(configError(`Directory does not exist: ${absolutePath}`));
    }

    // Ensure the data directory exists
    yield* fileSystem.mkdir(pathService.dataDir, true);

    // Write the target path to the cd_target file
    const cdFilePath = getCdFilePath(pathService);
    yield* fileSystem.writeFile(cdFilePath, absolutePath);

    yield* Effect.logDebug(`Wrote cd target to file: ${cdFilePath} -> ${absolutePath}`);
  });

// Functional service implementation as plain object
export const ShellIntegrationLive: ShellIntegration = {
  changeDirectory: changeDirectory,
};

// Service tag for Effect Context system
export class ShellIntegrationTag extends Context.Tag("ShellIntegration")<ShellIntegrationTag, ShellIntegration>() {}

// Layer that provides ShellIntegrationService (no `new` keyword)
export const ShellIntegrationLiveLayer = Layer.effect(ShellIntegrationTag, Effect.succeed(ShellIntegrationLive));
