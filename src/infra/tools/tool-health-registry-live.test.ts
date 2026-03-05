import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { healthCheckError } from "../../domain/errors";
import type { HealthCheckResult } from "../../domain/health-check-port";
import { ToolHealthRegistryTag } from "../../domain/tool-health-registry-port";
import type { BunTools } from "./bun-tools-live";
import { BunToolsTag } from "./bun-tools-live";
import type { DockerTools } from "./docker-tools-live";
import { DockerToolsTag } from "./docker-tools-live";
import type { FzfTools } from "./fzf-tools-live";
import { FzfToolsTag } from "./fzf-tools-live";
import type { GcloudTools } from "./gcloud-tools-live";
import { GcloudToolsTag } from "./gcloud-tools-live";
import type { GitTools } from "./git-tools-live";
import { GitToolsTag } from "./git-tools-live";
import type { MiseTools } from "./mise-tools-live";
import { MiseToolsTag } from "./mise-tools-live";
import { makeToolHealthRegistryLive, ToolHealthRegistryLiveLayer } from "./tool-health-registry-live";
import { BuiltToolRegistryLiveLayer, createToolRegistry } from "./tool-registry-live";

const createResult = (toolName: string, status: "ok" | "warning" | "fail"): HealthCheckResult => ({
  toolName,
  status,
  checkedAt: new Date("2026-01-01T00:00:00.000Z"),
  version: "1.0.0",
});

const createVersionedToolStub = (result: HealthCheckResult) => ({
  getCurrentVersion: () => Effect.succeed(result.version ?? null),
  checkVersion: () => Effect.succeed({ isValid: result.status !== "fail", currentVersion: result.version ?? null }),
  performUpgrade: () => Effect.succeed(true),
  ensureVersionOrUpgrade: () => Effect.void,
  performHealthCheck: vi.fn(() => Effect.succeed(result)),
});

const createDockerToolStub = (result: HealthCheckResult) => ({
  getDockerVersion: () => Effect.succeed(result.version ?? null),
  getComposeVersion: () => Effect.succeed("2.32.4"),
  performHealthCheck: vi.fn(() => Effect.succeed(result)),
});

const createFixtures = () => {
  const bunTools: BunTools = createVersionedToolStub(createResult("bun", "ok"));
  const gitTools: GitTools = createVersionedToolStub(createResult("git", "ok"));
  const miseTools: MiseTools = createVersionedToolStub(createResult("mise", "warning"));
  const fzfTools: FzfTools = createVersionedToolStub(createResult("fzf", "ok"));
  const gcloudTools: GcloudTools = {
    ...createVersionedToolStub(createResult("gcloud", "ok")),
    setupConfig: () => Effect.void,
  };
  const dockerTools: DockerTools = createDockerToolStub(createResult("docker", "ok"));
  const toolDependencies = {
    bunTools,
    dockerTools,
    fzfTools,
    gcloudTools,
    gitTools,
    miseTools,
  };

  const toolLayer = Layer.mergeAll(
    Layer.succeed(BunToolsTag, bunTools),
    Layer.succeed(GitToolsTag, gitTools),
    Layer.succeed(MiseToolsTag, miseTools),
    Layer.succeed(FzfToolsTag, fzfTools),
    Layer.succeed(GcloudToolsTag, gcloudTools),
    Layer.succeed(DockerToolsTag, dockerTools),
  );
  const builtToolRegistryLayer = Layer.provide(BuiltToolRegistryLiveLayer, toolLayer);
  const layer = Layer.provide(ToolHealthRegistryLiveLayer, builtToolRegistryLayer);

  const registry = makeToolHealthRegistryLive(createToolRegistry(toolDependencies));

  return {
    bunTools,
    gitTools,
    miseTools,
    fzfTools,
    gcloudTools,
    dockerTools,
    layer,
    registry,
  };
};

describe("tool-health-registry-live", () => {
  it.effect("returns all registered tools in stable order", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();

      const tools = yield* fixtures.registry.getRegisteredTools();

      expect(tools).toEqual(["bun", "docker", "fzf", "gcloud", "git", "mise"]);
    }),
  );

  it.effect("delegates specific tool checks and returns the tool result", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();

      const result = yield* fixtures.registry.checkTool("git");

      expect(result.toolName).toBe("git");
      expect(result.status).toBe("ok");
      expect(fixtures.gitTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.bunTools.performHealthCheck).not.toHaveBeenCalled();
    }),
  );

  it.effect("fails with HealthCheckError for unknown tools", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();

      const error = yield* Effect.flip(fixtures.registry.checkTool("not-registered"));

      expect(error._tag).toBe("HealthCheckError");
      expect(error.tool).toBe("not-registered");
      expect(error.reason).toContain("Unknown tool");
    }),
  );

  it.effect("checks all tools and invokes all health checkers once", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();

      const results = yield* fixtures.registry.checkAllTools();

      expect(results.map((result) => result.toolName)).toEqual(["bun", "docker", "fzf", "gcloud", "git", "mise"]);
      expect(fixtures.bunTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.dockerTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.fzfTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.gcloudTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.gitTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.miseTools.performHealthCheck).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("propagates checker failures from checkAllTools", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const failingGitTools: GitTools = {
        ...fixtures.gitTools,
        performHealthCheck: () => Effect.fail(healthCheckError("git health check failed", "git")),
      };
      const registry = makeToolHealthRegistryLive(
        createToolRegistry({
          bunTools: fixtures.bunTools,
          dockerTools: fixtures.dockerTools,
          fzfTools: fixtures.fzfTools,
          gcloudTools: fixtures.gcloudTools,
          gitTools: failingGitTools,
          miseTools: fixtures.miseTools,
        }),
      );

      const error = yield* Effect.flip(registry.checkAllTools());

      expect(error._tag).toBe("HealthCheckError");
      expect(error.tool).toBe("git");
      expect(error.reason).toContain("git health check failed");
    }),
  );

  it.effect("wires ToolHealthRegistry through the Effect layer", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const registry = yield* ToolHealthRegistryTag.pipe(Effect.provide(fixtures.layer));

      const result = yield* registry.checkTool("docker");

      expect(result.toolName).toBe("docker");
      expect(result.status).toBe("ok");
    }),
  );
});
