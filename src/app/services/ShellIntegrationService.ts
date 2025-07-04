import path from "path";

import { Context, Effect, Layer } from "effect";

import { configError, type ConfigError, type FileSystemError, type UnknownError } from "../../domain/errors";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { PathServiceTag } from "../../domain/services/PathService";

/**
 * Shell integration service for handling directory changes
 * This is app-level logic for shell integration using file-based approach
 */
export interface ShellIntegrationService {
  changeDirectory(
    targetPath: string,
  ): Effect.Effect<void, ConfigError | UnknownError | FileSystemError, FileSystemService | PathServiceTag>;
}

// Helper function to get the cd target file path
const getCdFilePath = (pathService: { dataDir: string }): string => path.join(pathService.dataDir, "cd_target");

// Individual functions implementing the service methods
const changeDirectory = (targetPath: string) =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemService;

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
export const ShellIntegrationServiceImpl: ShellIntegrationService = {
  changeDirectory: changeDirectory,
};

// Service tag for Effect Context system
export class ShellIntegrationServiceTag extends Context.Tag("ShellIntegrationService")<
  ShellIntegrationServiceTag,
  ShellIntegrationService
>() {}

// Layer that provides ShellIntegrationService (no `new` keyword)
export const ShellIntegrationServiceLive = Layer.effect(
  ShellIntegrationServiceTag,
  Effect.succeed(ShellIntegrationServiceImpl),
);
