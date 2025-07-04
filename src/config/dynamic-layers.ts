import { Layer } from "effect";

import { CommandTrackingServiceLive } from "../app/services/CommandTrackingService";
import { ShellIntegrationServiceLive } from "../app/services/ShellIntegrationService";
import { UpdateCheckServiceLive } from "../app/services/UpdateCheckService";
import { VersionServiceLive } from "../app/services/VersionService";
import { PathServiceLive } from "../domain/services/PathService";
import { RepositoryServiceLive } from "../domain/services/RepositoryService";
import { RunStoreLiveLayer } from "../infra/db/RunStoreLive";
import { DirectoryServiceLive } from "../infra/fs/DirectoryService";
import { FileSystemLiveLayer } from "../infra/fs/FileSystemLive";
import { GitLiveLayer } from "../infra/git/GitLive";
import { KeychainLiveLayer } from "../infra/keychain/KeychainLive";
import { MiseLiveLayer } from "../infra/mise/MiseLive";
import { NetworkLiveLayer } from "../infra/network/NetworkLive";
import { GitHubProviderLayer } from "../infra/providers/GitHubProvider";
import { FzfSelectorLiveLayer } from "../infra/selector/FzfSelectorLive";
import { ShellLiveLayer } from "../infra/shell/ShellLive";
import { FzfToolsLiveLayer } from "../infra/tools/fzf";
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
  const BaseServicesLayer = PathServiceLive;

  // Infrastructure services that depend on base services
  const InfraServicesLayer = Layer.mergeAll(
    Layer.provide(FileSystemLiveLayer, BaseServicesLayer),
    Layer.provide(DirectoryServiceLive, BaseServicesLayer),
    Layer.provide(ShellLiveLayer, BaseServicesLayer),
    Layer.provide(RepositoryServiceLive, BaseServicesLayer),
  );

  // Combined base layer
  const BaseInfraLayer = Layer.mergeAll(BaseServicesLayer, InfraServicesLayer);

  // Network services that depend on filesystem and shell
  const NetworkLayer = Layer.provide(NetworkLiveLayer, BaseInfraLayer);

  // Git services that depend on shell and logging
  const GitLayer = Layer.provide(GitLiveLayer, BaseInfraLayer);

  // Configuration loading that depends on filesystem and network
  // Use the dynamic config path from runtime values
  const ConfigLayer = Layer.provide(
    ConfigLoaderLiveLayer(configValues.configPath),
    Layer.mergeAll(BaseInfraLayer, NetworkLayer),
  );

  // Tool services that depend on shell, filesystem, and logging
  const ToolServicesLayer = Layer.mergeAll(
    Layer.provide(MiseLiveLayer, BaseInfraLayer),
    Layer.provide(KeychainLiveLayer, BaseInfraLayer),
    Layer.provide(FzfToolsLiveLayer, BaseInfraLayer),
    FzfSelectorLiveLayer, // No dependencies needed
  );

  // Repository provider with dynamic organization
  // This is where we use the runtime configuration value!
  const RepoProviderLayer = Layer.provide(GitHubProviderLayer(configValues.defaultOrg), NetworkLayer);

  // Database layer that depends on PathService
  const DatabaseLayer = Layer.provide(RunStoreLiveLayer, BaseInfraLayer);

  // Complete Infrastructure Layer with dynamic values
  return Layer.mergeAll(
    BaseInfraLayer,
    NetworkLayer,
    GitLayer,
    ConfigLayer,
    ToolServicesLayer,
    RepoProviderLayer, // Now using dynamic defaultOrg instead of hardcoded "acme"
    DatabaseLayer, // Ensure database layer gets PathService dependencies
  );
};

/**
 * Build the complete application layer with dynamic configuration values
 */
export const buildAppLiveLayer = (configValues: DynamicConfigValues) => {
  const infraLayer = buildInfraLiveLayer(configValues);

  // Application Layer (orchestration services only - no infrastructure imports)
  // Ensure all app services get the PathService they need
  return Layer.mergeAll(
    infraLayer,

    // App services - these coordinate domain logic and need PathService
    Layer.provide(ShellIntegrationServiceLive, infraLayer),
    Layer.provide(CommandTrackingServiceLive, infraLayer),
    Layer.provide(VersionServiceLive, infraLayer),
    Layer.provide(UpdateCheckServiceLive, infraLayer),
  );
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
