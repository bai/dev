import { Effect, Layer } from "effect";

import { ToolHealthRegistry, type ToolHealthRegistryService } from "~/capabilities/tools/tool-health-registry-port";
import { BuiltToolRegistry, type BuiltToolRegistryService } from "~/capabilities/tools/tool-registry-live";
import { HealthCheckError } from "~/core/errors";

/**
 * Effect Layer for dependency injection
 */
export const ToolHealthRegistryLiveLayer = Layer.effect(
  ToolHealthRegistry,
  Effect.gen(function* () {
    const toolRegistry = yield* BuiltToolRegistry;
    const toolCheckers = toolRegistry.healthCheckers;

    return {
      getRegisteredTools: () => Effect.succeed(Array.from(toolCheckers.keys())),
      checkTool: (toolName: string) =>
        Effect.gen(function* () {
          const checker = toolCheckers.get(toolName);

          if (!checker) {
            return yield* new HealthCheckError({ message: `Unknown tool: ${toolName}`, tool: toolName });
          }

          return yield* checker();
        }),
      checkAllTools: () =>
        Effect.gen(function* () {
          const checkEffects = Array.from(toolCheckers.values()).map((checker) => checker());
          return yield* Effect.all(checkEffects, { concurrency: "unbounded" });
        }),
    } satisfies ToolHealthRegistryService;
  }),
);
