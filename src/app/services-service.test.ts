import { it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import {
  DockerServicesTag,
  type DockerServices,
  type ServiceName,
  type ServiceStatus,
} from "../domain/docker-services-port";
import type { HealthCheckResult } from "../domain/health-check-port";
import { handleDown, handleLogs, handleReset, handleRestart, handleUp, withDocker } from "./services-service";

class MockDockerServices implements DockerServices {
  public availabilityChecks = 0;
  public upCalls: Array<readonly ServiceName[] | undefined> = [];
  public downCalls: Array<readonly ServiceName[] | undefined> = [];
  public restartCalls: Array<readonly ServiceName[] | undefined> = [];
  public logsCalls: Array<{ readonly service?: ServiceName; readonly options?: { follow?: boolean; tail?: number } }> =
    [];
  public resetCalls = 0;

  constructor(private readonly available: boolean) {}

  up(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    this.upCalls.push(services);
    return Effect.void;
  }

  down(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    this.downCalls.push(services);
    return Effect.void;
  }

  restart(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    this.restartCalls.push(services);
    return Effect.void;
  }

  status(): Effect.Effect<readonly ServiceStatus[], never, never> {
    return Effect.succeed([]);
  }

  logs(service?: ServiceName, options?: { follow?: boolean; tail?: number }): Effect.Effect<void, never, never> {
    this.logsCalls.push({ service, options });
    return Effect.void;
  }

  reset(): Effect.Effect<void, never, never> {
    this.resetCalls += 1;
    return Effect.void;
  }

  isDockerAvailable(): Effect.Effect<boolean, never, never> {
    this.availabilityChecks += 1;
    return Effect.succeed(this.available);
  }

  performHealthCheck(): Effect.Effect<HealthCheckResult, never, never> {
    return Effect.succeed({
      toolName: "docker-services",
      status: this.available ? "ok" : "warning",
      checkedAt: new Date(),
    });
  }
}

describe("services-service", () => {
  it.effect("withDocker short-circuits when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(false);
      let executed = false;
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      const error = yield* Effect.flip(
        withDocker((_docker) =>
          Effect.sync(() => {
            executed = true;
          }),
        ).pipe(Effect.provide(testLayer)),
      );

      expect(executed).toBe(false);
      expect(error._tag).toBe("DockerServiceError");
      expect(dockerServices.availabilityChecks).toBe(1);
    }),
  );

  it.effect("withDocker executes handler when docker is available", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(true);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      const result = yield* withDocker((_docker) => Effect.succeed("ok")).pipe(Effect.provide(testLayer));

      expect(result).toBe("ok");
      expect(dockerServices.availabilityChecks).toBe(1);
    }),
  );

  it.effect("all service handlers short-circuit when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(false);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      const upError = yield* Effect.flip(handleUp({ services: ["postgres17"] }).pipe(Effect.provide(testLayer)));
      const downError = yield* Effect.flip(handleDown({ services: ["postgres17"] }).pipe(Effect.provide(testLayer)));
      const restartError = yield* Effect.flip(
        handleRestart({ services: ["postgres17"] }).pipe(Effect.provide(testLayer)),
      );
      const logsError = yield* Effect.flip(
        handleLogs({ service: ["postgres17"], follow: false, tail: Option.none() }).pipe(Effect.provide(testLayer)),
      );
      const resetError = yield* Effect.flip(handleReset().pipe(Effect.provide(testLayer)));

      expect(dockerServices.availabilityChecks).toBe(5);
      expect(upError._tag).toBe("DockerServiceError");
      expect(downError._tag).toBe("DockerServiceError");
      expect(restartError._tag).toBe("DockerServiceError");
      expect(logsError._tag).toBe("DockerServiceError");
      expect(resetError._tag).toBe("DockerServiceError");
      expect(dockerServices.upCalls).toHaveLength(0);
      expect(dockerServices.downCalls).toHaveLength(0);
      expect(dockerServices.restartCalls).toHaveLength(0);
      expect(dockerServices.logsCalls).toHaveLength(0);
      expect(dockerServices.resetCalls).toBe(0);
    }),
  );

  it.effect("logs handler passes validated service and tail options", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(true);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      yield* handleLogs({
        service: ["invalid-service", "valkey"],
        follow: true,
        tail: Option.some(50),
      }).pipe(Effect.provide(testLayer));

      expect(dockerServices.logsCalls).toEqual([
        {
          service: "valkey",
          options: {
            follow: true,
            tail: 50,
          },
        },
      ]);
    }),
  );

  it.effect("up handler defaults to all services when names are invalid", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(true);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      yield* handleUp({ services: ["invalid-service"] }).pipe(Effect.provide(testLayer));

      expect(dockerServices.upCalls).toEqual([undefined]);
    }),
  );
});
