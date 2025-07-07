import { Context, type Effect } from "effect";

import type { HealthCheckError } from "./errors";
import type { HealthCheckResult } from "./health-check-port";
import type { ToolHealthRegistryPort } from "./tool-health-registry-port";

export interface HealthCheckService {
  /**
   * Get all health check results by running checks on registered tools
   */
  runAllHealthChecks(): Effect.Effect<readonly HealthCheckResult[], HealthCheckError>;

  /**
   * Get list of all registered tools that can be health checked
   */
  getRegisteredTools(): Effect.Effect<readonly string[], never>;
}

export class HealthCheckServiceTag extends Context.Tag("HealthCheckService")<
  HealthCheckServiceTag,
  HealthCheckService
>() {}

/**
 * Simple service that delegates to the ToolHealthRegistryPort
 * This maintains the domain service abstraction while using domain ports
 */
export const makeHealthCheckService = (toolHealthRegistry: ToolHealthRegistryPort): HealthCheckService => ({
  runAllHealthChecks: () => toolHealthRegistry.checkAllTools(),
  getRegisteredTools: () => toolHealthRegistry.getRegisteredTools(),
});
