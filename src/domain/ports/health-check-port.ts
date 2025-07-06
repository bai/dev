import { Context, type Effect } from "effect";

import { type HealthCheckError } from "../errors";

// Health check result interface
export interface HealthCheckResult {
  readonly toolName: string;
  readonly version?: string;
  readonly status: "ok" | "warn" | "fail";
  readonly notes?: string;
  readonly checkedAt: Date;
}

// Summary for status command output
export interface HealthCheckSummary {
  readonly toolName: string;
  readonly version?: string;
  readonly status: "ok" | "warn" | "fail";
  readonly notes?: string;
  readonly checkedAt: Date;
}

export interface HealthCheckPort {
  /**
   * Run health checks immediately (synchronously waiting for results)
   * Used by `dev status --refresh`
   */
  runHealthChecks(): Effect.Effect<HealthCheckResult[], HealthCheckError>;

  /**
   * Spawn health check worker as detached background process
   * Used for background scheduling after commands complete
   */
  runHealthChecksBackground(): Effect.Effect<void, HealthCheckError>;

  /**
   * Get the latest health check results for each tool
   * Used by `dev status` to show cached results
   */
  getLatestResults(): Effect.Effect<HealthCheckSummary[], HealthCheckError>;

  /**
   * Prune old health check records based on retention policy
   */
  pruneOldRecords(retentionDays?: number): Effect.Effect<void, HealthCheckError>;
}

export class HealthCheckPortTag extends Context.Tag("HealthCheckPort")<HealthCheckPortTag, HealthCheckPort>() {}
