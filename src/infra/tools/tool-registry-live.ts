import { Effect } from "effect";

import { type HealthCheckError } from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { type ManagedTool, type ToolManager } from "../../domain/tool-management-port";
import { BunToolsTag, type BunTools } from "./bun-tools-live";
import { DockerToolsTag, type DockerTools } from "./docker-tools-live";
import { FzfToolsTag, type FzfTools } from "./fzf-tools-live";
import { GcloudToolsTag, type GcloudTools } from "./gcloud-tools-live";
import { GitToolsTag, type GitTools } from "./git-tools-live";
import { MiseToolsTag, type MiseTools } from "./mise-tools-live";

export interface ToolRegistryDependencies {
  readonly bunTools: BunTools;
  readonly dockerTools: DockerTools;
  readonly fzfTools: FzfTools;
  readonly gcloudTools: GcloudTools;
  readonly gitTools: GitTools;
  readonly miseTools: MiseTools;
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

export interface BuiltToolRegistry {
  readonly managedTools: readonly ManagedTool[];
  readonly essentialManagedTools: readonly ManagedTool[];
  readonly healthCheckers: ReadonlyMap<string, () => Effect.Effect<HealthCheckResult, HealthCheckError>>;
}

export const createToolRegistry = (dependencies: ToolRegistryDependencies): BuiltToolRegistry => {
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

export class BuiltToolRegistryTag extends Effect.Service<BuiltToolRegistry>()("BuiltToolRegistry", {
  effect: Effect.gen(function* () {
    const bunTools = yield* BunToolsTag;
    const dockerTools = yield* DockerToolsTag;
    const fzfTools = yield* FzfToolsTag;
    const gcloudTools = yield* GcloudToolsTag;
    const gitTools = yield* GitToolsTag;
    const miseTools = yield* MiseToolsTag;

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

export const BuiltToolRegistryLiveLayer = BuiltToolRegistryTag.Default;
