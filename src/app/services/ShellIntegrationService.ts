import path from "path";

import { Context, Effect, Layer } from "effect";

import { ConfigError, type UnknownError } from "../../domain/errors";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { ShellService } from "../../domain/ports/Shell";
import { PathServiceTag } from "../../domain/services/PathService";

/**
 * Shell integration service for handling directory changes
 * This is app-level logic for shell integration
 */
export interface ShellIntegrationService {
  handleCdToPath(
    targetPath: string,
  ): Effect.Effect<void, ConfigError | UnknownError, FileSystemService | PathServiceTag | ShellService>;
  handleCdToPathLegacy(
    targetPath: string,
  ): Effect.Effect<void, ConfigError | UnknownError, FileSystemService | PathServiceTag>;
}

export class ShellIntegrationServiceImpl implements ShellIntegrationService {
  handleCdToPath(
    targetPath: string,
  ): Effect.Effect<void, ConfigError | UnknownError, FileSystemService | PathServiceTag | ShellService> {
    return Effect.gen(function* () {
      const pathService = yield* PathServiceTag;
      const fileSystem = yield* FileSystemService;
      const shell = yield* ShellService;

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
        return yield* Effect.fail(new ConfigError({ reason: `Directory does not exist: ${absolutePath}` }));
      }

      // Use Shell port for directory change
      yield* shell.changeDirectory(absolutePath);
    });
  }

  handleCdToPathLegacy(
    targetPath: string,
  ): Effect.Effect<void, ConfigError | UnknownError, FileSystemService | PathServiceTag> {
    return Effect.gen(function* () {
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
        return yield* Effect.fail(new ConfigError({ reason: `Directory does not exist: ${absolutePath}` }));
      }

      // Special format for the shell wrapper to interpret: "CD:<path>"
      console.log(`CD:${absolutePath}`);

      // Return successfully - the shell wrapper should handle this output
      // and the Effect runtime will handle proper process exit codes
      return yield* Effect.succeed(undefined);
    });
  }
}

// Service tag for Effect Context system
export class ShellIntegrationServiceTag extends Context.Tag("ShellIntegrationService")<
  ShellIntegrationServiceTag,
  ShellIntegrationService
>() {}

// Layer that provides ShellIntegrationService
export const ShellIntegrationServiceLive = Layer.succeed(ShellIntegrationServiceTag, new ShellIntegrationServiceImpl());
