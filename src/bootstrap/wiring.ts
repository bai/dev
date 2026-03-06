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

const buildContextLayer = (config: Config, options: SetupOptions) => {
  const hostPathsLayer = createHostPathsLiveLayer(options.configPath);
  const appConfigLayer = Layer.succeed(AppConfigTag, config);
  const workspacePathsLayer = Layer.provide(WorkspacePathsLiveLayer, Layer.mergeAll(hostPathsLayer, appConfigLayer));

  return Layer.mergeAll(
    hostPathsLayer,
    appConfigLayer,
    FileSystemLiveLayer,
    ShellLiveLayer,
    AutoUpgradeTriggerLiveLayer,
    RuntimeContextLiveLayer,
    workspacePathsLayer,
  );
};

const buildDirectorySetupLayer = (config: Config, options: SetupOptions) => {
  const contextLayer = buildContextLayer(config, options);
  const directoryLayer = Layer.provide(DirectoryLiveLayer, contextLayer);
  return Layer.mergeAll(contextLayer, directoryLayer);
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
  const contextLayer = buildContextLayer(config, options);
  const platformLayer = Layer.mergeAll(
    Layer.provide(NetworkLiveLayer, contextLayer),
    Layer.provide(GitLiveLayer, contextLayer),
    Layer.provide(KeychainLiveLayer, contextLayer),
    Layer.provide(DirectoryLiveLayer, contextLayer),
    Layer.provide(DatabaseLiveLayer, contextLayer),
    Layer.provide(RepoProviderLiveLayer, contextLayer),
    Layer.provide(RepositoryServiceLiveLayer, contextLayer),
    Layer.provide(DockerServicesLiveLayer, contextLayer),
    InteractiveSelectorLiveLayer,
    CommandRegistryLiveLayer,
    Layer.provide(ShellIntegrationLiveLayer, contextLayer),
  );
  const platformDependencies = Layer.mergeAll(contextLayer, platformLayer);
  const supportLayer = Layer.mergeAll(
    Layer.provide(ConfigLoaderLiveLayer, platformDependencies),
    Layer.provide(VersionLiveLayer, platformDependencies),
    Layer.provide(RunStoreLiveLayer, platformDependencies),
    Layer.provide(InstallIdentityLiveLayer, platformDependencies),
  );
  const supportDependencies = Layer.mergeAll(platformDependencies, supportLayer);
  const miseLayer = Layer.provide(MiseLiveLayer, supportDependencies);
  const toolRegistryDependencies = Layer.mergeAll(supportDependencies, miseLayer);
  const toolRegistryLayer = Layer.provide(BuiltToolRegistryLiveLayer, toolRegistryDependencies);
  const appServicesLayer = Layer.mergeAll(
    Layer.provide(ToolManagementLiveLayer, toolRegistryLayer),
    Layer.provide(ToolHealthRegistryLiveLayer, toolRegistryLayer),
    Layer.provide(TracingLiveLayer, supportDependencies),
    Layer.provide(UpdateCheckerLiveLayer, supportDependencies),
    Layer.provide(CommandTrackerLiveLayer, supportDependencies),
  );
  const healthCheckDependencies = Layer.mergeAll(platformDependencies, toolRegistryLayer, appServicesLayer);
  const healthCheckLayer = Layer.provide(HealthCheckLiveLayer, healthCheckDependencies);

  return Layer.mergeAll(contextLayer, platformLayer, supportLayer, miseLayer, toolRegistryLayer, appServicesLayer, healthCheckLayer);
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
    const directorySetupLayer = buildDirectorySetupLayer(config, options);

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
