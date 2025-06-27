import fs from "fs";
import path from "path";

import { baseSearchDir } from "~/lib/constants";
import { FileSystemError } from "~/lib/errors";
import { logger } from "~/lib/logger";

/**
 * Handles changing directory through shell wrapper by outputting a special format.
 * Determines the absolute path from the given targetPath (which can be absolute or relative),
 * validates that the target path exists, and then outputs a special format for the shell wrapper
 * to change directory.
 *
 * @param targetPath - The path (absolute or relative to baseSearchDir) to change directory to
 * @throws FileSystemError if the directory does not exist
 */
export function handleCdToPath(targetPath: string): void {
  let absolutePath: string;
  const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

  if (path.isAbsolute(cleanedTargetPath)) {
    absolutePath = cleanedTargetPath;
  } else {
    absolutePath = path.join(baseSearchDir, cleanedTargetPath);
  }

  // Validate path exists before attempting to cd
  if (!fs.existsSync(absolutePath)) {
    throw new FileSystemError(`Directory does not exist: ${absolutePath}`, {
      extra: { targetPath, absolutePath },
    });
  }

  // Special format for the shell wrapper to interpret: "CD:<path>"
  logger.info(`CD:${absolutePath}`);

  // Note: In the new error handling system, commands that need to exit should
  // throw appropriate errors. However, this function specifically needs to exit
  // with code 0 to signal success to the shell wrapper.
  // This is a special case where process.exit(0) is intentional for shell integration.
  process.exit(0);
}
