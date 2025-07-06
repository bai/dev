import { Effect, Layer } from "effect";

import { healthCheckError, type HealthCheckError } from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/ports/health-check-port";
import { ToolHealthRegistryPortTag, type ToolHealthRegistryPort } from "../../domain/ports/tool-health-registry-port";
import { BunToolsTag, type BunTools } from "../tools/bun";
import { FzfToolsTag, type FzfTools } from "../tools/fzf";
import { GcloudToolsTag, type GcloudTools } from "../tools/gcloud";
import { GitToolsTag, type GitTools } from "../tools/git";
import { MiseToolsTag, type MiseTools } from "../tools/mise";

/**
 * Factory function to create ToolHealthRegistryPort implementation
 */
export const makeToolHealthRegistryLive = (
  bunTools: BunTools,
  gitTools: GitTools,
  miseTools: MiseTools,
  fzfTools: FzfTools,
  gcloudTools: GcloudTools,
): ToolHealthRegistryPort => {
  // Map of tool names to their health check functions
  const toolCheckers = new Map<string, () => Effect.Effect<HealthCheckResult, HealthCheckError>>([
    ["bun", () => bunTools.performHealthCheck()],
    ["git", () => gitTools.performHealthCheck()],
    ["mise", () => miseTools.performHealthCheck()],
    ["fzf", () => fzfTools.performHealthCheck()],
    ["gcloud", () => gcloudTools.performHealthCheck()],
  ]);

  return {
    getRegisteredTools: () => Effect.succeed(Array.from(toolCheckers.keys())),

    checkTool: (toolName: string) =>
      Effect.gen(function* () {
        const checker = toolCheckers.get(toolName);
        
        if (!checker) {
          return yield* Effect.fail(
            healthCheckError(`Unknown tool: ${toolName}`, toolName)
          );
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
export const ToolHealthRegistryPortLiveLayer = Layer.effect(
  ToolHealthRegistryPortTag,
  Effect.gen(function* () {
    const bunTools = yield* BunToolsTag;
    const gitTools = yield* GitToolsTag;
    const miseTools = yield* MiseToolsTag;
    const fzfTools = yield* FzfToolsTag;
    const gcloudTools = yield* GcloudToolsTag;

    return makeToolHealthRegistryLive(bunTools, gitTools, miseTools, fzfTools, gcloudTools);
  }),
);