import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { CommandRegistryTag } from "../domain/command-registry-port";
import {
  DockerServicesTag,
  type DockerServices,
  type ServiceName,
  type ServiceStatus,
} from "../domain/docker-services-port";
import type { HealthCheckResult } from "../domain/health-check-port";
import { CommandRegistryLiveLayer } from "../infra/command-registry-live";
import { registerServicesCommand, servicesCommand } from "./services-command";

class MockDockerServices implements DockerServices {
  public availabilityChecks = 0;
  public upCalls: Array<{ readonly services?: readonly ServiceName[]; readonly spanName: string }> = [];
  public downCalls: Array<{ readonly services?: readonly ServiceName[]; readonly spanName: string }> = [];
  public restartCalls: Array<{ readonly services?: readonly ServiceName[]; readonly spanName: string }> = [];
  public logsCalls: Array<{
    readonly service?: ServiceName;
    readonly options?: { follow?: boolean; tail?: number };
    readonly spanName: string;
  }> = [];
  public resetCalls: string[] = [];

  constructor(private readonly available: boolean) {}

  private currentSpanName(): Effect.Effect<string, never, never> {
    return Effect.currentSpan.pipe(
      Effect.map((span) => span.name),
      Effect.orElseSucceed(() => "missing-span"),
    );
  }

  up(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.upCalls.push({ services, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  down(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.downCalls.push({ services, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  restart(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.restartCalls.push({ services, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  status(): Effect.Effect<readonly ServiceStatus[], never, never> {
    return Effect.succeed([]);
  }

  logs(service?: ServiceName, options?: { follow?: boolean; tail?: number }): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.logsCalls.push({ service, options, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  reset(): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.resetCalls.push(spanName);
        }),
      ),
      Effect.asVoid,
    );
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

const runServicesCommand = (args: readonly string[], dockerServices: DockerServices) =>
  Command.run(servicesCommand, { name: "dev", version: "0.0.0" })(["node", "dev", ...args]).pipe(
    Effect.provide(Layer.succeed(DockerServicesTag, dockerServices)),
  ) as Effect.Effect<void, unknown, never>;

describe("services-command", () => {
  it.effect("registers services command in command registry", () =>
    Effect.gen(function* () {
      yield* registerServicesCommand;

      const registry = yield* CommandRegistryTag;
      const registered = yield* registry.getByName("services");
      const helpHandlers = yield* registry.getHelpHandlers();

      expect(registered).toBeDefined();
      expect(registered?.command).toBe(servicesCommand);
      expect(helpHandlers["services"]).toBeDefined();
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );

  it.effect("routes up subcommand to docker up with services.up span", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(true);

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
      const dockerServices = new MockDockerServices(true);

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
      const dockerServices = new MockDockerServices(true);

      yield* runServicesCommand(["reset"], dockerServices);

      expect(dockerServices.availabilityChecks).toBe(1);
      expect(dockerServices.resetCalls).toEqual(["services.reset"]);
    }),
  );

  it.effect("fails command execution when docker is unavailable", () =>
    Effect.gen(function* () {
      const dockerServices = new MockDockerServices(false);

      const error = yield* Effect.flip(runServicesCommand(["up", "postgres17"], dockerServices));

      expect(error).toMatchObject({
        _tag: "DockerServiceError",
      });
      expect(dockerServices.availabilityChecks).toBe(1);
      expect(dockerServices.upCalls).toHaveLength(0);
    }),
  );
});
