import { Context, type Effect } from "effect";

import { type HealthCheckError } from "./errors";

export interface HealthCheckResult {
  readonly toolName: string;
  readonly version?: string;
  readonly binaryPath?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
  readonly checkedAt: Date;
}

export interface HealthCheck {
  /**
   * Run health checks immediately and return results
   * Used by `dev status` command
   */
  runHealthChecks(): Effect.Effect<readonly HealthCheckResult[], HealthCheckError>;
}

export class HealthCheckTag extends Context.Tag("HealthCheck")<HealthCheckTag, HealthCheck>() {}
