import { Effect, Layer } from "effect";

import { CommandTrackerLiveLayer } from "../app/command-tracking-service";
import { ShellIntegrationLiveLayer } from "../app/shell-integration-service";
import { UpdateCheckerLiveLayer } from "../app/update-check-service";
import { VersionLiveLayer } from "../app/version-service";
import { HealthCheckServiceTag, makeHealthCheckService } from "../domain/health-check-service";
import { PathLiveLayer } from "../domain/path-service";
import { RepositoryLiveLayer } from "../domain/repository-service";
import { ToolHealthRegistryPortTag } from "../domain/tool-health-registry-port";
import { BunToolsLiveLayer } from "../infra/bun-tools-live";
import { DatabasePortLiveLayer } from "../infra/database-live";
import { DirectoryPortLiveLayer } from "../infra/directory-live";
import { FileSystemPortLiveLayer } from "../infra/file-system-live";
import { InteractiveSelectorPortLiveLayer } from "../infra/fzf-selector-live";
import { FzfToolsLiveLayer } from "../infra/fzf-tools-live";
import { GcloudToolsLiveLayer } from "../infra/gcloud-tools-live";
import { GitPortLiveLayer } from "../infra/git-live";
import { GitToolsLiveLayer } from "../infra/git-tools-live";
import { GitHubProviderLiveLayer } from "../infra/github-provider-live";
import { HealthCheckPortLiveLayer } from "../infra/health-check-live";
import { KeychainPortLiveLayer } from "../infra/keychain-live";
import { MisePortLiveLayer } from "../infra/mise-live";
import { MiseToolsLiveLayer } from "../infra/mise-tools-live";
import { NetworkPortLiveLayer } from "../infra/network-live";
import { RunStorePortLiveLayer } from "../infra/run-store-live";
import { ShellPortLiveLayer } from "../infra/shell-live";
import { ToolHealthRegistryPortLiveLayer } from "../infra/tool-health-registry-live";
import { ToolManagementPortLiveLayer } from "../infra/tool-management-live";
import { type DynamicConfigValues } from "./bootstrap";
import { ConfigLoaderLiveLayer } from "./loader";

/**
 * Stage 2: Dynamic Layer Builder
 *
 * This function takes runtime configuration values and builds the complete
 * application layer structure with those values. This eliminates hardcoded
 * values and makes dependency injection fully dynamic.
 */

/**
 * Build the complete infrastructure layer with dynamic configuration values
 */
export const buildInfraLiveLayer = (configValues: DynamicConfigValues) => {
  // Base services with no dependencies
  const BaseServicesLayer = PathLiveLayer;

  // Self-contained services that truly don't need dependencies
  const SelfContainedServicesLayer = Layer.mergeAll(
    FileSystemPortLiveLayer, // No dependencies needed - it's Layer.succeed()
    ShellPortLiveLayer, // No dependencies needed - it's Layer.succeed()
  );

  // Services that depend on base services
  const DependentServicesLayer = Layer.mergeAll(
    Layer.provide(RepositoryLiveLayer, BaseServicesLayer),
    Layer.provide(DirectoryPortLiveLayer, Layer.mergeAll(BaseServicesLayer, SelfContainedServicesLayer)),
  );

  // Combined base layer with all infrastructure services
  const BaseInfraLayer = Layer.mergeAll(BaseServicesLayer, SelfContainedServicesLayer, DependentServicesLayer);

  // Network services that depend on filesystem and shell
  const NetworkLayer = Layer.provide(NetworkPortLiveLayer, BaseInfraLayer);

  // Git services that depend on shell and logging
  const GitLayer = Layer.provide(GitPortLiveLayer, BaseInfraLayer);

  // Configuration loading that depends on filesystem and network
  // Use the dynamic config path from runtime values
  const ConfigLayer = Layer.provide(
    ConfigLoaderLiveLayer(configValues.configPath),
    Layer.mergeAll(BaseInfraLayer, NetworkLayer),
  );

  // Tool services that depend on shell, filesystem, and logging
  const ToolServicesLayer = Layer.mergeAll(
    Layer.provide(MisePortLiveLayer, Layer.mergeAll(BaseInfraLayer, ConfigLayer)),
    Layer.provide(KeychainPortLiveLayer, BaseInfraLayer),
    Layer.provide(FzfToolsLiveLayer, BaseInfraLayer),
    Layer.provide(BunToolsLiveLayer, BaseInfraLayer),
    Layer.provide(GitToolsLiveLayer, BaseInfraLayer),
    Layer.provide(MiseToolsLiveLayer, Layer.mergeAll(BaseInfraLayer, ConfigLayer)),
    Layer.provide(GcloudToolsLiveLayer, BaseInfraLayer),
    InteractiveSelectorPortLiveLayer, // No dependencies needed
  );

  // Tool management service that aggregates all tool services
  const ToolManagementLayer = Layer.provide(ToolManagementPortLiveLayer, ToolServicesLayer);

  // Repository provider with dynamic organization
  // This is where we use the runtime configuration value!
  const RepoProviderLayer = Layer.provide(GitHubProviderLiveLayer(configValues.defaultOrg), NetworkLayer);

  // Database layer that depends on PathService and FileSystem
  const DatabaseLayer = Layer.provide(DatabasePortLiveLayer, BaseInfraLayer);

  // RunStore layer that depends on Database layer
  const RunStoreLayer = Layer.provide(RunStorePortLiveLayer, Layer.mergeAll(BaseInfraLayer, DatabaseLayer));

  // Tool health registry that depends on existing tool services layer
  const ToolHealthRegistryLayer = Layer.provide(ToolHealthRegistryPortLiveLayer, ToolServicesLayer);

  // Health check service layer that depends on tool health registry
  const HealthCheckServiceLayer = Layer.effect(
    HealthCheckServiceTag,
    Effect.gen(function* () {
      const toolHealthRegistry = yield* ToolHealthRegistryPortTag;
      return makeHealthCheckService(toolHealthRegistry);
    }),
  ).pipe(Layer.provide(ToolHealthRegistryLayer));

  // Health check port that depends on Database, Config, Path services, and HealthCheckService
  const HealthCheckLayer = Layer.provide(
    HealthCheckPortLiveLayer,
    Layer.mergeAll(BaseInfraLayer, ConfigLayer, DatabaseLayer, HealthCheckServiceLayer),
  );

  // Complete Infrastructure Layer with dynamic values
  return Layer.mergeAll(
    BaseInfraLayer,
    NetworkLayer,
    GitLayer,
    ConfigLayer,
    ToolServicesLayer,
    ToolManagementLayer, // Aggregated tool management service
    RepoProviderLayer, // Now using dynamic defaultOrg instead of hardcoded "acme"
    DatabaseLayer, // Core database service
    RunStoreLayer, // Run storage service that uses Database
    HealthCheckServiceLayer, // Health check domain service
    HealthCheckLayer, // Health check port that uses Database and HealthCheckService
  );
};

/**
 * Build the complete application layer with dynamic configuration values
 */
export const buildAppLiveLayer = (configValues: DynamicConfigValues) => {
  const infraLayer = buildInfraLiveLayer(configValues);

  // Application Layer (orchestration services only - no infrastructure imports)
  // These services all depend on infrastructure services
  const AppServicesLayer = Layer.mergeAll(
    Layer.provide(ShellIntegrationLiveLayer, infraLayer),
    Layer.provide(VersionLiveLayer, infraLayer),
    Layer.provide(UpdateCheckerLiveLayer, infraLayer),
    Layer.provide(CommandTrackerLiveLayer, infraLayer),
  );

  // Complete application layer with all dependencies
  return Layer.mergeAll(infraLayer, AppServicesLayer);
};

/**
 * Complete two-stage layer composition:
 * 1. Load configuration (Stage 1 - done in bootstrap.ts)
 * 2. Build layers with configuration values (Stage 2 - this function)
 */
export const buildDynamicLayers = (configValues: DynamicConfigValues) => ({
  infraLayer: buildInfraLiveLayer(configValues),
  appLayer: buildAppLiveLayer(configValues),
});
