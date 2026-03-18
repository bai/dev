import path from "path";

import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { createDockerServicesLiveLayer } from "~/capabilities/services/docker-services-live";
import { DockerServices } from "~/capabilities/services/docker-services-port";
import { FileSystemMock } from "~/capabilities/system/file-system-mock";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell } from "~/capabilities/system/shell-port";
import type { Config } from "~/core/config/config-schema";
import { StatePaths } from "~/core/runtime/path-service";
import { makeStatePathsMock } from "~/core/runtime/path-service-mock";

const makeSubject = (services?: Config["services"]) => {
  const shell = new ShellMock();
  const fileSystem = new FileSystemMock();
  const statePaths = makeStatePathsMock({
    stateDir: "/tmp/dev-state",
    dockerDir: "/tmp/dev-state/docker",
  });
  const composeFilePath = path.join(statePaths.dockerDir, "docker-compose.yml");
  const dockerServices = Effect.gen(function* () {
    return yield* DockerServices;
  }).pipe(
    Effect.provide(
      Layer.provide(
        createDockerServicesLiveLayer(services),
        Layer.mergeAll(Layer.succeed(Shell, shell), Layer.succeed(FileSystem, fileSystem), Layer.succeed(StatePaths, statePaths)),
      ),
    ),
  );

  return {
    shell,
    fileSystem,
    dockerServices,
    composeFilePath,
  };
};

describe("docker-services-live", () => {
  it.effect("uses the state paths compose location for docker compose up", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      const composeDir = path.dirname(composeFilePath);

      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "up", "-d", "postgres17"], {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

      const service = yield* dockerServices;
      yield* service.up(["postgres17"]);

      expect(fileSystem.mkdirCalls).toEqual([{ path: composeDir, recursive: true }]);
      expect(fileSystem.writeFileCalls[0]?.path).toBe(composeFilePath);
      expect(fileSystem.writeFileCalls[0]?.content).toContain("name: dev-services");
      expect(shell.execCalls[0]?.args).toEqual(["compose", "-f", composeFilePath, "up", "-d", "postgres17"]);
    }),
  );

  it.effect("renders configured ports into the compose file when custom ports are enabled", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject({
        postgres17: { port: 65432 },
        valkey: { port: 56380 },
      });

      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "up", "-d", "postgres17", "valkey"], {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

      const service = yield* dockerServices;
      yield* service.up();

      expect(fileSystem.writeFileCalls[0]?.content).toContain('"65432:5432"');
      expect(fileSystem.writeFileCalls[0]?.content).toContain('"56380:6379"');
    }),
  );

  it.effect("rewrites the compose file when the desired port mapping changes", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject({
        postgres17: { port: 65432 },
      });

      fileSystem.existingPaths.add(composeFilePath);
      fileSystem.readFileContents.set(composeFilePath, "stale compose file");
      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "up", "-d", "postgres17"], {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

      const service = yield* dockerServices;
      yield* service.up(["postgres17"]);

      expect(fileSystem.writeFileCalls).toHaveLength(1);
      expect(fileSystem.writeFileCalls[0]?.content).toContain('"65432:5432"');
    }),
  );

  it.effect("maps non-zero compose execution to DockerServiceError for status", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      fileSystem.existingPaths.add(composeFilePath);

      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "ps", "--format", "json", "-a"], {
        exitCode: 1,
        stdout: "",
        stderr: "compose ps failed",
      });

      const service = yield* dockerServices;
      const error = yield* Effect.flip(service.status());

      expect(error).toMatchObject({
        _tag: "DockerServiceError",
        message: "Failed to get service status",
        serviceExitCode: 1,
        stderr: "compose ps failed",
      });
    }),
  );

  it.effect("treats SIGINT (130) from interactive logs as graceful", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      fileSystem.existingPaths.add(composeFilePath);

      shell.setExecInteractiveResponse("docker", ["compose", "-f", composeFilePath, "logs", "-f", "--tail", "20", "valkey"], 130);

      const service = yield* dockerServices;
      yield* service.logs("valkey", { follow: true, tail: 20 });

      expect(shell.execInteractiveCalls[0]?.args).toEqual(["compose", "-f", composeFilePath, "logs", "-f", "--tail", "20", "valkey"]);
    }),
  );

  it.effect("returns false when docker info command fails", () =>
    Effect.gen(function* () {
      const { shell, dockerServices } = makeSubject();
      shell.setExecFailure("docker", ["info"]);

      const service = yield* dockerServices;
      const isAvailable = yield* service.isDockerAvailable();

      expect(isAvailable).toBe(false);
    }),
  );
});
