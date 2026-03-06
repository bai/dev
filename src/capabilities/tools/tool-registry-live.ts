import { Effect } from "effect";

import { BunToolsLiveLayer, BunTools, type BunToolsService } from "~/capabilities/tools/adapters/bun-tools-live";
import { DockerToolsLiveLayer, DockerTools, type DockerToolsService } from "~/capabilities/tools/adapters/docker-tools-live";
import { FzfToolsLiveLayer, FzfTools, type FzfToolsService } from "~/capabilities/tools/adapters/fzf-tools-live";
import { GcloudToolsLiveLayer, GcloudTools, type GcloudToolsService } from "~/capabilities/tools/adapters/gcloud-tools-live";
import { GitToolsLiveLayer, GitTools, type GitToolsService } from "~/capabilities/tools/adapters/git-tools-live";
import { MiseToolsLiveLayer, MiseTools, type MiseToolsService } from "~/capabilities/tools/adapters/mise-tools-live";
import { type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { type ManagedTool, type ToolManager } from "~/capabilities/tools/tool-management-port";
import { type HealthCheckError } from "~/core/errors";

export interface ToolRegistryDependencies {
  readonly bunTools: BunToolsService;
  readonly dockerTools: DockerToolsService;
  readonly fzfTools: FzfToolsService;
  readonly gcloudTools: GcloudToolsService;
  readonly gitTools: GitToolsService;
  readonly miseTools: MiseToolsService;
}

interface ToolRegistryEntry {
  readonly displayName: string;
  readonly essential: boolean;
  readonly createManager?: (dependencies: ToolRegistryDependencies) => ToolManager;
  readonly createHealthChecker?: (dependencies: ToolRegistryDependencies) => () => Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export const toolRegistryEntries = {
  bun: {
    displayName: "Bun",
    essential: true,
    createManager: ({ bunTools }) => bunTools,
    createHealthChecker:
      ({ bunTools }) =>
      () =>
        bunTools.performHealthCheck(),
  },
  git: {
    displayName: "Git",
    essential: true,
    createManager: ({ gitTools }) => gitTools,
    createHealthChecker:
      ({ gitTools }) =>
      () =>
        gitTools.performHealthCheck(),
  },
  mise: {
    displayName: "Mise",
    essential: true,
    createManager: ({ miseTools }) => miseTools,
    createHealthChecker:
      ({ miseTools }) =>
      () =>
        miseTools.performHealthCheck(),
  },
  fzf: {
    displayName: "Fzf",
    essential: true,
    createManager: ({ fzfTools }) => fzfTools,
    createHealthChecker:
      ({ fzfTools }) =>
      () =>
        fzfTools.performHealthCheck(),
  },
  gcloud: {
    displayName: "Gcloud",
    essential: true,
    createManager: ({ gcloudTools }) => gcloudTools,
    createHealthChecker:
      ({ gcloudTools }) =>
      () =>
        gcloudTools.performHealthCheck(),
  },
  docker: {
    displayName: "Docker",
    essential: false,
    createHealthChecker:
      ({ dockerTools }) =>
      () =>
        dockerTools.performHealthCheck(),
  },
} as const satisfies Readonly<Record<string, ToolRegistryEntry>>;

export interface BuiltToolRegistryService {
  readonly managedTools: readonly ManagedTool[];
  readonly essentialManagedTools: readonly ManagedTool[];
  readonly healthCheckers: ReadonlyMap<string, () => Effect.Effect<HealthCheckResult, HealthCheckError>>;
}

export const createToolRegistry = (dependencies: ToolRegistryDependencies): BuiltToolRegistryService => {
  const entries: ReadonlyArray<readonly [string, ToolRegistryEntry]> = Object.entries(toolRegistryEntries);
  const managedTools = entries.flatMap(([id, entry]) => {
    if (!entry.createManager) {
      return [];
    }

    return [
      {
        id,
        displayName: entry.displayName,
        essential: entry.essential,
        manager: entry.createManager(dependencies),
      } satisfies ManagedTool,
    ];
  });
  const essentialManagedTools = managedTools.filter((tool) => tool.essential);

  const healthCheckerEntries = entries
    .flatMap(([id, entry]) => {
      if (!entry.createHealthChecker) {
        return [];
      }
      return [[id, entry.createHealthChecker(dependencies)] as const];
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    managedTools,
    essentialManagedTools,
    healthCheckers: new Map(healthCheckerEntries),
  };
};

export class BuiltToolRegistry extends Effect.Service<BuiltToolRegistryService>()("BuiltToolRegistry", {
  dependencies: [BunToolsLiveLayer, DockerToolsLiveLayer, FzfToolsLiveLayer, GcloudToolsLiveLayer, GitToolsLiveLayer, MiseToolsLiveLayer],
  effect: Effect.gen(function* () {
    const bunTools = yield* BunTools;
    const dockerTools = yield* DockerTools;
    const fzfTools = yield* FzfTools;
    const gcloudTools = yield* GcloudTools;
    const gitTools = yield* GitTools;
    const miseTools = yield* MiseTools;

    return createToolRegistry({
      bunTools,
      dockerTools,
      fzfTools,
      gcloudTools,
      gitTools,
      miseTools,
    });
  }),
}) {}

export const BuiltToolRegistryLiveLayer = BuiltToolRegistry.Default;
