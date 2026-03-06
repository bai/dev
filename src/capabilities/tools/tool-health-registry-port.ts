import { Effect } from "effect";

import type { HealthCheckResult } from "~/capabilities/tools/health-check-port";
import type { HealthCheckError } from "~/core/errors";

/**
 * Domain port for tool health registry
 * Provides health check capabilities for tools
 */
export class ToolHealthRegistry extends Effect.Tag("ToolHealthRegistry")<
  ToolHealthRegistry,
  {
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
>() {}

export type ToolHealthRegistryService = (typeof ToolHealthRegistry)["Service"];
