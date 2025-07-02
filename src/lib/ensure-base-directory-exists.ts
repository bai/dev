import fs from "fs";

import { Effect } from "effect";

import { baseSearchDir } from "~/lib/constants";
import { logger } from "~/lib/logger";

import { configError } from "../domain/errors";

export function ensureBaseDirectoryExists(): Effect.Effect<void, import("../domain/errors").ConfigError> {
  return Effect.gen(function* () {
    // Check if directory exists using sync method for simplicity
    const exists = fs.existsSync(baseSearchDir);

    if (!exists) {
      yield* Effect.tryPromise({
        try: async () => {
          await fs.promises.mkdir(baseSearchDir, { recursive: true });
          logger.info(`📁 Created base search directory: ${baseSearchDir}`);
        },
        catch: (error: any) => {
          let errorMessage = `Failed to create base search directory: ${baseSearchDir} - ${error.message}`;
          if (error.code === "EACCES") {
            errorMessage += "\n💡 Permission denied. Run `dev status` to check environment health.";
          } else if (error.code === "ENOSPC") {
            errorMessage += "\n💡 No space left on device. Free up some disk space and try again.";
          }
          return configError(errorMessage);
        },
      });
    }
  });
}
