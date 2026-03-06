import { Effect, Layer } from "effect";

import { ToolHealthRegistryTag, type ToolHealthRegistry } from "~/capabilities/tools/tool-health-registry-port";
import { BuiltToolRegistryTag, type BuiltToolRegistry } from "~/capabilities/tools/tool-registry-live";
import { healthCheckError, type HealthCheckError } from "~/core/errors";

/**
 * Effect Layer for dependency injection
 */
export const ToolHealthRegistryLiveLayer = Layer.effect(
  ToolHealthRegistryTag,
  Effect.gen(function* () {
    const toolRegistry = yield* BuiltToolRegistryTag;
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
          const checkEffects = Array.from(toolCheckers.values()).map((checker) => checker());
          return yield* Effect.all(checkEffects, { concurrency: "unbounded" });
        }),
    } satisfies ToolHealthRegistry;
  }),
);
