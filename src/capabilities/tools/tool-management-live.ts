import { Effect, Layer } from "effect";

import { ToolManagementTag, type ToolManagement, type ToolManager } from "~/capabilities/tools/tool-management-port";
import { BuiltToolRegistryTag, type BuiltToolRegistry } from "~/capabilities/tools/tool-registry-live";

/**
 * Effect Layer that provides the ToolManagementService implementation
 */
export const ToolManagementLiveLayer = Layer.effect(
  ToolManagementTag,
  Effect.gen(function* () {
    const toolRegistry = yield* BuiltToolRegistryTag;
    const tools = toolRegistry.managedTools.reduce<Record<string, ToolManager>>(
      (allTools, tool) => ({
        ...allTools,
        [tool.id]: tool.manager,
      }),
      {},
    );

    return {
      tools,
      listTools: () => toolRegistry.managedTools,
      listEssentialTools: () => toolRegistry.essentialManagedTools,
    } satisfies ToolManagement;
  }),
);
