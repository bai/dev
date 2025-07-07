import { Context, type Effect } from "effect";

import { type HealthCheckError } from "./errors";

// Health check result interface
export interface HealthCheckResult {
  readonly toolName: string;
  readonly version?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
  readonly checkedAt: Date;
}

// Summary for status command output
export interface HealthCheckSummary {
  readonly toolName: string;
  readonly version?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
  readonly checkedAt: Date;
}

export interface HealthCheckPort {
  /**
   * Run health checks immediately and return results
   * Used by `dev status` command
   */
  runHealthChecks(): Effect.Effect<readonly HealthCheckResult[], HealthCheckError>;

  /**
   * Get the latest health check results for each tool from cache
   * Used for quick status display if available
   */
  getLatestResults(): Effect.Effect<readonly HealthCheckSummary[], HealthCheckError>;

  /**
   * Prune old health check records based on retention policy
   */
  pruneOldRecords(retentionDays?: number): Effect.Effect<void, HealthCheckError>;
}

export class HealthCheckPortTag extends Context.Tag("HealthCheckPort")<HealthCheckPortTag, HealthCheckPort>() {}
