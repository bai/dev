import { Context, type Effect } from "effect";

import type { HealthCheckError } from "./errors";
import type { HealthCheckResult } from "./health-check-port";

/**
 * Domain port for tool health registry
 * Provides health check capabilities for tools
 */
export interface ToolHealthRegistry {
  /**
   * Get list of all registered tools that can be health checked
   */
  getRegisteredTools(): Effect.Effect<readonly string[], never>;

  /**
   * Perform health check for a specific tool
   */
  checkTool(toolName: string): Effect.Effect<HealthCheckResult, HealthCheckError>;

  /**
   * Perform health checks for all registered tools
   */
  checkAllTools(): Effect.Effect<readonly HealthCheckResult[], HealthCheckError>;
}

export class ToolHealthRegistryTag extends Context.Tag("ToolHealthRegistry")<
  ToolHealthRegistryTag,
  ToolHealthRegistry
>() {}
