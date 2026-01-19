import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { CommandTrackerLiveLayer } from "./app/command-tracking-service";
import { ShellIntegrationLiveLayer } from "./app/shell-integration-service";
import { UpdateCheckerLiveLayer } from "./app/update-check-service";
import { VersionLiveLayer } from "./app/version-service";
import { ConfigLoaderTag } from "./domain/config-loader-port";
import { type Config } from "./domain/config-schema";
import { DirectoryTag } from "./domain/directory-port";
import { HealthCheckServiceTag, makeHealthCheckService } from "./domain/health-check-service";
import { createPathServiceLiveLayer } from "./domain/path-service";
import { RepositoryServiceLiveLayer } from "./domain/repository-service";
import { ToolHealthRegistryTag } from "./domain/tool-health-registry-port";
import { BunToolsLiveLayer } from "./infra/bun-tools-live";
import { CommandRegistryLiveLayer } from "./infra/command-registry-live";
import { ConfigLoaderLiveLayer } from "./infra/config-loader-live";
import { DatabaseLiveLayer } from "./infra/database-live";
import { DirectoryLiveLayer } from "./infra/directory-live";
import { DockerServicesLiveLayer, DockerServicesToolsLiveLayer } from "./infra/docker-services-live";
import { FileSystemLiveLayer } from "./infra/file-system-live";
import { InteractiveSelectorLiveLayer } from "./infra/fzf-selector-live";
import { FzfToolsLiveLayer } from "./infra/fzf-tools-live";
import { GcloudToolsLiveLayer } from "./infra/gcloud-tools-live";
import { GitLiveLayer } from "./infra/git-live";
import { GitToolsLiveLayer } from "./infra/git-tools-live";
import { HealthCheckLiveLayer } from "./infra/health-check-live";
import { KeychainLiveLayer } from "./infra/keychain-live";
import { MiseLiveLayer } from "./infra/mise-live";
import { MiseToolsLiveLayer } from "./infra/mise-tools-live";
import { MultiRepoProviderLiveLayer } from "./infra/multi-repo-provider-live";
import { NetworkLiveLayer } from "./infra/network-live";
import { RunStoreLiveLayer } from "./infra/run-store-live";
import { ShellLiveLayer } from "./infra/shell-live";
import { ToolHealthRegistryLiveLayer } from "./infra/tool-health-registry-live";
import { ToolManagementLiveLayer } from "./infra/tool-management-live";
import { TracingLiveLayer } from "./infra/tracing-live";

/**
 * Expands tilde in file paths
 */
const expandTildePath = (filePath: string): string => {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === "~") {
    return os.homedir();
  }
  return path.resolve(filePath);
};

/**
 * Load configuration
 */
export const loadConfiguration = () =>
  Effect.gen(function* () {
    yield* Effect.logDebug("🔧 Loading configuration...");

    const configPath = path.join(os.homedir(), ".config", "dev", "config.json");
    const baseSearchPath = path.join(os.homedir(), "src");

    // Minimal bootstrap layer for config loading
    const bootstrapLayer = Layer.mergeAll(
      FileSystemLiveLayer,
      createPathServiceLiveLayer(baseSearchPath),
      Layer.provide(NetworkLiveLayer, FileSystemLiveLayer),
      Layer.provide(
        ConfigLoaderLiveLayer(configPath),
        Layer.mergeAll(
          FileSystemLiveLayer,
          createPathServiceLiveLayer(baseSearchPath),
          Layer.provide(NetworkLiveLayer, FileSystemLiveLayer),
        ),
      ),
    );

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
  const defaultOrg = config.defaultOrg;
  const configPath = path.join(os.homedir(), ".config", "dev", "config.json");
  const baseSearchPath = expandTildePath(config.baseSearchPath);
  const defaultProvider = config.defaultProvider;
  const orgToProvider = config.orgToProvider;
  const enabledServices = config.services.enabled;

  // Stage 1: Base foundation services (no dependencies)
  const baseServices = Layer.mergeAll(FileSystemLiveLayer, ShellLiveLayer, createPathServiceLiveLayer(baseSearchPath));

  // Stage 2: Services that depend on base services
  const networkLayer = Layer.provide(NetworkLiveLayer, baseServices);
  const gitLayer = Layer.provide(GitLiveLayer, baseServices);
  const directoryLayer = Layer.provide(DirectoryLiveLayer, baseServices);
  const databaseLayer = Layer.provide(DatabaseLiveLayer, baseServices);
  const repositoryServiceLayer = Layer.provide(RepositoryServiceLiveLayer, baseServices);

  // Config loader needs filesystem and network
  const configLoaderLayer = Layer.provide(
    ConfigLoaderLiveLayer(configPath),
    Layer.mergeAll(baseServices, networkLayer),
  );

  // Docker services layer (depends on base services)
  const dockerServicesLayer = Layer.provide(DockerServicesLiveLayer(enabledServices), baseServices);
  const dockerServicesToolsLayer = Layer.provide(DockerServicesToolsLiveLayer(enabledServices), baseServices);

  // Stage 3: Tool services (depend on base + config)
  const toolDependencies = Layer.mergeAll(baseServices, configLoaderLayer);

  const toolLayers = Layer.mergeAll(
    Layer.provide(MiseLiveLayer, toolDependencies),
    Layer.provide(KeychainLiveLayer, baseServices),
    Layer.provide(FzfToolsLiveLayer, baseServices),
    Layer.provide(BunToolsLiveLayer, baseServices),
    Layer.provide(GitToolsLiveLayer, baseServices),
    Layer.provide(MiseToolsLiveLayer, toolDependencies),
    Layer.provide(GcloudToolsLiveLayer, baseServices),
    dockerServicesToolsLayer,
    InteractiveSelectorLiveLayer,
  );

  // Tool management and health registry
  const toolManagementLayer = Layer.provide(ToolManagementLiveLayer, toolLayers);
  const toolHealthRegistryLayer = Layer.provide(ToolHealthRegistryLiveLayer, toolLayers);

  // Repository provider
  const repoProviderLayer = Layer.provide(
    MultiRepoProviderLiveLayer(defaultOrg, defaultProvider, orgToProvider),
    networkLayer,
  );

  // Health check service
  const healthCheckServiceLayer = Layer.effect(
    HealthCheckServiceTag,
    Effect.gen(function* () {
      const toolHealthRegistry = yield* ToolHealthRegistryTag;
      return makeHealthCheckService(toolHealthRegistry);
    }),
  ).pipe(Layer.provide(toolHealthRegistryLayer));

  // Version layer (needs git and path service from infraLayer components)
  const versionLayer = Layer.provide(VersionLiveLayer, Layer.mergeAll(gitLayer, baseServices));

  // Tracing layer (needs config, shell, and version)
  const tracingLayer = Layer.provide(TracingLiveLayer, Layer.mergeAll(configLoaderLayer, baseServices, versionLayer));

  // Stage 4: Application services
  const infraLayer = Layer.mergeAll(
    baseServices,
    networkLayer,
    gitLayer,
    directoryLayer,
    databaseLayer,
    repositoryServiceLayer,
    configLoaderLayer,
    toolLayers,
    toolManagementLayer,
    toolHealthRegistryLayer,
    repoProviderLayer,
    healthCheckServiceLayer,
    dockerServicesLayer,
    versionLayer,
    tracingLayer,
  );

  // Database-dependent services
  const runStoreLayer = Layer.provide(RunStoreLiveLayer, Layer.mergeAll(databaseLayer, baseServices));
  const healthCheckLayer = Layer.provide(
    HealthCheckLiveLayer,
    Layer.mergeAll(databaseLayer, configLoaderLayer, baseServices, healthCheckServiceLayer),
  );

  // Final application services
  const appServices = Layer.mergeAll(
    Layer.provide(ShellIntegrationLiveLayer, infraLayer),
    Layer.provide(UpdateCheckerLiveLayer, infraLayer),
    Layer.provide(CommandTrackerLiveLayer, infraLayer),
    CommandRegistryLiveLayer,
  );

  // Combine everything
  return Layer.mergeAll(infraLayer, runStoreLayer, healthCheckLayer, appServices);
};

/**
 * Setup application with configuration
 */
export const setupApplication = () =>
  Effect.gen(function* () {
    // Load configuration
    yield* Effect.logDebug("🔧 Setting up application...");
    const config = yield* loadConfiguration();

    // Build layers
    yield* Effect.logDebug("🔨 Building application layers...");
    const appLayer = buildAppLayer(config);

    yield* Effect.logDebug(`✅ Application ready (org: ${config.defaultOrg})`);

    // Ensure base directory exists
    yield* Effect.gen(function* () {
      yield* Effect.logDebug("📁 Ensuring base directory exists...");
      const directoryService = yield* DirectoryTag;
      yield* directoryService.ensureBaseDirectoryExists();
      const baseSearchPath = expandTildePath(config.baseSearchPath ?? path.join(os.homedir(), "src"));
      yield* Effect.logDebug(`✅ Base directory ready at: ${baseSearchPath}`);
    }).pipe(Effect.provide(appLayer), Effect.withSpan("directory.ensure_base"));

    return { config, appLayer };
  });
