import { Effect, Layer } from "effect";

import { DebugServiceTag, type DebugService } from "../../domain/ports/DebugService";

/**
 * Debug service implementation for checking CLI configuration
 * This is the concrete implementation of the DebugService port
 */
export class DebugServiceImpl implements DebugService {
  get isDebugMode(): Effect.Effect<boolean> {
    return Effect.sync(() => process.env.DEV_CLI_DEBUG === "1");
  }

  get isStoreEnabled(): Effect.Effect<boolean> {
    return Effect.sync(() => process.env.DEV_CLI_STORE !== "0");
  }
}

// Layer that provides DebugService
export const DebugServiceLive = Layer.succeed(DebugServiceTag, new DebugServiceImpl());
