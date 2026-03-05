import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { ToolManagementTag } from "../../domain/tool-management-port";
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
import { ToolManagementLiveLayer } from "./tool-management-live";
import { BuiltToolRegistryLiveLayer } from "./tool-registry-live";

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
  const bunTools: BunTools = createVersionedToolMock("1.4.2", true);
  const gitTools: GitTools = createVersionedToolMock("2.60.1", true);
  const miseTools: MiseTools = createVersionedToolMock("2026.2.1", true);
  const fzfTools: FzfTools = createVersionedToolMock("0.20.0", false);
  const dockerTools: DockerTools = {
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
  const gcloudTools: GcloudTools = {
    ...createVersionedToolMock("552.0.0", true),
    setupConfig: vi.fn(() => Effect.void),
  };

  const dependencies = Layer.mergeAll(
    Layer.succeed(BunToolsTag, bunTools),
    Layer.succeed(DockerToolsTag, dockerTools),
    Layer.succeed(GitToolsTag, gitTools),
    Layer.succeed(MiseToolsTag, miseTools),
    Layer.succeed(FzfToolsTag, fzfTools),
    Layer.succeed(GcloudToolsTag, gcloudTools),
  );
  const builtToolRegistryLayer = Layer.provide(BuiltToolRegistryLiveLayer, dependencies);

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
      const toolManagement = yield* ToolManagementTag.pipe(Effect.provide(fixtures.layer));
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
      const toolManagement = yield* ToolManagementTag.pipe(Effect.provide(fixtures.layer));
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
      const toolManagement = yield* ToolManagementTag.pipe(Effect.provide(fixtures.layer));
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
      const toolManagement = yield* ToolManagementTag.pipe(Effect.provide(fixtures.layer));

      const essentialToolIds = toolManagement.listEssentialTools().map((tool) => tool.id);

      expect(essentialToolIds).toEqual(["bun", "git", "mise", "fzf", "gcloud"]);
    }),
  );
});
