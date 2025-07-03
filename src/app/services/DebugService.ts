import { Effect, Layer } from "effect";

import { DebugServiceTag, type DebugService } from "../../domain/ports/DebugService";

/**
 * Debug service implementation for checking CLI configuration
 * This is the concrete implementation of the DebugService port
 */

// Individual effect functions
const isDebugMode = Effect.sync(() => process.env.DEV_CLI_DEBUG === "1");

const isStoreEnabled = Effect.sync(() => process.env.DEV_CLI_STORE !== "0");

// Plain object implementation
export const DebugServiceImpl: DebugService = {
  isDebugMode,
  isStoreEnabled,
};

// Layer that provides DebugService
export const DebugServiceLive = Layer.succeed(DebugServiceTag, DebugServiceImpl);
