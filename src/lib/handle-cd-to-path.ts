import fs from "fs";
import path from "path";

import { Effect } from "effect";

import { baseSearchDir } from "~/lib/constants";
import { logger } from "~/lib/logger";

import { configError } from "../domain/errors";

/**
 * Handles changing directory through shell wrapper by outputting a special format.
 * Determines the absolute path from the given targetPath (which can be absolute or relative),
 * validates that the target path exists, and then outputs a special format for the shell wrapper
 * to change directory.
 *
 * @param targetPath - The path (absolute or relative to baseSearchDir) to change directory to
 * @returns Effect that succeeds if the directory exists and handles the CD operation
 */
export function handleCdToPath(targetPath: string): Effect.Effect<void, import("../domain/errors").ConfigError> {
  return Effect.gen(function* () {
    let absolutePath: string;
    const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

    if (path.isAbsolute(cleanedTargetPath)) {
      absolutePath = cleanedTargetPath;
    } else {
      absolutePath = path.join(baseSearchDir, cleanedTargetPath);
    }

    // Validate path exists before attempting to cd
    const exists = yield* Effect.tryPromise({
      try: () => fs.promises.access(absolutePath, fs.constants.F_OK).then(() => true),
      catch: () => configError(`Directory does not exist: ${absolutePath}`),
    });

    // Special format for the shell wrapper to interpret: "CD:<path>"
    logger.info(`CD:${absolutePath}`);

    // Note: In the new error handling system, commands that need to exit should
    // throw appropriate errors. However, this function specifically needs to exit
    // with code 0 to signal success to the shell wrapper.
    // This is a special case where process.exit(0) is intentional for shell integration.
    process.exit(0);
  });
}
