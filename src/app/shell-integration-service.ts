import path from "path";

import { Context, Effect, Layer } from "effect";

import { configError, type ConfigError, type FileSystemError, type UnknownError } from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";
import { PathServiceTag, type PathService } from "../domain/path-service";

/**
 * Shell integration service for handling directory changes
 * This is app-level logic for shell integration using file-based approach
 */
export interface ShellIntegration {
  changeDirectory(targetPath: string): Effect.Effect<void, ConfigError | UnknownError | FileSystemError>;
}

// Helper function to get the cd target file path
// Use parent process ID to make file unique per shell, avoiding race conditions when multiple processes start concurrently
const getCdFilePath = (pathService: { dataDir: string }): string => path.join(pathService.dataDir, `cd_target.${process.ppid}`);

// Factory for a self-contained implementation (captures dependencies at layer construction)
const makeShellIntegration = (pathService: PathService, fileSystem: FileSystem): ShellIntegration => ({
  changeDirectory: (targetPath: string) =>
    Effect.gen(function* () {
      const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

      const absolutePath = path.isAbsolute(cleanedTargetPath)
        ? cleanedTargetPath
        : path.join(pathService.baseSearchPath, cleanedTargetPath);

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
    }),
});

// Service tag for Effect Context system
export class ShellIntegrationTag extends Context.Tag("ShellIntegration")<ShellIntegrationTag, ShellIntegration>() {}

// Layer that provides ShellIntegrationService, capturing dependencies
export const ShellIntegrationLiveLayer = Layer.effect(
  ShellIntegrationTag,
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemTag;
    return makeShellIntegration(pathService, fileSystem);
  }),
);
