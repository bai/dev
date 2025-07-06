import { Layer } from "effect";

import { CommandTrackerLiveLayer } from "../app/services/command-tracking";
import { HealthCheckSchedulerLiveLayer } from "../app/services/health-check-scheduler";
import { ShellIntegrationLiveLayer } from "../app/services/shell-integration";
import { UpdateCheckerLiveLayer } from "../app/services/update-check";
import { VersionLiveLayer } from "../app/services/version";
import { PathServiceLiveLayer } from "../domain/services/path-service";
import { RepositoryServiceLiveLayer } from "../domain/services/repository-service";
import { DatabasePortLiveLayer } from "../infra/db/database-live";
import { RunStorePortLiveLayer } from "../infra/db/run-store-live";
import { DirectoryPortLiveLayer } from "../infra/fs/directory-live";
import { FileSystemPortLiveLayer } from "../infra/fs/file-system-live";
import { GitPortLiveLayer } from "../infra/git/git-live";
import { HealthCheckPortLiveLayer } from "../infra/health/health-check-live";
import { KeychainPortLiveLayer } from "../infra/keychain/keychain-live";
import { MisePortLiveLayer } from "../infra/mise/mise-live";
import { NetworkPortLiveLayer } from "../infra/network/network-live";
import { GitHubProviderLayer } from "../infra/providers/github-provider";
import { InteractiveSelectorPortLiveLayer } from "../infra/selector/fzf-selector-live";
import { ShellPortLiveLayer } from "../infra/shell/shell-live";
import { BunToolsLiveLayer } from "../infra/tools/bun";
import { FzfToolsLiveLayer } from "../infra/tools/fzf";
import { GcloudToolsLiveLayer } from "../infra/tools/gcloud";
import { GitToolsLiveLayer } from "../infra/tools/git";
import { MiseToolsLiveLayer } from "../infra/tools/mise";
import { ToolManagementPortLiveLayer } from "../infra/tools/tool-management-live";
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
  const BaseServicesLayer = PathServiceLiveLayer;

  // Self-contained services that truly don't need dependencies
  const SelfContainedServicesLayer = Layer.mergeAll(
    FileSystemPortLiveLayer, // No dependencies needed - it's Layer.succeed()
    ShellPortLiveLayer, // No dependencies needed - it's Layer.succeed()
  );

  // Services that depend on base services
  const DependentServicesLayer = Layer.mergeAll(
    Layer.provide(RepositoryServiceLiveLayer, BaseServicesLayer),
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
    Layer.provide(MisePortLiveLayer, BaseInfraLayer),
    Layer.provide(KeychainPortLiveLayer, BaseInfraLayer),
    Layer.provide(FzfToolsLiveLayer, BaseInfraLayer),
    Layer.provide(BunToolsLiveLayer, BaseInfraLayer),
    Layer.provide(GitToolsLiveLayer, BaseInfraLayer),
    Layer.provide(MiseToolsLiveLayer, BaseInfraLayer),
    Layer.provide(GcloudToolsLiveLayer, BaseInfraLayer),
    InteractiveSelectorPortLiveLayer, // No dependencies needed
  );

  // Tool management service that aggregates all tool services
  const ToolManagementLayer = Layer.provide(ToolManagementPortLiveLayer, ToolServicesLayer);

  // Repository provider with dynamic organization
  // This is where we use the runtime configuration value!
  const RepoProviderLayer = Layer.provide(GitHubProviderLayer(configValues.defaultOrg), NetworkLayer);

  // Database layer that depends on PathService and FileSystem
  const DatabaseLayer = Layer.provide(DatabasePortLiveLayer, BaseInfraLayer);
  
  // RunStore layer that depends on Database layer
  const RunStoreLayer = Layer.provide(RunStorePortLiveLayer, Layer.mergeAll(BaseInfraLayer, DatabaseLayer));

  // Health check service that depends on Database, Config and Path services
  const HealthCheckLayer = Layer.provide(
    HealthCheckPortLiveLayer, 
    Layer.mergeAll(BaseInfraLayer, ConfigLayer, DatabaseLayer)
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
    HealthCheckLayer, // Health check service that uses Database
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
    Layer.provide(HealthCheckSchedulerLiveLayer, infraLayer),
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
