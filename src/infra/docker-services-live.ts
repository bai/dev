import path from "path";

import { Clock, Context, Effect, Layer } from "effect";

import {
  DOCKER_SERVICE_NAMES,
  DockerServicesTag,
  type DockerServices,
  type ServiceName,
  type ServiceStatus,
} from "../domain/docker-services-port";
import { dockerServiceError, type DockerServiceError, type ShellExecutionError } from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";
import { PathServiceTag, type PathService } from "../domain/path-service";
import type { HealthCheckResult } from "../domain/health-check-port";
import { ShellTag, type Shell } from "../domain/shell-port";

const SERVICE_PORTS: Record<ServiceName, number> = {
  postgres17: 55432,
  postgres18: 55433,
  valkey: 56379,
};

const COMPOSE_FILE_CONTENT = `name: dev-services

services:
  postgres17:
    image: docker.io/library/postgres:17.9
    container_name: dev-postgres17
    ports:
      - "55432:5432"
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: dev
    volumes:
      - dev-postgres17-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev -d dev"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  postgres18:
    image: docker.io/library/postgres:18.3
    container_name: dev-postgres18
    ports:
      - "55433:5432"
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: dev
    volumes:
      - dev-postgres18-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev -d dev"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  valkey:
    image: docker.io/valkey/valkey:9.0
    container_name: dev-valkey
    ports:
      - "56379:6379"
    volumes:
      - dev-valkey-data:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  dev-postgres17-data:
  dev-postgres18-data:
  dev-valkey-data:
`;

interface DockerPsJson {
  Name: string;
  State: string;
  Health?: string;
  Status?: string;
}

export const makeDockerServicesLive = (
  shell: Shell,
  fs: FileSystem,
  pathService: PathService,
  enabledServices: readonly ServiceName[] = DOCKER_SERVICE_NAMES,
): DockerServices => {
  const getComposeFilePath = (): string => {
    return path.join(pathService.dataDir, "docker", "docker-compose.yml");
  };

  const getComposeDir = (): string => {
    return path.dirname(getComposeFilePath());
  };

  const ensureComposeFile = (): Effect.Effect<void, DockerServiceError | ShellExecutionError> =>
    Effect.gen(function* () {
      const composeFilePath = getComposeFilePath();
      const composeDir = getComposeDir();

      const exists = yield* fs.exists(composeFilePath);
      if (exists) {
        return;
      }

      yield* fs
        .mkdir(composeDir, true)
        .pipe(Effect.mapError(() => dockerServiceError("Failed to create docker compose directory")));

      yield* fs
        .writeFile(composeFilePath, COMPOSE_FILE_CONTENT)
        .pipe(Effect.mapError(() => dockerServiceError("Failed to write docker-compose.yml")));

      yield* Effect.logDebug(`Created docker-compose.yml at ${composeFilePath}`);
    });

  const runCompose = (
    args: readonly string[],
  ): Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, ShellExecutionError> =>
    Effect.gen(function* () {
      const composeFilePath = getComposeFilePath();
      const fullArgs = ["-f", composeFilePath, ...args];
      yield* Effect.annotateCurrentSpan("docker.compose.action", args[0] ?? "unknown");
      yield* Effect.annotateCurrentSpan("docker.compose.args", args.join(" "));
      yield* Effect.annotateCurrentSpan("docker.compose.file", composeFilePath);
      const result = yield* shell.exec("docker", ["compose", ...fullArgs]);
      yield* Effect.annotateCurrentSpan("docker.compose.exit_code", result.exitCode);
      return result;
    }).pipe(Effect.withSpan("docker.compose.exec"));

  const runComposeAndCheck = (
    args: readonly string[],
    errorMessage: string,
  ): Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, DockerServiceError | ShellExecutionError> =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("docker.compose.error_message", errorMessage);
      const result = yield* runCompose(args);
      if (result.exitCode !== 0) {
        yield* Effect.annotateCurrentSpan("docker.compose.failed", true);
        return yield* dockerServiceError(errorMessage, {
          exitCode: result.exitCode,
          stderr: result.stderr,
        });
      }
      return result;
    }).pipe(Effect.withSpan("docker.compose.exec_checked"));

  const runComposeInteractive = (args: readonly string[]): Effect.Effect<number, ShellExecutionError> =>
    Effect.gen(function* () {
      const composeFilePath = getComposeFilePath();
      const fullArgs = ["-f", composeFilePath, ...args];
      yield* Effect.annotateCurrentSpan("docker.compose.action", args[0] ?? "unknown");
      yield* Effect.annotateCurrentSpan("docker.compose.args", args.join(" "));
      yield* Effect.annotateCurrentSpan("docker.compose.file", composeFilePath);
      const exitCode = yield* shell.execInteractive("docker", ["compose", ...fullArgs]);
      yield* Effect.annotateCurrentSpan("docker.compose.exit_code", exitCode);
      return exitCode;
    }).pipe(Effect.withSpan("docker.compose.exec_interactive"));

  const parseServiceState = (state: string): ServiceStatus["state"] => {
    const lower = state.toLowerCase();
    if (lower === "running") return "running";
    if (lower === "exited" || lower === "stopped") return "stopped";
    return "not_created";
  };

  const parseHealthStatus = (health?: string): ServiceStatus["health"] | undefined => {
    if (!health) return undefined;
    const lower = health.toLowerCase();
    if (lower === "healthy") return "healthy";
    if (lower === "unhealthy") return "unhealthy";
    if (lower === "starting") return "starting";
    return undefined;
  };

  const parseUptime = (status?: string): string | undefined => {
    if (!status) return undefined;
    const match = status.match(/Up (.+?)(?:\s*\(|$)/);
    return match?.[1];
  };

  return {
    up: (services?: readonly ServiceName[]): Effect.Effect<void, DockerServiceError | ShellExecutionError> =>
      Effect.gen(function* () {
        const serviceList = services ?? enabledServices;

        if (serviceList.length === 0) {
          yield* Effect.logInfo("No services configured");
          return;
        }

        yield* ensureComposeFile();

        const args = ["up", "-d", ...serviceList];

        yield* Effect.logInfo(`Starting services: ${serviceList.join(", ")}`);

        yield* runComposeAndCheck(args, "Failed to start services");

        yield* Effect.logInfo("Services started successfully");
      }),

    down: (services?: readonly ServiceName[]): Effect.Effect<void, DockerServiceError | ShellExecutionError> =>
      Effect.gen(function* () {
        const composeFilePath = getComposeFilePath();
        const exists = yield* fs.exists(composeFilePath);
        if (!exists) {
          yield* Effect.logInfo("No services to stop (compose file not found)");
          return;
        }

        const serviceList = services ?? [];
        const args = serviceList.length > 0 ? ["stop", ...serviceList] : ["down"];

        yield* Effect.logInfo(
          serviceList.length > 0 ? `Stopping services: ${serviceList.join(", ")}` : "Stopping all services",
        );

        yield* runComposeAndCheck(args, "Failed to stop services");

        yield* Effect.logInfo("Services stopped successfully");
      }),

    restart: (services?: readonly ServiceName[]): Effect.Effect<void, DockerServiceError | ShellExecutionError> =>
      Effect.gen(function* () {
        const serviceList = services ?? enabledServices;

        if (serviceList.length === 0) {
          yield* Effect.logInfo("No services configured");
          return;
        }

        yield* ensureComposeFile();

        const args = ["restart", ...serviceList];

        yield* Effect.logInfo(`Restarting services: ${serviceList.join(", ")}`);

        yield* runComposeAndCheck(args, "Failed to restart services");

        yield* Effect.logInfo("Services restarted successfully");
      }),

    status: (): Effect.Effect<readonly ServiceStatus[], DockerServiceError | ShellExecutionError> =>
      Effect.gen(function* () {
        const composeFilePath = getComposeFilePath();
        const exists = yield* fs.exists(composeFilePath);
        if (!exists) {
          return enabledServices.map(
            (name): ServiceStatus => ({
              name,
              state: "not_created",
              port: SERVICE_PORTS[name],
            }),
          );
        }

        const result = yield* runComposeAndCheck(["ps", "--format", "json", "-a"], "Failed to get service status");

        const runningServices = new Map<string, DockerPsJson>();

        if (result.stdout.trim()) {
          const lines = result.stdout.trim().split("\n");
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line) as DockerPsJson;
              const serviceName = parsed.Name.replace("dev-", "");
              runningServices.set(serviceName, parsed);
            } catch {
              // Skip unparseable lines
            }
          }
        }

        return enabledServices.map((name): ServiceStatus => {
          const containerInfo = runningServices.get(name);
          if (!containerInfo) {
            return {
              name,
              state: "not_created",
              port: SERVICE_PORTS[name],
            };
          }

          return {
            name,
            state: parseServiceState(containerInfo.State),
            health: parseHealthStatus(containerInfo.Health),
            port: SERVICE_PORTS[name],
            uptime: parseUptime(containerInfo.Status),
          };
        });
      }),

    logs: (
      service?: ServiceName,
      options?: { follow?: boolean; tail?: number },
    ): Effect.Effect<void, DockerServiceError | ShellExecutionError> =>
      Effect.gen(function* () {
        const composeFilePath = getComposeFilePath();
        const exists = yield* fs.exists(composeFilePath);
        if (!exists) {
          return yield* dockerServiceError("No services configured (compose file not found)");
        }

        const args: string[] = ["logs"];
        if (options?.follow) {
          args.push("-f");
        }
        if (options?.tail !== undefined) {
          args.push("--tail", String(options.tail));
        }
        if (service) {
          args.push(service);
        }

        const exitCode = yield* runComposeInteractive(args);
        if (exitCode !== 0 && exitCode !== 130) {
          // 130 is SIGINT (Ctrl+C)
          return yield* dockerServiceError("Failed to get logs", {
            exitCode,
          });
        }
      }),

    reset: (): Effect.Effect<void, DockerServiceError | ShellExecutionError> =>
      Effect.gen(function* () {
        const composeFilePath = getComposeFilePath();
        const exists = yield* fs.exists(composeFilePath);

        if (!exists) {
          yield* Effect.logInfo("No services to reset (compose file not found)");
          return;
        }

        yield* Effect.logInfo("Resetting docker services to pristine state...");

        // Stop all containers and remove volumes
        yield* Effect.logInfo("Stopping containers and removing volumes...");
        yield* runComposeAndCheck(["down", "-v"], "Failed to stop services and remove volumes");

        // Remove the compose file so it regenerates fresh
        yield* Effect.logInfo("Removing compose file...");
        const rmResult = yield* shell
          .exec("rm", ["-f", composeFilePath])
          .pipe(Effect.withSpan("filesystem.remove_file"));
        if (rmResult.exitCode !== 0) {
          return yield* dockerServiceError("Failed to remove compose file", {
            exitCode: rmResult.exitCode,
            stderr: rmResult.stderr,
          });
        }

        yield* Effect.logInfo("Services reset successfully. Run 'dev services up' to start fresh.");
      }),

    isDockerAvailable: (): Effect.Effect<boolean, never> =>
      Effect.gen(function* () {
        const result = yield* shell.exec("docker", ["info"]).pipe(Effect.orElseSucceed(() => null));
        const isAvailable = result !== null && result.exitCode === 0;
        yield* Effect.annotateCurrentSpan("docker.available", isAvailable);
        if (result !== null) {
          yield* Effect.annotateCurrentSpan("docker.info.exit_code", result.exitCode);
        }
        return isAvailable;
      }).pipe(Effect.withSpan("docker.availability.check")),

    performHealthCheck: (): Effect.Effect<HealthCheckResult, never> =>
      Effect.gen(function* () {
        const checkedAt = new Date(yield* Clock.currentTimeMillis);
        const dockerServices = makeDockerServicesLive(shell, fs, pathService, enabledServices);

        const isAvailable = yield* dockerServices.isDockerAvailable();
        if (!isAvailable) {
          return {
            toolName: "docker-services",
            status: "warning",
            notes: "Docker not available",
            checkedAt,
          };
        }

        const statuses = yield* dockerServices.status().pipe(
          Effect.catchAll(() =>
            Effect.succeed(
              enabledServices.map(
                (name): ServiceStatus => ({
                  name,
                  state: "not_created",
                  port: SERVICE_PORTS[name],
                }),
              ),
            ),
          ),
        );

        const runningCount = statuses.filter((s) => s.state === "running").length;
        const totalCount = statuses.length;

        if (runningCount === 0) {
          return {
            toolName: "docker-services",
            status: "warning",
            notes: "No services running",
            checkedAt,
          };
        }

        const unhealthyCount = statuses.filter((s) => s.health === "unhealthy").length;
        if (unhealthyCount > 0) {
          return {
            toolName: "docker-services",
            version: `${runningCount}/${totalCount} running`,
            status: "warning",
            notes: `${unhealthyCount} unhealthy`,
            checkedAt,
          };
        }

        return {
          toolName: "docker-services",
          version: `${runningCount}/${totalCount} running`,
          status: "ok",
          checkedAt,
        };
      }),
  };
};

export class DockerServicesToolsTag extends Context.Tag("DockerServicesTools")<
  DockerServicesToolsTag,
  { performHealthCheck: () => Effect.Effect<HealthCheckResult, never> }
>() {}

export const DockerServicesLiveLayer = (enabledServices?: readonly ServiceName[]) =>
  Layer.effect(
    DockerServicesTag,
    Effect.gen(function* () {
      const shell = yield* ShellTag;
      const fs = yield* FileSystemTag;
      const pathService = yield* PathServiceTag;
      return makeDockerServicesLive(shell, fs, pathService, enabledServices);
    }),
  );

export const DockerServicesToolsLiveLayer = (enabledServices?: readonly ServiceName[]) =>
  Layer.effect(
    DockerServicesToolsTag,
    Effect.gen(function* () {
      const shell = yield* ShellTag;
      const fs = yield* FileSystemTag;
      const pathService = yield* PathServiceTag;
      const dockerServices = makeDockerServicesLive(shell, fs, pathService, enabledServices);
      return {
        performHealthCheck: () => dockerServices.performHealthCheck(),
      };
    }),
  );
