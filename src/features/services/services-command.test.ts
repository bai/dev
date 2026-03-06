import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { CommandRegistryLiveLayer } from "~/bootstrap/command-registry-live";
import { CommandRegistry } from "~/bootstrap/command-registry-port";
import { DockerServicesMock } from "~/capabilities/services/docker-services-mock";
import { DockerServices, type DockerServicesService } from "~/capabilities/services/docker-services-port";
import { registerServicesCommand, servicesCommand } from "~/features/services/services-command";

const runServicesCommand = (args: readonly string[], dockerServices: DockerServicesService) =>
  Command.run(servicesCommand, { name: "dev", version: "0.0.0" })(["node", "dev", ...args]).pipe(
    Effect.provide(Layer.succeed(DockerServices, dockerServices)),
  ) as Effect.Effect<void, unknown, never>;

describe("services-command", () => {
  it.effect("registers services command in command registry", () =>
    Effect.gen(function* () {
      yield* registerServicesCommand;

      const registry = yield* CommandRegistry;
      const registered = yield* registry.getByName("services");

      expect(registered).toBeDefined();
      expect(registered?.command).toBe(servicesCommand);
      expect(registered?.displayHelp).toBeDefined();
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );

  it.effect("routes up subcommand to docker up with services.up span", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(true);

      yield* runServicesCommand(["up", "postgres17"], dockerServices);

      expect(dockerServices.availabilityChecks).toBe(1);
      expect(dockerServices.upCalls).toEqual([
        {
          services: ["postgres17"],
          spanName: "services.up",
        },
      ]);
    }),
  );

  it.effect("routes logs subcommand to docker logs with parsed options and services.logs span", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(true);

      yield* runServicesCommand(["logs", "valkey", "--follow", "--tail", "25"], dockerServices);

      expect(dockerServices.availabilityChecks).toBe(1);
      expect(dockerServices.logsCalls).toEqual([
        {
          service: "valkey",
          options: {
            follow: true,
            tail: 25,
          },
          spanName: "services.logs",
        },
      ]);
    }),
  );

  it.effect("routes reset subcommand with services.reset span", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(true);

      yield* runServicesCommand(["reset"], dockerServices);

      expect(dockerServices.availabilityChecks).toBe(1);
      expect(dockerServices.resetCalls).toEqual(["services.reset"]);
    }),
  );

  it.effect("fails command execution when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new DockerServicesMock(false);

      const error = yield* Effect.flip(runServicesCommand(["up", "postgres17"], dockerServices));

      expect(error).toMatchObject({
        _tag: "DockerServiceError",
      });
      expect(dockerServices.availabilityChecks).toBe(1);
      expect(dockerServices.upCalls).toHaveLength(0);
    }),
  );
});
