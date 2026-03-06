import path from "path";

import { Effect, Layer } from "effect";

import { FileSystem, type FileSystemService } from "~/capabilities/system/file-system-port";
import { ConfigError, type FileSystemError, type UnknownError } from "~/core/errors";
import { StatePaths, type StatePathsService, WorkspacePaths, type WorkspacePathsService } from "~/core/runtime/path-service";

/**
 * Shell integration service for handling directory changes
 * This is app-level logic for shell integration using file-based approach
 */
export interface ShellIntegrationService {
  changeDirectory(targetPath: string): Effect.Effect<void, ConfigError | UnknownError | FileSystemError>;
}

// Helper function to get the cd target file path
// Use parent process ID to make file unique per shell, avoiding race conditions when multiple processes start concurrently
const getCdFilePath = (statePaths: StatePathsService): string => path.join(statePaths.runDir, `cd_target.${process.ppid}`);

// Factory for a self-contained implementation (captures dependencies at layer construction)
const makeShellIntegration = (
  statePaths: StatePathsService,
  workspacePaths: WorkspacePathsService,
  fileSystem: FileSystemService,
): ShellIntegrationService => ({
  changeDirectory: (targetPath: string) =>
    Effect.gen(function* () {
      const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

      const absolutePath = path.isAbsolute(cleanedTargetPath)
        ? cleanedTargetPath
        : path.join(workspacePaths.baseSearchPath, cleanedTargetPath);

      // Validate path exists before attempting to cd
      const exists = yield* fileSystem.exists(absolutePath);
      if (!exists) {
        return yield* new ConfigError({ message: `Directory does not exist: ${absolutePath}` });
      }

      // Ensure the run directory exists
      yield* fileSystem.mkdir(statePaths.runDir, true);

      // Write the target path to the cd_target file
      const cdFilePath = getCdFilePath(statePaths);
      yield* fileSystem.writeFile(cdFilePath, absolutePath);

      yield* Effect.logDebug(`Wrote cd target to file: ${cdFilePath} -> ${absolutePath}`);
    }),
});

export class ShellIntegration extends Effect.Service<ShellIntegrationService>()("ShellIntegration", {
  dependencies: [Layer.service(StatePaths), Layer.service(WorkspacePaths), Layer.service(FileSystem)],
  effect: Effect.gen(function* () {
    const statePaths = yield* StatePaths;
    const workspacePaths = yield* WorkspacePaths;
    const fileSystem = yield* FileSystem;
    return makeShellIntegration(statePaths, workspacePaths, fileSystem);
  }),
}) {}

export const ShellIntegrationLiveLayer = ShellIntegration.Default;
