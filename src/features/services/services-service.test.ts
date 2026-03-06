import { it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import { DockerServicesMock } from "~/capabilities/services/docker-services-mock";
import { DockerServicesTag } from "~/capabilities/services/docker-services-port";
import { handleDown, handleLogs, handleReset, handleRestart, handleUp, withDocker } from "~/features/services/services-service";

describe("services-service", () => {
  it.effect("withDocker short-circuits when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(false);
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
      const dockerServices = new DockerServicesMock(true);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      const result = yield* withDocker((_docker) => Effect.succeed("ok")).pipe(Effect.provide(testLayer));

      expect(result).toBe("ok");
      expect(dockerServices.availabilityChecks).toBe(1);
    }),
  );

  it.effect("all service handlers short-circuit when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(false);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      const upError = yield* Effect.flip(handleUp({ services: ["postgres17"] }).pipe(Effect.provide(testLayer)));
      const downError = yield* Effect.flip(handleDown({ services: ["postgres17"] }).pipe(Effect.provide(testLayer)));
      const restartError = yield* Effect.flip(handleRestart({ services: ["postgres17"] }).pipe(Effect.provide(testLayer)));
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
      expect(dockerServices.resetCalls).toHaveLength(0);
    }),
  );

  it.effect("logs handler passes validated service and tail options", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(true);
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
          spanName: "missing-span",
        },
      ]);
    }),
  );

  it.effect("up handler defaults to all services when names are invalid", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(true);
      const testLayer = Layer.succeed(DockerServicesTag, dockerServices);

      yield* handleUp({ services: ["invalid-service"] }).pipe(Effect.provide(testLayer));

      expect(dockerServices.upCalls).toEqual([
        {
          services: undefined,
          spanName: "missing-span",
        },
      ]);
    }),
  );
});
