import fs from "fs";

import { baseSearchDir } from "~/lib/constants";

export async function ensureBaseDirectoryExists() {
  if (!fs.existsSync(baseSearchDir)) {
    try {
      fs.mkdirSync(baseSearchDir, { recursive: true });
      console.log(`📁 Created base search directory: ${baseSearchDir}`);
    } catch (error: any) {
      console.error(`❌ Error: Failed to create base search directory: ${baseSearchDir}`);
      console.error(`   ${error.message}`);
      if (error.code === "EACCES") {
        console.error("💡 Permission denied. Run `dev status` to check environment health.");
      } else if (error.code === "ENOSPC") {
        console.error("💡 No space left on device. Free up some disk space and try again.");
      }
      process.exit(1);
    }
  }
}
