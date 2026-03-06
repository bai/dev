import { Effect } from "effect";

import type { HealthCheckResult } from "~/capabilities/tools/health-check-port";
import type { DockerServiceError, ShellExecutionError } from "~/core/errors";

export const DOCKER_SERVICE_NAMES = ["postgres17", "postgres18", "valkey"] as const;

export type ServiceName = (typeof DOCKER_SERVICE_NAMES)[number];

export const isServiceName = (serviceName: string): serviceName is ServiceName => DOCKER_SERVICE_NAMES.some((name) => name === serviceName);

export interface ServiceStatus {
  readonly name: ServiceName;
  readonly state: "running" | "stopped" | "not_created";
  readonly health?: "healthy" | "unhealthy" | "starting";
  readonly port?: number;
  readonly uptime?: string;
}

export class DockerServicesTag extends Effect.Tag("DockerServices")<
  DockerServicesTag,
  {
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
>() {}

export type DockerServices = (typeof DockerServicesTag)["Service"];
