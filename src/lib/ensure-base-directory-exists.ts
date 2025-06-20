import fs from "fs";

import { baseSearchDir } from "~/lib/constants";
import { logger } from "~/lib/logger";

export function ensureBaseDirectoryExists() {
  if (!fs.existsSync(baseSearchDir)) {
    try {
      fs.mkdirSync(baseSearchDir, { recursive: true });
      logger.info(`📁 Created base search directory: ${baseSearchDir}`);
    } catch (error: any) {
      logger.error(`❌ Error: Failed to create base search directory: ${baseSearchDir}`);
      logger.error(`   ${error.message}`);
      if (error.code === "EACCES") {
        logger.error("💡 Permission denied. Run `dev status` to check environment health.");
      } else if (error.code === "ENOSPC") {
        logger.error("💡 No space left on device. Free up some disk space and try again.");
      }
      throw error;
    }
  }
}
