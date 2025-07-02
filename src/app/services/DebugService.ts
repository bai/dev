import { Context, Effect, Layer } from "effect";

/**
 * Debug service for checking if CLI is running in debug mode
 * This is app-level configuration logic
 */
export interface DebugService {
  readonly isDebugMode: Effect.Effect<boolean>;
  readonly isStoreEnabled: Effect.Effect<boolean>;
}

export class DebugServiceImpl implements DebugService {
  get isDebugMode(): Effect.Effect<boolean> {
    return Effect.sync(() => process.env.DEV_CLI_DEBUG === "1");
  }

  get isStoreEnabled(): Effect.Effect<boolean> {
    return Effect.sync(() => process.env.DEV_CLI_STORE !== "0");
  }
}

// Service tag for Effect Context system
export class DebugServiceTag extends Context.Tag("DebugService")<DebugServiceTag, DebugService>() {}

// Layer that provides DebugService
export const DebugServiceLive = Layer.succeed(DebugServiceTag, new DebugServiceImpl());
