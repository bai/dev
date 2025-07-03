import { Context, type Effect } from "effect";

/**
 * Debug service for checking CLI configuration
 * This is a domain port for debug-related operations
 */
export interface DebugService {
  readonly isDebugMode: Effect.Effect<boolean>;
  readonly isStoreEnabled: Effect.Effect<boolean>;
}

// Service tag for Effect Context system
export class DebugServiceTag extends Context.Tag("DebugService")<DebugServiceTag, DebugService>() {}
