import { Effect, Layer } from "effect";

import { ToolManagement, type ToolManagementService, type ToolManager } from "~/capabilities/tools/tool-management-port";
import { BuiltToolRegistry, type BuiltToolRegistryService } from "~/capabilities/tools/tool-registry-live";

/**
 * Effect Layer that provides the ToolManagementService implementation
 */
export const ToolManagementLiveLayer = Layer.effect(
  ToolManagement,
  Effect.gen(function* () {
    const toolRegistry = yield* BuiltToolRegistry;
    const tools = Object.fromEntries(toolRegistry.managedTools.map((tool) => [tool.id, tool.manager] as const)) as Record<
      string,
      ToolManager
    >;

    return {
      tools,
      listTools: () => toolRegistry.managedTools,
      listEssentialTools: () => toolRegistry.essentialManagedTools,
    } satisfies ToolManagementService;
  }),
);
