import fs from "fs";

import { baseSearchDir } from "~/lib/constants";
import { FileSystemError } from "~/lib/errors";
import { logger } from "~/lib/logger";

export function ensureBaseDirectoryExists() {
  if (!fs.existsSync(baseSearchDir)) {
    try {
      fs.mkdirSync(baseSearchDir, { recursive: true });
      logger.info(`📁 Created base search directory: ${baseSearchDir}`);
    } catch (error: any) {
      let errorMessage = `Failed to create base search directory: ${baseSearchDir} - ${error.message}`;
      if (error.code === "EACCES") {
        errorMessage += "\n💡 Permission denied. Run `dev status` to check environment health.";
      } else if (error.code === "ENOSPC") {
        errorMessage += "\n💡 No space left on device. Free up some disk space and try again.";
      }
      throw new FileSystemError(errorMessage, {
        extra: { baseSearchDir, errorCode: error.code },
      });
    }
  }
}
