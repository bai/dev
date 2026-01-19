import { Context, type Effect } from "effect";

import type { DockerServiceError, ShellExecutionError } from "./errors";
import type { HealthCheckResult } from "./health-check-port";

export type ServiceName = "postgres17" | "postgres18" | "valkey";

export interface ServiceStatus {
  readonly name: ServiceName;
  readonly state: "running" | "stopped" | "not_created";
  readonly health?: "healthy" | "unhealthy" | "starting";
  readonly port?: number;
  readonly uptime?: string;
}

export interface DockerServices {
  up(services?: readonly ServiceName[]): Effect.Effect<void, DockerServiceError | ShellExecutionError>;
  down(services?: readonly ServiceName[]): Effect.Effect<void, DockerServiceError | ShellExecutionError>;
  restart(services?: readonly ServiceName[]): Effect.Effect<void, DockerServiceError | ShellExecutionError>;
  status(): Effect.Effect<readonly ServiceStatus[], DockerServiceError | ShellExecutionError>;
  logs(
    service?: ServiceName,
    options?: { follow?: boolean; tail?: number },
  ): Effect.Effect<void, DockerServiceError | ShellExecutionError>;
  reset(): Effect.Effect<void, DockerServiceError | ShellExecutionError>;
  isDockerAvailable(): Effect.Effect<boolean, never>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, never>;
}

export class DockerServicesTag extends Context.Tag("DockerServices")<DockerServicesTag, DockerServices>() {}
