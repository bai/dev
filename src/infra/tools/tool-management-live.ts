import { Effect, Layer } from "effect";

import { ToolManagementTag, type ToolManagement, type ToolManager } from "../../domain/tool-management-port";
import { BunToolsTag, type BunTools } from "./bun-tools-live";
import { DockerToolsTag, type DockerTools } from "./docker-tools-live";
import { FzfToolsTag, type FzfTools } from "./fzf-tools-live";
import { GcloudToolsTag, type GcloudTools } from "./gcloud-tools-live";
import { GitToolsTag, type GitTools } from "./git-tools-live";
import { MiseToolsTag, type MiseTools } from "./mise-tools-live";
import { createToolRegistry } from "./tool-registry-live";

/**
 * Factory function that creates the ToolManagementService implementation
 */
const makeToolManagementLive = (
  bunTools: BunTools,
  dockerTools: DockerTools,
  gitTools: GitTools,
  miseTools: MiseTools,
  fzfTools: FzfTools,
  gcloudTools: GcloudTools,
): ToolManagement => {
  const toolRegistry = createToolRegistry({
    bunTools,
    dockerTools,
    fzfTools,
    gcloudTools,
    gitTools,
    miseTools,
  });
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
  };
};

/**
 * Effect Layer that provides the ToolManagementService implementation
 */
export const ToolManagementLiveLayer = Layer.effect(
  ToolManagementTag,
  Effect.gen(function* () {
    const bunTools = yield* BunToolsTag;
    const dockerTools = yield* DockerToolsTag;
    const gitTools = yield* GitToolsTag;
    const miseTools = yield* MiseToolsTag;
    const fzfTools = yield* FzfToolsTag;
    const gcloudTools = yield* GcloudToolsTag;

    return makeToolManagementLive(bunTools, dockerTools, gitTools, miseTools, fzfTools, gcloudTools);
  }),
);
