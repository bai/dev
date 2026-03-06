import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import type { BunToolsService } from "~/capabilities/tools/adapters/bun-tools-live";
import { BunTools } from "~/capabilities/tools/adapters/bun-tools-live";
import type { DockerToolsService } from "~/capabilities/tools/adapters/docker-tools-live";
import { DockerTools } from "~/capabilities/tools/adapters/docker-tools-live";
import type { FzfToolsService } from "~/capabilities/tools/adapters/fzf-tools-live";
import { FzfTools } from "~/capabilities/tools/adapters/fzf-tools-live";
import type { GcloudToolsService } from "~/capabilities/tools/adapters/gcloud-tools-live";
import { GcloudTools } from "~/capabilities/tools/adapters/gcloud-tools-live";
import type { GitToolsService } from "~/capabilities/tools/adapters/git-tools-live";
import { GitTools } from "~/capabilities/tools/adapters/git-tools-live";
import type { MiseToolsService } from "~/capabilities/tools/adapters/mise-tools-live";
import { MiseTools } from "~/capabilities/tools/adapters/mise-tools-live";
import type { HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { ToolHealthRegistryLiveLayer } from "~/capabilities/tools/tool-health-registry-live";
import { ToolHealthRegistry } from "~/capabilities/tools/tool-health-registry-port";
import { BuiltToolRegistry, createToolRegistry } from "~/capabilities/tools/tool-registry-live";
import { healthCheckError } from "~/core/errors";

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
  const bunTools: BunToolsService = createVersionedToolStub(createResult("bun", "ok"));
  const gitTools: GitToolsService = createVersionedToolStub(createResult("git", "ok"));
  const miseTools: MiseToolsService = createVersionedToolStub(createResult("mise", "warning"));
  const fzfTools: FzfToolsService = createVersionedToolStub(createResult("fzf", "ok"));
  const gcloudTools: GcloudToolsService = {
    ...createVersionedToolStub(createResult("gcloud", "ok")),
    setupConfig: () => Effect.void,
  };
  const dockerTools: DockerToolsService = createDockerToolStub(createResult("docker", "ok"));
  const toolDependencies = {
    bunTools,
    dockerTools,
    fzfTools,
    gcloudTools,
    gitTools,
    miseTools,
  };

  const toolLayer = Layer.mergeAll(
    Layer.succeed(BunTools, bunTools),
    Layer.succeed(GitTools, gitTools),
    Layer.succeed(MiseTools, miseTools),
    Layer.succeed(FzfTools, fzfTools),
    Layer.succeed(GcloudTools, gcloudTools),
    Layer.succeed(DockerTools, dockerTools),
  );
  const builtToolRegistryLayer = Layer.provide(BuiltToolRegistry.DefaultWithoutDependencies, toolLayer);
  const layer = Layer.provide(ToolHealthRegistryLiveLayer, builtToolRegistryLayer);

  return {
    bunTools,
    gitTools,
    miseTools,
    fzfTools,
    gcloudTools,
    dockerTools,
    layer,
    toolDependencies,
  };
};

describe("tool-health-registry-live", () => {
  const loadRegistry = (layer: Layer.Layer<ToolHealthRegistry>) =>
    Effect.gen(function* () {
      return yield* ToolHealthRegistry;
    }).pipe(Effect.provide(layer));

  it.effect("returns all registered tools in stable order", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const registry = yield* loadRegistry(fixtures.layer);

      const tools = yield* registry.getRegisteredTools();

      expect(tools).toEqual(["bun", "docker", "fzf", "gcloud", "git", "mise"]);
    }),
  );

  it.effect("delegates specific tool checks and returns the tool result", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const registry = yield* loadRegistry(fixtures.layer);

      const result = yield* registry.checkTool("git");

      expect(result.toolName).toBe("git");
      expect(result.status).toBe("ok");
      expect(fixtures.gitTools.performHealthCheck).toHaveBeenCalledTimes(1);
      expect(fixtures.bunTools.performHealthCheck).not.toHaveBeenCalled();
    }),
  );

  it.effect("fails with HealthCheckError for unknown tools", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const registry = yield* loadRegistry(fixtures.layer);

      const error = yield* Effect.flip(registry.checkTool("not-registered"));

      expect(error._tag).toBe("HealthCheckError");
      expect(error.tool).toBe("not-registered");
      expect(error.message).toContain("Unknown tool");
    }),
  );

  it.effect("checks all tools and invokes all health checkers once", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const registry = yield* loadRegistry(fixtures.layer);

      const results = yield* registry.checkAllTools();

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
      const failingGitTools: GitToolsService = {
        ...fixtures.gitTools,
        performHealthCheck: () => Effect.fail(healthCheckError("git health check failed", "git")),
      };
      const toolLayer = Layer.mergeAll(
        Layer.succeed(BunTools, fixtures.bunTools),
        Layer.succeed(DockerTools, fixtures.dockerTools),
        Layer.succeed(FzfTools, fixtures.fzfTools),
        Layer.succeed(GcloudTools, fixtures.gcloudTools),
        Layer.succeed(GitTools, failingGitTools),
        Layer.succeed(MiseTools, fixtures.miseTools),
      );
      const registry = yield* loadRegistry(
        Layer.provide(ToolHealthRegistryLiveLayer, Layer.provide(BuiltToolRegistry.DefaultWithoutDependencies, toolLayer)),
      );

      const error = yield* Effect.flip(registry.checkAllTools());

      expect(error._tag).toBe("HealthCheckError");
      expect(error.tool).toBe("git");
      expect(error.message).toContain("git health check failed");
    }),
  );

  it.effect("wires ToolHealthRegistry through the Effect layer", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const registry = yield* ToolHealthRegistry.pipe(Effect.provide(fixtures.layer));

      const result = yield* registry.checkTool("docker");

      expect(result.toolName).toBe("docker");
      expect(result.status).toBe("ok");
    }),
  );
});
