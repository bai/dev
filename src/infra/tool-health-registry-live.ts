import { Effect, Layer } from "effect";

import { healthCheckError, type HealthCheckError } from "../domain/errors";
import { type HealthCheckResult } from "../domain/health-check-port";
import { ToolHealthRegistryTag, type ToolHealthRegistry } from "../domain/tool-health-registry-port";
import { BunToolsTag, type BunTools } from "./bun-tools-live";
import { DockerToolsTag, type DockerTools } from "./docker-tools-live";
import { FzfToolsTag, type FzfTools } from "./fzf-tools-live";
import { GcloudToolsTag, type GcloudTools } from "./gcloud-tools-live";
import { GitToolsTag, type GitTools } from "./git-tools-live";
import { MiseToolsTag, type MiseTools } from "./mise-tools-live";

/**
 * Factory function to create ToolHealthRegistryPort implementation
 */
export const makeToolHealthRegistryLive = (
  bunTools: BunTools,
  gitTools: GitTools,
  miseTools: MiseTools,
  fzfTools: FzfTools,
  gcloudTools: GcloudTools,
  dockerTools: DockerTools,
): ToolHealthRegistry => {
  // Map of tool names to their health check functions
  const toolCheckers = new Map<string, () => Effect.Effect<HealthCheckResult, HealthCheckError>>([
    ["bun", () => bunTools.performHealthCheck()],
    ["docker", () => dockerTools.performHealthCheck()],
    ["fzf", () => fzfTools.performHealthCheck()],
    ["gcloud", () => gcloudTools.performHealthCheck()],
    ["git", () => gitTools.performHealthCheck()],
    ["mise", () => miseTools.performHealthCheck()],
  ]);

  return {
    getRegisteredTools: () => Effect.succeed(Array.from(toolCheckers.keys())),

    checkTool: (toolName: string) =>
      Effect.gen(function* () {
        const checker = toolCheckers.get(toolName);

        if (!checker) {
          return yield* healthCheckError(`Unknown tool: ${toolName}`, toolName);
        }

        return yield* checker();
      }),

    checkAllTools: () =>
      Effect.gen(function* () {
        const tools = Array.from(toolCheckers.keys());
        const checkEffects = tools.map((toolName) => {
          const checker = toolCheckers.get(toolName);
          if (!checker) {
            // This should never happen since we're iterating over keys from the map
            return Effect.fail(healthCheckError(`Unexpected missing checker for tool: ${toolName}`, toolName));
          }
          return checker();
        });

        return yield* Effect.all(checkEffects, { concurrency: "unbounded" });
      }),
  };
};

/**
 * Effect Layer for dependency injection
 */
export const ToolHealthRegistryLiveLayer = Layer.effect(
  ToolHealthRegistryTag,
  Effect.gen(function* () {
    const bunTools = yield* BunToolsTag;
    const gitTools = yield* GitToolsTag;
    const miseTools = yield* MiseToolsTag;
    const fzfTools = yield* FzfToolsTag;
    const gcloudTools = yield* GcloudToolsTag;
    const dockerTools = yield* DockerToolsTag;

    return makeToolHealthRegistryLive(bunTools, gitTools, miseTools, fzfTools, gcloudTools, dockerTools);
  }),
);
