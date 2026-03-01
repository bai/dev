import { Effect, Option } from "effect";

import {
  DOCKER_SERVICE_NAMES,
  DockerServicesTag,
  isServiceName,
  type DockerServices,
  type ServiceName,
} from "../domain/docker-services-port";
import { dockerServiceError, type DockerServiceError, type ShellExecutionError } from "../domain/errors";

export interface ServicesHandlerConfig {
  readonly services: readonly string[];
}

export interface LogsHandlerConfig {
  readonly service: readonly string[];
  readonly follow: boolean;
  readonly tail: Option.Option<number>;
}

export const validateServiceNames = (
  services: readonly string[],
): Effect.Effect<readonly ServiceName[], never, never> =>
  Effect.gen(function* () {
    const result: ServiceName[] = [];

    for (const service of services) {
      if (isServiceName(service)) {
        result.push(service);
      } else {
        yield* Effect.logWarning(`Unknown service: ${service}. Valid services: ${DOCKER_SERVICE_NAMES.join(", ")}`);
      }
    }

    return result;
  });

export const withDocker = <A, E, R>(
  handler: (dockerServices: DockerServices) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DockerServiceError, R | DockerServicesTag> =>
  Effect.gen(function* () {
    const dockerServices = yield* DockerServicesTag;
    const isAvailable = yield* dockerServices.isDockerAvailable();

    if (!isAvailable) {
      return yield* dockerServiceError("Docker is not available. Please ensure Docker is installed and running.");
    }

    return yield* handler(dockerServices);
  });

export const handleUp = ({
  services,
}: ServicesHandlerConfig): Effect.Effect<void, DockerServiceError | ShellExecutionError, DockerServicesTag> =>
  withDocker((dockerServices) =>
    Effect.gen(function* () {
      const validServices = yield* validateServiceNames(services);
      const servicesToStart = validServices.length > 0 ? validServices : undefined;

      yield* dockerServices.up(servicesToStart);
    }),
  );

export const handleDown = ({
  services,
}: ServicesHandlerConfig): Effect.Effect<void, DockerServiceError | ShellExecutionError, DockerServicesTag> =>
  withDocker((dockerServices) =>
    Effect.gen(function* () {
      const validServices = yield* validateServiceNames(services);
      const servicesToStop = validServices.length > 0 ? validServices : undefined;

      yield* dockerServices.down(servicesToStop);
    }),
  );

export const handleRestart = ({
  services,
}: ServicesHandlerConfig): Effect.Effect<void, DockerServiceError | ShellExecutionError, DockerServicesTag> =>
  withDocker((dockerServices) =>
    Effect.gen(function* () {
      const validServices = yield* validateServiceNames(services);
      const servicesToRestart = validServices.length > 0 ? validServices : undefined;

      yield* dockerServices.restart(servicesToRestart);
    }),
  );

export const handleLogs = (
  config: LogsHandlerConfig,
): Effect.Effect<void, DockerServiceError | ShellExecutionError, DockerServicesTag> =>
  withDocker((dockerServices) =>
    Effect.gen(function* () {
      const validServices = yield* validateServiceNames(config.service);
      const serviceName = validServices.length > 0 ? validServices[0] : undefined;

      const tailValue = Option.isSome(config.tail) ? config.tail.value : undefined;

      yield* dockerServices.logs(serviceName, {
        follow: config.follow,
        tail: tailValue,
      });
    }),
  );

export const handleReset = (): Effect.Effect<void, DockerServiceError | ShellExecutionError, DockerServicesTag> =>
  withDocker((dockerServices) =>
    Effect.gen(function* () {
      yield* dockerServices.reset();
    }),
  );
