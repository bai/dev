import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { makeDockerServicesLive } from "./docker-services-live";
import { FileSystemMock } from "./file-system-mock";
import { makePathServiceMock } from "./path-service-mock";
import { ShellMock } from "./shell-mock";

const makeSubject = () => {
  const shell = new ShellMock();
  const fileSystem = new FileSystemMock();
  const pathService = makePathServiceMock({
    homeDir: "/home/user",
    baseSearchPath: "/home/user/src",
    dataDir: "/tmp/dev-data",
    dbPath: "/tmp/dev-data/dev.db",
    cacheDir: "/tmp/dev-cache",
  });
  const dockerServices = makeDockerServicesLive(shell, fileSystem, pathService);
  const composeFilePath = path.join(pathService.dataDir, "docker", "docker-compose.yml");

  return {
    shell,
    fileSystem,
    dockerServices,
    composeFilePath,
  };
};

describe("docker-services-live", () => {
  it.effect("uses the path service compose location for docker compose up", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      const composeDir = path.dirname(composeFilePath);

      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "up", "-d", "postgres17"], {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

      yield* dockerServices.up(["postgres17"]);

      expect(fileSystem.mkdirCalls).toEqual([{ path: composeDir, recursive: true }]);
      expect(fileSystem.writeFileCalls[0]?.path).toBe(composeFilePath);
      expect(fileSystem.writeFileCalls[0]?.content).toContain("name: dev-services");
      expect(shell.execCalls[0]?.args).toEqual(["compose", "-f", composeFilePath, "up", "-d", "postgres17"]);
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

      const error = yield* Effect.flip(dockerServices.status());

      expect(error).toMatchObject({
        _tag: "DockerServiceError",
        reason: "Failed to get service status",
        exitCode: 1,
        stderr: "compose ps failed",
      });
    }),
  );

  it.effect("treats SIGINT (130) from interactive logs as graceful", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      fileSystem.existingPaths.add(composeFilePath);

      shell.setExecInteractiveResponse("docker", ["compose", "-f", composeFilePath, "logs", "-f", "--tail", "20", "valkey"], 130);

      yield* dockerServices.logs("valkey", { follow: true, tail: 20 });

      expect(shell.execInteractiveCalls[0]?.args).toEqual(["compose", "-f", composeFilePath, "logs", "-f", "--tail", "20", "valkey"]);
    }),
  );

  it.effect("returns false when docker info command fails", () =>
    Effect.gen(function* () {
      const { shell, dockerServices } = makeSubject();
      shell.setExecFailure("docker", ["info"]);

      const isAvailable = yield* dockerServices.isDockerAvailable();

      expect(isAvailable).toBe(false);
    }),
  );
});
