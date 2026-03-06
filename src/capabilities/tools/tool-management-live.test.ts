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
import { ToolManagementLiveLayer } from "~/capabilities/tools/tool-management-live";
import { ToolManagement } from "~/capabilities/tools/tool-management-port";
import { BuiltToolRegistry } from "~/capabilities/tools/tool-registry-live";

const createVersionedToolMock = (version: string, isValid: boolean) => ({
  getCurrentVersion: vi.fn(() => Effect.succeed(version)),
  checkVersion: vi.fn(() => Effect.succeed({ isValid, currentVersion: version })),
  performUpgrade: vi.fn(() => Effect.succeed(true)),
  ensureVersionOrUpgrade: vi.fn(() => Effect.void),
  performHealthCheck: vi.fn(() =>
    Effect.succeed({
      toolName: "tool",
      version,
      status: isValid ? ("ok" as const) : ("warning" as const),
      checkedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  ),
});

const createFixtures = () => {
  const bunTools: BunToolsService = createVersionedToolMock("1.4.2", true);
  const gitTools: GitToolsService = createVersionedToolMock("2.60.1", true);
  const miseTools: MiseToolsService = createVersionedToolMock("2026.2.1", true);
  const fzfTools: FzfToolsService = createVersionedToolMock("0.20.0", false);
  const dockerTools: DockerToolsService = {
    getDockerVersion: vi.fn(() => Effect.succeed("29.1.3")),
    getComposeVersion: vi.fn(() => Effect.succeed("2.32.4")),
    performHealthCheck: vi.fn(() =>
      Effect.succeed({
        toolName: "docker",
        version: "29.1.3 (compose 2.32.4)",
        status: "ok" as const,
        checkedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ),
  };
  const gcloudTools: GcloudToolsService = {
    ...createVersionedToolMock("552.0.0", true),
    setupConfig: vi.fn(() => Effect.void),
  };

  const dependencies = Layer.mergeAll(
    Layer.succeed(BunTools, bunTools),
    Layer.succeed(DockerTools, dockerTools),
    Layer.succeed(GitTools, gitTools),
    Layer.succeed(MiseTools, miseTools),
    Layer.succeed(FzfTools, fzfTools),
    Layer.succeed(GcloudTools, gcloudTools),
  );
  const builtToolRegistryLayer = Layer.provide(BuiltToolRegistry.DefaultWithoutDependencies, dependencies);

  return {
    bunTools,
    dockerTools,
    gitTools,
    miseTools,
    fzfTools,
    gcloudTools,
    layer: Layer.provide(ToolManagementLiveLayer, builtToolRegistryLayer),
  };
};

describe("tool-management-live", () => {
  it.effect("wires each tool manager to its matching tool service", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const toolManagement = yield* ToolManagement.pipe(Effect.provide(fixtures.layer));
      const bunManager = yield* Effect.fromNullable(toolManagement.tools["bun"]).pipe(
        Effect.orElseFail(() => new Error("Missing bun tool manager")),
      );
      const gitManager = yield* Effect.fromNullable(toolManagement.tools["git"]).pipe(
        Effect.orElseFail(() => new Error("Missing git tool manager")),
      );
      const miseManager = yield* Effect.fromNullable(toolManagement.tools["mise"]).pipe(
        Effect.orElseFail(() => new Error("Missing mise tool manager")),
      );
      const fzfManager = yield* Effect.fromNullable(toolManagement.tools["fzf"]).pipe(
        Effect.orElseFail(() => new Error("Missing fzf tool manager")),
      );
      const gcloudManager = yield* Effect.fromNullable(toolManagement.tools["gcloud"]).pipe(
        Effect.orElseFail(() => new Error("Missing gcloud tool manager")),
      );

      const bunVersion = yield* bunManager.getCurrentVersion();
      const gitVersion = yield* gitManager.getCurrentVersion();
      const miseVersion = yield* miseManager.getCurrentVersion();
      const fzfVersion = yield* fzfManager.getCurrentVersion();
      const gcloudVersion = yield* gcloudManager.getCurrentVersion();

      expect(bunVersion).toBe("1.4.2");
      expect(gitVersion).toBe("2.60.1");
      expect(miseVersion).toBe("2026.2.1");
      expect(fzfVersion).toBe("0.20.0");
      expect(gcloudVersion).toBe("552.0.0");
      expect(fixtures.bunTools.getCurrentVersion).toHaveBeenCalledTimes(1);
      expect(fixtures.gitTools.getCurrentVersion).toHaveBeenCalledTimes(1);
      expect(fixtures.miseTools.getCurrentVersion).toHaveBeenCalledTimes(1);
      expect(fixtures.fzfTools.getCurrentVersion).toHaveBeenCalledTimes(1);
      expect(fixtures.gcloudTools.getCurrentVersion).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("delegates upgrade calls without cross-wiring other tools", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const toolManagement = yield* ToolManagement.pipe(Effect.provide(fixtures.layer));
      const gitManager = yield* Effect.fromNullable(toolManagement.tools["git"]).pipe(
        Effect.orElseFail(() => new Error("Missing git tool manager")),
      );

      const upgraded = yield* gitManager.performUpgrade();

      expect(upgraded).toBe(true);
      expect(fixtures.gitTools.performUpgrade).toHaveBeenCalledTimes(1);
      expect(fixtures.bunTools.performUpgrade).not.toHaveBeenCalled();
      expect(fixtures.miseTools.performUpgrade).not.toHaveBeenCalled();
      expect(fixtures.fzfTools.performUpgrade).not.toHaveBeenCalled();
      expect(fixtures.gcloudTools.performUpgrade).not.toHaveBeenCalled();
    }),
  );

  it.effect("preserves checkVersion result payloads from tool services", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const toolManagement = yield* ToolManagement.pipe(Effect.provide(fixtures.layer));
      const fzfManager = yield* Effect.fromNullable(toolManagement.tools["fzf"]).pipe(
        Effect.orElseFail(() => new Error("Missing fzf tool manager")),
      );

      const fzfVersion = yield* fzfManager.checkVersion();

      expect(fzfVersion).toEqual({
        isValid: false,
        currentVersion: "0.20.0",
      });
      expect(fixtures.fzfTools.checkVersion).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("exposes essential tool metadata from the registry", () =>
    Effect.gen(function* () {
      const fixtures = createFixtures();
      const toolManagement = yield* ToolManagement.pipe(Effect.provide(fixtures.layer));

      const essentialToolIds = toolManagement.listEssentialTools().map((tool) => tool.id);

      expect(essentialToolIds).toEqual(["bun", "git", "mise", "fzf", "gcloud"]);
    }),
  );
});
