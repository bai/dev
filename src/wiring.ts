import { Effect, Layer } from "effect";

import { CommandTrackerLiveLayer } from "./app/command-tracking-service";
import { ShellIntegrationLiveLayer } from "./app/shell-integration-service";
import { UpdateCheckerLiveLayer } from "./app/update-check-service";
import { VersionLiveLayer } from "./app/version-service";
import { ConfigLoaderTag } from "./domain/config-loader-port";
import { type Config } from "./domain/config-schema";
import { DirectoryTag } from "./domain/directory-port";
import type { ServiceName } from "./domain/docker-services-port";
import { createPathService, createPathServiceLiveLayer } from "./domain/path-service";
import { RepositoryServiceLiveLayer } from "./domain/repository-service";
import { CommandRegistryLiveLayer } from "./infra/command-registry-live";
import { ConfigLoaderLiveLayer } from "./infra/config-loader-live";
import { DatabaseLiveLayer } from "./infra/database-live";
import { DirectoryLiveLayer } from "./infra/directory-live";
import { DockerServicesLiveLayer } from "./infra/docker-services-live";
import { FileSystemLiveLayer } from "./infra/file-system-live";
import { InteractiveSelectorLiveLayer } from "./infra/fzf-selector-live";
import { GitLiveLayer } from "./infra/git-live";
import { HealthCheckLiveLayer } from "./infra/health-check-live";
import { InstallIdentityLiveLayer } from "./infra/install-identity-live";
import { KeychainLiveLayer } from "./infra/keychain-live";
import { MiseLiveLayer } from "./infra/mise-live";
import { MultiRepoProviderLiveLayer } from "./infra/multi-repo-provider-live";
import { NetworkLiveLayer } from "./infra/network-live";
import { RunStoreLiveLayer } from "./infra/run-store-live";
import { ShellLiveLayer } from "./infra/shell-live";
import { BunToolsLiveLayer } from "./infra/tools/bun-tools-live";
import { DockerToolsLiveLayer } from "./infra/tools/docker-tools-live";
import { FzfToolsLiveLayer } from "./infra/tools/fzf-tools-live";
import { GcloudToolsLiveLayer } from "./infra/tools/gcloud-tools-live";
import { GitToolsLiveLayer } from "./infra/tools/git-tools-live";
import { MiseToolsLiveLayer } from "./infra/tools/mise-tools-live";
import { ToolHealthRegistryLiveLayer } from "./infra/tools/tool-health-registry-live";
import { ToolManagementLiveLayer } from "./infra/tools/tool-management-live";
import { TracingLiveLayer } from "./infra/tracing/tracing-live";

interface SetupOptions {
  readonly configPath?: string;
}

/**
 * Load configuration
 */
export const loadConfiguration = (options: SetupOptions = {}) =>
  Effect.gen(function* () {
    yield* Effect.logDebug("🔧 Loading configuration...");

    const defaults = createPathService();
    const configPath = options.configPath ?? defaults.configPath;
    const bootstrapDependencies = Layer.mergeAll(FileSystemLiveLayer, Layer.provide(NetworkLiveLayer, FileSystemLiveLayer));

    // Minimal bootstrap layer for config loading
    const bootstrapLayer = Layer.provide(ConfigLoaderLiveLayer(configPath), bootstrapDependencies);

    // Provide the bootstrap layer and load config
    return yield* Effect.gen(function* () {
      const configLoader = yield* ConfigLoaderTag;
      const config = yield* configLoader.load();
      yield* Effect.logDebug(`✅ Configuration loaded successfully (org: ${config.defaultOrg})`);
      return config;
    }).pipe(Effect.provide(bootstrapLayer));
  });

/**
 * Build the complete application layer
 */
export const buildAppLayer = (config: Config) => {
  // Extract configuration values
  const defaults = createPathService();
  const defaultOrg = config.defaultOrg;
  const baseSearchPath = defaults.getBasePath(config);
  const defaultProvider = config.defaultProvider;
  const orgToProvider = config.orgToProvider;
  const enabledServices = config.services
    ? (Object.keys(config.services).filter((k) => config.services[k as ServiceName] !== undefined) as ServiceName[])
    : [];

  // Stage 1: Base foundation services (no dependencies)
  const baseServices = Layer.mergeAll(FileSystemLiveLayer, ShellLiveLayer, createPathServiceLiveLayer(baseSearchPath));

  // Stage 2: Services that depend on base services
  const networkLayer = Layer.provide(NetworkLiveLayer, baseServices);
  const gitLayer = Layer.provide(GitLiveLayer, baseServices);
  const directoryLayer = Layer.provide(DirectoryLiveLayer, baseServices);
  const databaseLayer = Layer.provide(DatabaseLiveLayer, baseServices);
  const installIdentityLayer = Layer.provide(InstallIdentityLiveLayer, databaseLayer);
  const repositoryServiceLayer = Layer.provide(RepositoryServiceLiveLayer, baseServices);

  // Config loader needs filesystem and network
  const configLoaderLayer = Layer.provide(ConfigLoaderLiveLayer(defaults.configPath), Layer.mergeAll(baseServices, networkLayer));

  // Docker services layer (depends on base services)
  const dockerServicesLayer = Layer.provide(DockerServicesLiveLayer(enabledServices), baseServices);

  // Stage 3: Tool services (depend on base + config)
  const toolDependencies = Layer.mergeAll(baseServices, configLoaderLayer);
  const miseLiveProvided = Layer.provide(MiseLiveLayer, toolDependencies);

  const toolLayers = Layer.mergeAll(
    miseLiveProvided,
    Layer.provide(KeychainLiveLayer, baseServices),
    Layer.provide(FzfToolsLiveLayer, baseServices),
    Layer.provide(BunToolsLiveLayer, baseServices),
    Layer.provide(DockerToolsLiveLayer, baseServices),
    Layer.provide(GitToolsLiveLayer, baseServices),
    Layer.provide(MiseToolsLiveLayer, Layer.mergeAll(baseServices, miseLiveProvided)),
    Layer.provide(GcloudToolsLiveLayer, baseServices),
    InteractiveSelectorLiveLayer,
  );

  // Tool management and health registry
  const toolManagementLayer = Layer.provide(ToolManagementLiveLayer, toolLayers);
  const toolHealthRegistryLayer = Layer.provide(ToolHealthRegistryLiveLayer, toolLayers);

  // Repository provider
  const repoProviderLayer = MultiRepoProviderLiveLayer(defaultOrg, defaultProvider, orgToProvider);

  // Version layer (needs git and path service from infraLayer components)
  const versionLayer = Layer.provide(VersionLiveLayer, Layer.mergeAll(gitLayer, baseServices));

  // Tracing layer (needs config, shell, and version)
  const tracingLayer = Layer.provide(TracingLiveLayer, Layer.mergeAll(configLoaderLayer, baseServices, versionLayer, installIdentityLayer));

  // Stage 4: Application services
  const infraLayer = Layer.mergeAll(
    baseServices,
    networkLayer,
    gitLayer,
    directoryLayer,
    databaseLayer,
    installIdentityLayer,
    repositoryServiceLayer,
    configLoaderLayer,
    toolLayers,
    toolManagementLayer,
    toolHealthRegistryLayer,
    repoProviderLayer,
    dockerServicesLayer,
    versionLayer,
    tracingLayer,
  );

  // Database-dependent services
  const runStoreLayer = Layer.provide(RunStoreLiveLayer, Layer.mergeAll(databaseLayer, baseServices));
  const healthCheckLayer = Layer.provide(HealthCheckLiveLayer, Layer.mergeAll(databaseLayer, toolHealthRegistryLayer));
  const appServiceDependencies = Layer.mergeAll(infraLayer, runStoreLayer);

  // Final application services
  const appServices = Layer.mergeAll(
    Layer.provide(ShellIntegrationLiveLayer, appServiceDependencies),
    Layer.provide(UpdateCheckerLiveLayer, appServiceDependencies),
    Layer.provide(CommandTrackerLiveLayer, appServiceDependencies),
    CommandRegistryLiveLayer,
  );

  // Combine everything
  return Layer.mergeAll(infraLayer, runStoreLayer, healthCheckLayer, appServices);
};

/**
 * Setup application with configuration
 */
export const setupApplication = (options: SetupOptions = {}) =>
  Effect.gen(function* () {
    // Load configuration
    yield* Effect.logDebug("🔧 Setting up application...");
    const config = yield* loadConfiguration(options);
    const defaults = createPathService();

    // Build layers
    yield* Effect.logDebug("🔨 Building application layers...");
    const appLayer = buildAppLayer(config);
    const baseSearchPath = defaults.getBasePath(config);
    const directorySetupLayer = Layer.provide(
      DirectoryLiveLayer,
      Layer.mergeAll(FileSystemLiveLayer, createPathServiceLiveLayer(baseSearchPath)),
    );

    yield* Effect.logDebug(`✅ Application ready (org: ${config.defaultOrg})`);

    // Ensure base directory exists
    yield* Effect.gen(function* () {
      yield* Effect.logDebug("📁 Ensuring base directory exists...");
      const directoryService = yield* DirectoryTag;
      yield* directoryService.ensureBaseDirectoryExists();
      yield* Effect.logDebug(`✅ Base directory ready at: ${baseSearchPath}`);
    }).pipe(Effect.provide(directorySetupLayer), Effect.withSpan("directory.ensure_base"));

    return { config, appLayer };
  });
