import { Effect } from "effect";

import { type HealthCheckError } from "~/core/errors";

export interface HealthCheckResult {
  readonly toolName: string;
  readonly version?: string;
  readonly binaryPath?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
  readonly checkedAt: Date;
}

export class HealthCheckTag extends Effect.Tag("HealthCheck")<
  HealthCheckTag,
  {
    /**
     * Run health checks immediately and return results
     * Used by `dev status` command
     */
    runHealthChecks(): Effect.Effect<readonly HealthCheckResult[], HealthCheckError>;
  }
>() {}

export type HealthCheck = (typeof HealthCheckTag)["Service"];
