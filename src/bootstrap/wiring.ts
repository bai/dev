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
import { NetworkLiveLayer } from "~/capabilities/system/network-live";
import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { HealthCheckLiveLayer } from "~/capabilities/tools/health-check-live";
import { MiseLiveLayer } from "~/capabilities/tools/mise-live";
import { ToolHealthRegistryLiveLayer } from "~/capabilities/tools/tool-health-registry-live";
import { ToolManagementLiveLayer } from "~/capabilities/tools/tool-management-live";
import { BuiltToolRegistryLiveLayer } from "~/capabilities/tools/tool-registry-live";
import { DirectoryLiveLayer } from "~/capabilities/workspace/directory-live";
import { Directory } from "~/capabilities/workspace/directory-port";
import { ShellIntegrationLiveLayer } from "~/capabilities/workspace/shell-integration-service";
import { AppConfig } from "~/core/config/app-config-port";
import { ConfigLoaderLiveLayer } from "~/core/config/config-loader-live";
import { ConfigLoader } from "~/core/config/config-loader-port";
import { type Config } from "~/core/config/config-schema";
import { TracingLiveLayer } from "~/core/observability/tracing-live";
import {
  EnvironmentPaths,
  type EnvironmentPathsService,
  InstallPaths,
  type InstallPathsService,
  StatePaths,
  type StatePathsService,
  WorkspacePaths,
} from "~/core/runtime/path-service";
import {
  createEnvironmentPathsLiveLayer,
  createInstallPathsLiveLayer,
  createStatePathsLiveLayer,
  WorkspacePathsLiveLayer,
} from "~/core/runtime/path-service-live";
import { RuntimeContextLiveLayer } from "~/core/runtime/runtime-context-live";
import { VersionLiveLayer } from "~/core/runtime/version-service";
import { UpdateCheckerLiveLayer } from "~/features/upgrade/update-check-service";

interface SetupOptions {
  readonly configPath?: string;
  readonly environmentPaths?: EnvironmentPathsService;
  readonly installPaths?: InstallPathsService;
  readonly statePaths?: StatePathsService;
}

const buildEnvironmentPathsLayer = (options: SetupOptions) =>
  options.environmentPaths ? Layer.succeed(EnvironmentPaths, options.environmentPaths) : createEnvironmentPathsLiveLayer();

const buildInstallPathsLayer = (options: SetupOptions) =>
  options.installPaths ? Layer.succeed(InstallPaths, options.installPaths) : createInstallPathsLiveLayer();

const buildStatePathsLayer = (options: SetupOptions) =>
  options.statePaths ? Layer.succeed(StatePaths, options.statePaths) : createStatePathsLiveLayer(options.configPath);

const buildBootstrapLayer = (options: SetupOptions) => {
  const statePathsLayer = buildStatePathsLayer(options);
  const networkLayer = NetworkLiveLayer.pipe(Layer.provideMerge(FileSystemLiveLayer));

  return ConfigLoaderLiveLayer.pipe(Layer.provideMerge(Layer.mergeAll(statePathsLayer, networkLayer)));
};

const buildContextLayer = (config: Config, options: SetupOptions) => {
  const environmentPathsLayer = buildEnvironmentPathsLayer(options);
  const installPathsLayer = buildInstallPathsLayer(options);
  const statePathsLayer = buildStatePathsLayer(options);
  const appConfigLayer = Layer.succeed(AppConfig, config);
  const baseLayer = Layer.mergeAll(
    environmentPathsLayer,
    installPathsLayer,
    statePathsLayer,
    appConfigLayer,
    FileSystemLiveLayer,
    ShellLiveLayer,
    AutoUpgradeTriggerLiveLayer,
    RuntimeContextLiveLayer,
  );
  const workspaceLayer = WorkspacePathsLiveLayer.pipe(Layer.provideMerge(baseLayer));

  return Layer.mergeAll(baseLayer, workspaceLayer);
};

const buildDirectorySetupLayer = (contextLayer: ReturnType<typeof buildContextLayer>) =>
  DirectoryLiveLayer.pipe(Layer.provideMerge(contextLayer));

const buildAppLayerFromContext = (baseLayer: ReturnType<typeof buildContextLayer>) => {
  const platformLayer = Layer.mergeAll(
    NetworkLiveLayer,
    GitLiveLayer,
    DirectoryLiveLayer,
    DatabaseLiveLayer,
    RepoProviderLiveLayer,
    RepositoryServiceLiveLayer,
    DockerServicesLiveLayer,
    InteractiveSelectorLiveLayer,
    CommandRegistryLiveLayer,
    ShellIntegrationLiveLayer,
  ).pipe(Layer.provideMerge(baseLayer));
  const supportLayer = Layer.mergeAll(ConfigLoaderLiveLayer, VersionLiveLayer, RunStoreLiveLayer, InstallIdentityLiveLayer).pipe(
    Layer.provideMerge(platformLayer),
  );
  const miseLayer = MiseLiveLayer.pipe(Layer.provideMerge(supportLayer));
  const toolRegistryLayer = BuiltToolRegistryLiveLayer.pipe(Layer.provideMerge(miseLayer));
  const toolingLayer = Layer.mergeAll(ToolManagementLiveLayer, ToolHealthRegistryLiveLayer).pipe(Layer.provideMerge(toolRegistryLayer));

  return Layer.mergeAll(TracingLiveLayer, UpdateCheckerLiveLayer, CommandTrackerLiveLayer, HealthCheckLiveLayer).pipe(
    Layer.provideMerge(toolingLayer),
  );
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
      const configLoader = yield* ConfigLoader;
      const config = yield* configLoader.load();
      yield* Effect.logDebug(`✅ Configuration loaded successfully (org: ${config.defaultOrg})`);
      return config;
    }).pipe(Effect.provide(bootstrapLayer));
  });

/**
 * Build the complete application layer
 */
export const buildAppLayer = (config: Config, options: SetupOptions = {}) => {
  return buildAppLayerFromContext(buildContextLayer(config, options));
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
    const contextLayer = buildContextLayer(config, options);
    const appLayer = buildAppLayerFromContext(contextLayer);
    const directorySetupLayer = buildDirectorySetupLayer(contextLayer);

    yield* Effect.logDebug(`✅ Application ready (org: ${config.defaultOrg})`);

    // Ensure base directory exists
    yield* Effect.gen(function* () {
      yield* Effect.logDebug("📁 Ensuring base directory exists...");
      const directoryService = yield* Directory;
      const workspacePaths = yield* WorkspacePaths;
      yield* directoryService.ensureBaseDirectoryExists();
      yield* Effect.logDebug(`✅ Base directory ready at: ${workspacePaths.baseSearchPath}`);
    }).pipe(Effect.provide(directorySetupLayer), Effect.withSpan("directory.ensure_base"));

    return { config, appLayer };
  });
