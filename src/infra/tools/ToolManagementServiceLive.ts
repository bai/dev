import { Effect, Layer } from "effect";

import { ToolManagementServiceTag, type ToolManagementService, type ToolManager } from "../../domain/ports/ToolManager";
import { BunToolsServiceTag, type BunToolsService } from "./bun";
import { FzfToolsServiceTag, type FzfToolsService } from "./fzf";
import { GcloudToolsServiceTag, type GcloudToolsService } from "./gcloud";
import { GitToolsServiceTag, type GitToolsService } from "./git";
import { MiseToolsServiceTag, type MiseToolsService } from "./mise";

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
const makeToolManagementServiceLive = (
  bunTools: BunToolsService,
  gitTools: GitToolsService,
  miseTools: MiseToolsService,
  fzfTools: FzfToolsService,
  gcloudTools: GcloudToolsService,
): ToolManagementService => ({
  bun: adaptToolService(bunTools),
  git: adaptToolService(gitTools),
  mise: adaptToolService(miseTools),
  fzf: adaptToolService(fzfTools),
  gcloud: adaptToolService(gcloudTools),
});

/**
 * Effect Layer that provides the ToolManagementService implementation
 */
export const ToolManagementServiceLive = Layer.effect(
  ToolManagementServiceTag,
  Effect.gen(function* () {
    const bunTools = yield* BunToolsServiceTag;
    const gitTools = yield* GitToolsServiceTag;
    const miseTools = yield* MiseToolsServiceTag;
    const fzfTools = yield* FzfToolsServiceTag;
    const gcloudTools = yield* GcloudToolsServiceTag;

    return makeToolManagementServiceLive(bunTools, gitTools, miseTools, fzfTools, gcloudTools);
  }),
);
