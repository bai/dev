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
import { servicesCommandTestables } from "./services-command";

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

describe("services-command", () => {
  it.effect("withDocker short-circuits when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(false);
      let executed = false;
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      yield* servicesCommandTestables
        .withDocker((_docker) =>
          Effect.sync(() => {
            executed = true;
          }),
        )
        .pipe(Effect.provide(testLayer));

      expect(executed).toBe(false);
      expect(dockerServices.availabilityChecks).toBe(1);
    }),
  );

  it.effect("withDocker executes handler when docker is available", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(true);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      const result = yield* servicesCommandTestables
        .withDocker((_docker) => Effect.succeed("ok"))
        .pipe(Effect.provide(testLayer));

      expect(result).toBe("ok");
      expect(dockerServices.availabilityChecks).toBe(1);
    }),
  );

  it.effect("all service handlers short-circuit when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(false);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      yield* servicesCommandTestables.upHandler({ services: ["postgres17"] }).pipe(Effect.provide(testLayer));
      yield* servicesCommandTestables.downHandler({ services: ["postgres17"] }).pipe(Effect.provide(testLayer));
      yield* servicesCommandTestables.restartHandler({ services: ["postgres17"] }).pipe(Effect.provide(testLayer));
      yield* servicesCommandTestables
        .logsHandler({ service: ["postgres17"], follow: false, tail: Option.none() })
        .pipe(Effect.provide(testLayer));
      yield* servicesCommandTestables.resetHandler().pipe(Effect.provide(testLayer));

      expect(dockerServices.availabilityChecks).toBe(5);
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

      yield* servicesCommandTestables
        .logsHandler({
          service: ["invalid-service", "valkey"],
          follow: true,
          tail: Option.some(50),
        })
        .pipe(Effect.provide(testLayer));

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

      yield* servicesCommandTestables.upHandler({ services: ["invalid-service"] }).pipe(Effect.provide(testLayer));

      expect(dockerServices.upCalls).toEqual([undefined]);
    }),
  );
});
