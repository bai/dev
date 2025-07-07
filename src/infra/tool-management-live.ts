import { Effect, Layer } from "effect";

import { ToolManagementPortTag, type ToolManagementPort, type ToolManager } from "../domain/tool-management-port";
import { BunToolsTag, type BunTools } from "./bun-tools-live";
import { FzfToolsTag, type FzfTools } from "./fzf-tools-live";
import { GcloudToolsTag, type GcloudTools } from "./gcloud-tools-live";
import { GitToolsTag, type GitTools } from "./git-tools-live";
import { MiseToolsTag, type MiseTools } from "./mise-tools-live";

/**
 * Adapter that wraps a tool service to match the ToolManager interface
 */
const adaptToolService = (toolService: {
  getCurrentVersion: () => Effect.Effect<string | null, any>;
  checkVersion: () => Effect.Effect<{ isValid: boolean; currentVersion: string | null }, any>;
  performUpgrade: () => Effect.Effect<boolean, any>;
  ensureVersionOrUpgrade: () => Effect.Effect<void, any>;
}): ToolManager => ({
  getCurrentVersion: toolService.getCurrentVersion,
  checkVersion: toolService.checkVersion,
  performUpgrade: toolService.performUpgrade,
  ensureVersionOrUpgrade: toolService.ensureVersionOrUpgrade,
});

/**
 * Factory function that creates the ToolManagementService implementation
 */
const makeToolManagementLive = (
  bunTools: BunTools,
  gitTools: GitTools,
  miseTools: MiseTools,
  fzfTools: FzfTools,
  gcloudTools: GcloudTools,
): ToolManagementPort => ({
  bun: adaptToolService(bunTools),
  git: adaptToolService(gitTools),
  mise: adaptToolService(miseTools),
  fzf: adaptToolService(fzfTools),
  gcloud: adaptToolService(gcloudTools),
});

/**
 * Effect Layer that provides the ToolManagementService implementation
 */
export const ToolManagementPortLiveLayer = Layer.effect(
  ToolManagementPortTag,
  Effect.gen(function* () {
    const bunTools = yield* BunToolsTag;
    const gitTools = yield* GitToolsTag;
    const miseTools = yield* MiseToolsTag;
    const fzfTools = yield* FzfToolsTag;
    const gcloudTools = yield* GcloudToolsTag;

    return makeToolManagementLive(bunTools, gitTools, miseTools, fzfTools, gcloudTools);
  }),
);
