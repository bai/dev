import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "~/capabilities/system/shell-mock";
import { DOCKER_MIN_VERSION, makeDockerToolsLive } from "~/capabilities/tools/adapters/docker-tools-live";

describe("docker-tools-live", () => {
  it.effect("parses docker and compose versions", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("docker", ["--version"], {
        exitCode: 0,
        stdout: "Docker version 29.1.4, build abc",
        stderr: "",
      });
      shell.setExecResponse("docker", ["compose", "version"], {
        exitCode: 0,
        stdout: "Docker Compose version v2.32.4",
        stderr: "",
      });

      const dockerTools = makeDockerToolsLive(shell);
      const dockerVersion = yield* dockerTools.getDockerVersion();
      const composeVersion = yield* dockerTools.getComposeVersion();

      expect(dockerVersion).toBe("29.1.4");
      expect(composeVersion).toBe("2.32.4");
    }),
  );

  it.effect("health check fails when docker is unavailable", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("docker", ["--version"]);

      const dockerTools = makeDockerToolsLive(shell);
      const result = yield* dockerTools.performHealthCheck();

      expect(result.toolName).toBe("docker");
      expect(result.status).toBe("fail");
      expect(result.notes).toContain("Docker not found");
    }),
  );

  it.effect("health check warns when docker is below minimum version", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("docker", ["--version"], {
        exitCode: 0,
        stdout: "Docker version 28.0.0, build abc",
        stderr: "",
      });
      shell.setExecResponse("docker", ["compose", "version"], {
        exitCode: 0,
        stdout: "Docker Compose version v2.31.0",
        stderr: "",
      });

      const dockerTools = makeDockerToolsLive(shell);
      const result = yield* dockerTools.performHealthCheck();

      expect(result.toolName).toBe("docker");
      expect(result.status).toBe("warning");
      expect(result.notes).toContain(`requires >=${DOCKER_MIN_VERSION}`);
      expect(result.version).toContain("compose 2.31.0");
    }),
  );

  it.effect("health check reports ok when docker is compliant", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("docker", ["--version"], {
        exitCode: 0,
        stdout: "Docker version 29.1.4, build abc",
        stderr: "",
      });
      shell.setExecResponse("docker", ["compose", "version"], {
        exitCode: 0,
        stdout: "Docker Compose version v2.32.4",
        stderr: "",
      });

      const dockerTools = makeDockerToolsLive(shell);
      const result = yield* dockerTools.performHealthCheck();

      expect(result.toolName).toBe("docker");
      expect(result.status).toBe("ok");
      expect(result.version).toContain("29.1.4");
    }),
  );
});
