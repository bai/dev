import fs from "fs";
import path from "path";

import { baseSearchDir } from "~/lib/constants";

import { createLogger } from "./logger";

/**
 * Handles changing directory through shell wrapper by outputting a special format.
 * Determines the absolute path from the given targetPath (which can be absolute or relative),
 * validates that the target path exists, and then outputs a special format for the shell wrapper
 * to change directory.
 *
 * @param targetPath - The path (absolute or relative to baseSearchDir) to change directory to
 * @throws Never returns - always exits the process (code 0 on success, code 1 on error)
 */
export function handleCdToPath(targetPath: string): void {
  const logger = createLogger();
  let absolutePath: string;
  const cleanedTargetPath = targetPath.replace(/\/$/, ""); // Remove trailing slash

  if (path.isAbsolute(cleanedTargetPath)) {
    absolutePath = cleanedTargetPath;
  } else {
    absolutePath = path.join(baseSearchDir, cleanedTargetPath);
  }

  // Validate path exists before attempting to cd
  if (!fs.existsSync(absolutePath)) {
    logger.error(`❌ Error: Directory does not exist: ${absolutePath}`);
    process.exit(1);
  }

  // Special format for the shell wrapper to interpret: "CD:<path>"
  logger.info(`CD:${absolutePath}`);
  process.exit(0);
}
