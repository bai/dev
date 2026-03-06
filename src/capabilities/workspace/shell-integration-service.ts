import path from "path";

import { Effect, Layer } from "effect";

import { FileSystemTag, type FileSystem } from "~/capabilities/system/file-system-port";
import { configError, type ConfigError, type FileSystemError, type UnknownError } from "~/core/errors";
import { HostPathsTag, type HostPaths, WorkspacePathsTag, type WorkspacePaths } from "~/core/runtime/path-service";

/**
 * Shell integration service for handling directory changes
 * This is app-level logic for shell integration using file-based approach
 */
export interface ShellIntegration {
  changeDirectory(targetPath: string): Effect.Effect<void, ConfigError | UnknownError | FileSystemError>;
}

// Helper function to get the cd target file path
// Use parent process ID to make file unique per shell, avoiding race conditions when multiple processes start concurrently
const getCdFilePath = (hostPaths: HostPaths): string => path.join(hostPaths.dataDir, `cd_target.${process.ppid}`);

// Factory for a self-contained implementation (captures dependencies at layer construction)
const makeShellIntegration = (hostPaths: HostPaths, workspacePaths: WorkspacePaths, fileSystem: FileSystem): ShellIntegration => ({
  changeDirectory: (targetPath: string) =>
    Effect.gen(function* () {
      const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

      const absolutePath = path.isAbsolute(cleanedTargetPath)
        ? cleanedTargetPath
        : path.join(workspacePaths.baseSearchPath, cleanedTargetPath);

      // Validate path exists before attempting to cd
      const exists = yield* fileSystem.exists(absolutePath);
      if (!exists) {
        return yield* configError(`Directory does not exist: ${absolutePath}`);
      }

      // Ensure the data directory exists
      yield* fileSystem.mkdir(hostPaths.dataDir, true);

      // Write the target path to the cd_target file
      const cdFilePath = getCdFilePath(hostPaths);
      yield* fileSystem.writeFile(cdFilePath, absolutePath);

      yield* Effect.logDebug(`Wrote cd target to file: ${cdFilePath} -> ${absolutePath}`);
    }),
});

export class ShellIntegrationTag extends Effect.Service<ShellIntegration>()("ShellIntegration", {
  dependencies: [Layer.service(HostPathsTag), Layer.service(WorkspacePathsTag), Layer.service(FileSystemTag)],
  effect: Effect.gen(function* () {
    const hostPaths = yield* HostPathsTag;
    const workspacePaths = yield* WorkspacePathsTag;
    const fileSystem = yield* FileSystemTag;
    return makeShellIntegration(hostPaths, workspacePaths, fileSystem);
  }),
}) {}

export const ShellIntegrationLiveLayer = ShellIntegrationTag.Default;
