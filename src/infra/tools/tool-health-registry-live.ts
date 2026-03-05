import { Effect, Layer } from "effect";

import { healthCheckError, type HealthCheckError } from "../../domain/errors";
import { ToolHealthRegistryTag, type ToolHealthRegistry } from "../../domain/tool-health-registry-port";
import { BuiltToolRegistryTag, type BuiltToolRegistry } from "./tool-registry-live";

/**
 * Factory function to create ToolHealthRegistryPort implementation
 */
export const makeToolHealthRegistryLive = (toolRegistry: BuiltToolRegistry): ToolHealthRegistry => {
  const toolCheckers = toolRegistry.healthCheckers;

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
            return healthCheckError(`Unexpected missing checker for tool: ${toolName}`, toolName);
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
    const toolRegistry = yield* BuiltToolRegistryTag;

    return makeToolHealthRegistryLive(toolRegistry);
  }),
);
