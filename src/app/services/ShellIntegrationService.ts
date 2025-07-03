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

// Individual functions implementing the service methods
const handleCdToPath = (targetPath: string) =>
  Effect.gen(function* () {
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

const handleCdToPathLegacy = (targetPath: string) =>
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
      return yield* Effect.fail(new ConfigError({ reason: `Directory does not exist: ${absolutePath}` }));
    }

    // Special format for the shell wrapper to interpret: "CD:<path>"
    // Use Effect.sync to wrap console output in Effect context
    yield* Effect.sync(() => console.log(`CD:${absolutePath}`));

    // Return successfully - the shell wrapper should handle this output
    // and the Effect runtime will handle proper process exit codes
    return yield* Effect.succeed(undefined);
  });

// Functional service implementation as plain object
export const ShellIntegrationServiceImpl: ShellIntegrationService = {
  handleCdToPath: handleCdToPath,
  handleCdToPathLegacy: handleCdToPathLegacy,
};

// Service tag for Effect Context system
export class ShellIntegrationServiceTag extends Context.Tag("ShellIntegrationService")<
  ShellIntegrationServiceTag,
  ShellIntegrationService
>() {}

// Layer that provides ShellIntegrationService (no `new` keyword)
export const ShellIntegrationServiceLive = Layer.succeed(ShellIntegrationServiceTag, ShellIntegrationServiceImpl);
