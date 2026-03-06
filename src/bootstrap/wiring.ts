import { Effect, Layer } from "effect";

import { CommandRegistryLiveLayer } from "~/bootstrap/command-registry-live";
import { CommandTrackerLiveLayer } from "~/capabilities/analytics/command-tracking-service";
import { DatabaseLiveLayer } from "~/capabilities/persistence/database-live";
import { InstallIdentityLiveLayer } from "~/capabilities/persistence/install-identity-live";
import { RunStoreLiveLayer } from "~/capabilities/persistence/run-store-live";
import { RepoProviderLiveLayer } from "~/capabilities/repositories/adapters/multi-repo-provider-live";
import { RepositoryServiceLiveLayer } from "~/capabilities/repositories/repository-service";
import { DockerServicesLiveLayer } from "~/capabilities/services/docker-services-live";
import { AutoUpgradeTriggerLiveLayer } from "~/capabilities/system/auto-upgrade-trigger-live";
import { FileSystemLiveLayer } from "~/capabilities/system/file-system-live";
import { InteractiveSelectorLiveLayer } from "~/capabilities/system/fzf-selector-live";
import { GitLiveLayer } from "~/capabilities/system/git-live";
import { KeychainLiveLayer } from "~/capabilities/system/keychain-live";
import { NetworkLiveLayer } from "~/capabilities/system/network-live";
import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { HealthCheckLiveLayer } from "~/capabilities/tools/health-check-live";
import { MiseLiveLayer } from "~/capabilities/tools/mise-live";
import { ToolHealthRegistryLiveLayer } from "~/capabilities/tools/tool-health-registry-live";
import { ToolManagementLiveLayer } from "~/capabilities/tools/tool-management-live";
import { BuiltToolRegistryLiveLayer } from "~/capabilities/tools/tool-registry-live";
import { DirectoryLiveLayer } from "~/capabilities/workspace/directory-live";
import { DirectoryTag } from "~/capabilities/workspace/directory-port";
import { ShellIntegrationLiveLayer } from "~/capabilities/workspace/shell-integration-service";
import { AppConfigTag } from "~/core/config/app-config-port";
import { ConfigLoaderLiveLayer } from "~/core/config/config-loader-live";
import { ConfigLoaderTag } from "~/core/config/config-loader-port";
import { type Config } from "~/core/config/config-schema";
import { TracingLiveLayer } from "~/core/observability/tracing-live";
import { WorkspacePathsTag } from "~/core/runtime/path-service";
import { createHostPathsLiveLayer, WorkspacePathsLiveLayer } from "~/core/runtime/path-service-live";
import { RuntimeContextLiveLayer } from "~/core/runtime/runtime-context-live";
import { VersionLiveLayer } from "~/core/runtime/version-service";
import { UpdateCheckerLiveLayer } from "~/features/upgrade/update-check-service";

interface SetupOptions {
  readonly configPath?: string;
}

const buildBootstrapLayer = (options: SetupOptions) => {
  const hostPathsLayer = createHostPathsLiveLayer(options.configPath);
  const networkLayer = Layer.provide(NetworkLiveLayer, FileSystemLiveLayer);
  return Layer.provide(ConfigLoaderLiveLayer, Layer.mergeAll(FileSystemLiveLayer, networkLayer, hostPathsLayer));
};

const buildContextLayers = (config: Config, options: SetupOptions) => {
  const hostPathsLayer = createHostPathsLiveLayer(options.configPath);
  const appConfigLayer = Layer.succeed(AppConfigTag, config);
  const workspacePathsLayer = Layer.provide(WorkspacePathsLiveLayer, Layer.mergeAll(hostPathsLayer, appConfigLayer));
  const runtimeLayer = Layer.mergeAll(
    FileSystemLiveLayer,
    ShellLiveLayer,
    AutoUpgradeTriggerLiveLayer,
    RuntimeContextLiveLayer,
    hostPathsLayer,
    appConfigLayer,
    workspacePathsLayer,
  );
  return {
    hostPathsLayer,
    appConfigLayer,
    workspacePathsLayer,
    runtimeLayer,
  };
};

const buildInfrastructureLayers = (context: ReturnType<typeof buildContextLayers>) => {
  const networkLayer = Layer.provide(NetworkLiveLayer, FileSystemLiveLayer);
  const gitLayer = Layer.provide(GitLiveLayer, ShellLiveLayer);
  const keychainLayer = Layer.provide(KeychainLiveLayer, ShellLiveLayer);
  const directoryLayer = Layer.provide(DirectoryLiveLayer, Layer.mergeAll(FileSystemLiveLayer, context.workspacePathsLayer));
  const databaseLayer = Layer.provide(DatabaseLiveLayer, Layer.mergeAll(FileSystemLiveLayer, context.hostPathsLayer));
  const configLoaderLayer = Layer.provide(ConfigLoaderLiveLayer, Layer.mergeAll(FileSystemLiveLayer, networkLayer, context.hostPathsLayer));
  const repositoryServiceLayer = Layer.provide(RepositoryServiceLiveLayer, context.workspacePathsLayer);
  const repoProviderLayer = Layer.provide(RepoProviderLiveLayer, context.appConfigLayer);
  const dockerServicesLayer = Layer.provide(DockerServicesLiveLayer, Layer.mergeAll(context.runtimeLayer));
  const installIdentityLayer = Layer.provide(InstallIdentityLiveLayer, databaseLayer);
  const versionLayer = Layer.provide(VersionLiveLayer, Layer.mergeAll(gitLayer, context.hostPathsLayer));
  const runStoreLayer = Layer.provide(RunStoreLiveLayer, databaseLayer);

  return {
    networkLayer,
    gitLayer,
    keychainLayer,
    directoryLayer,
    databaseLayer,
    configLoaderLayer,
    repositoryServiceLayer,
    repoProviderLayer,
    dockerServicesLayer,
    installIdentityLayer,
    versionLayer,
    runStoreLayer,
  };
};

const buildToolingLayers = (
  context: ReturnType<typeof buildContextLayers>,
  infrastructure: ReturnType<typeof buildInfrastructureLayers>,
) => {
  const miseLayer = Layer.provide(MiseLiveLayer, Layer.mergeAll(context.runtimeLayer, infrastructure.configLoaderLayer));
  const builtToolRegistryLayer = Layer.provide(
    BuiltToolRegistryLiveLayer,
    Layer.mergeAll(context.runtimeLayer, infrastructure.configLoaderLayer, miseLayer),
  );
  const toolRegistryServicesLayer = Layer.provide(
    Layer.mergeAll(ToolManagementLiveLayer, ToolHealthRegistryLiveLayer),
    builtToolRegistryLayer,
  );
  const healthCheckLayer = Layer.provide(HealthCheckLiveLayer, Layer.mergeAll(infrastructure.databaseLayer, toolRegistryServicesLayer));
  const tracingLayer = Layer.provide(
    TracingLiveLayer,
    Layer.mergeAll(
      context.runtimeLayer,
      infrastructure.configLoaderLayer,
      infrastructure.versionLayer,
      infrastructure.installIdentityLayer,
    ),
  );

  return {
    miseLayer,
    toolRegistryServicesLayer,
    healthCheckLayer,
    tracingLayer,
  };
};

/**
 * Load configuration
 */
export const loadConfiguration = (options: SetupOptions = {}) =>
  Effect.gen(function* () {
    yield* Effect.logDebug("🔧 Loading configuration...");

    const bootstrapLayer = buildBootstrapLayer(options);

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
export const buildAppLayer = (config: Config, options: SetupOptions = {}) => {
  const context = buildContextLayers(config, options);
  const infrastructure = buildInfrastructureLayers(context);
  const tooling = buildToolingLayers(context, infrastructure);
  const appServicesLayer = Layer.provide(
    Layer.mergeAll(ShellIntegrationLiveLayer, UpdateCheckerLiveLayer, CommandTrackerLiveLayer),
    Layer.mergeAll(context.runtimeLayer, infrastructure.versionLayer, infrastructure.runStoreLayer),
  );

  return Layer.mergeAll(
    context.runtimeLayer,
    infrastructure.networkLayer,
    infrastructure.gitLayer,
    infrastructure.keychainLayer,
    infrastructure.directoryLayer,
    infrastructure.databaseLayer,
    infrastructure.configLoaderLayer,
    infrastructure.repositoryServiceLayer,
    infrastructure.repoProviderLayer,
    infrastructure.dockerServicesLayer,
    infrastructure.installIdentityLayer,
    infrastructure.versionLayer,
    infrastructure.runStoreLayer,
    tooling.miseLayer,
    tooling.toolRegistryServicesLayer,
    tooling.healthCheckLayer,
    tooling.tracingLayer,
    InteractiveSelectorLiveLayer,
    CommandRegistryLiveLayer,
    appServicesLayer,
  );
};

/**
 * Setup application with configuration
 */
export const setupApplication = (options: SetupOptions = {}) =>
  Effect.gen(function* () {
    // Load configuration
    yield* Effect.logDebug("🔧 Setting up application...");
    const config = yield* loadConfiguration(options);

    // Build layers
    yield* Effect.logDebug("🔨 Building application layers...");
    const appLayer = buildAppLayer(config, options);
    const context = buildContextLayers(config, options);
    const setupInfrastructure = buildInfrastructureLayers(context);
    const directorySetupLayer = Layer.mergeAll(context.workspacePathsLayer, setupInfrastructure.directoryLayer);

    yield* Effect.logDebug(`✅ Application ready (org: ${config.defaultOrg})`);

    // Ensure base directory exists
    yield* Effect.gen(function* () {
      yield* Effect.logDebug("📁 Ensuring base directory exists...");
      const directoryService = yield* DirectoryTag;
      const workspacePaths = yield* WorkspacePathsTag;
      yield* directoryService.ensureBaseDirectoryExists();
      yield* Effect.logDebug(`✅ Base directory ready at: ${workspacePaths.baseSearchPath}`);
    }).pipe(Effect.provide(directorySetupLayer), Effect.withSpan("directory.ensure_base"));

    return { config, appLayer };
  });
