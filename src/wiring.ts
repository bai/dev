import os from "os";
import path from "path";

import { Layer } from "effect";

import { authCommand } from "./app/commands/auth";
import { cdCommand } from "./app/commands/cd";
import { cloneCommand } from "./app/commands/clone";
import { helpCommand } from "./app/commands/help";
import { runCommand } from "./app/commands/run";
import { statusCommand } from "./app/commands/status";
import { upCommand } from "./app/commands/up";
import { upgradeCommand } from "./app/commands/upgrade";
import { CommandTrackingServiceLive } from "./app/services/CommandTrackingService";
import { ShellIntegrationServiceLive } from "./app/services/ShellIntegrationService";
import { UpdateCheckServiceLive } from "./app/services/UpdateCheckService";
import { VersionServiceLive } from "./app/services/VersionService";
import { DevCli } from "./cli/parser";
import { ConfigLoaderLiveLayer } from "./config/loader";
import type { CliCommandSpec } from "./domain/models";
import { PathServiceLive } from "./domain/services/PathService";
import { RunStoreLiveLayer } from "./infra/db/RunStoreLive";
import { DirectoryServiceLive } from "./infra/fs/DirectoryService";
import { FileSystemLiveLayer } from "./infra/fs/FileSystemLive";
import { GitLiveLayer } from "./infra/git/GitLive";
import { KeychainLiveLayer } from "./infra/keychain/KeychainLive";
import { MiseLiveLayer } from "./infra/mise/MiseLive";
import { NetworkLiveLayer } from "./infra/network/NetworkLive";
import { GitHubProviderLayer } from "./infra/providers/GitHubProvider";
import { ShellLiveLayer } from "./infra/shell/ShellLive";
import { FzfToolsLiveLayer } from "./infra/tools/fzf";

/**
 * Composition Root - Wires all layers together
 * This is the only place where infrastructure implementations are imported
 * and composed with the application layer.
 */

// Base services with no dependencies
const BaseServicesLayer = PathServiceLive;

// Infrastructure services that depend on base services
const InfraServicesLayer = Layer.mergeAll(
  Layer.provide(FileSystemLiveLayer, BaseServicesLayer),
  Layer.provide(DirectoryServiceLive, BaseServicesLayer),
  Layer.provide(ShellLiveLayer, BaseServicesLayer),
);

// Combined base layer
const BaseInfraLayer = Layer.mergeAll(BaseServicesLayer, InfraServicesLayer);

// Network services that depend on filesystem and shell
const NetworkLayer = Layer.provide(NetworkLiveLayer, BaseInfraLayer);

// Git services that depend on shell and logging
const GitLayer = Layer.provide(GitLiveLayer, BaseInfraLayer);

// Configuration loading that depends on filesystem and network
const ConfigLayer = Layer.provide(
  ConfigLoaderLiveLayer(path.join(os.homedir(), ".config", "dev", "config.json")),
  Layer.mergeAll(BaseInfraLayer, NetworkLayer),
);

// Tool services that depend on shell, filesystem, and logging
const ToolServicesLayer = Layer.mergeAll(
  Layer.provide(MiseLiveLayer, BaseInfraLayer),
  Layer.provide(KeychainLiveLayer, BaseInfraLayer),
  Layer.provide(FzfToolsLiveLayer, BaseInfraLayer),
);

// Complete Infrastructure Layer with explicit dependency management
export const InfraLiveLayer = Layer.mergeAll(
  BaseInfraLayer,
  NetworkLayer,
  GitLayer,
  ConfigLayer,
  ToolServicesLayer,
  RunStoreLiveLayer,
  // GitHubProviderLayer("acme"), // Depends on NetworkService
);

// Application Layer (orchestration services only - no infrastructure imports)
export const AppLiveLayer = Layer.mergeAll(
  InfraLiveLayer,

  // App services - these coordinate domain logic
  ShellIntegrationServiceLive,
  CommandTrackingServiceLive,
  VersionServiceLive,
  UpdateCheckServiceLive,
);

// Available commands - exported for CLI layer
export const availableCommands: CliCommandSpec[] = [
  cdCommand,
  cloneCommand,
  upCommand,
  runCommand,
  authCommand,
  statusCommand,
  upgradeCommand,
  helpCommand,
];

// Create CLI instance with available commands
export function createDevCli(): DevCli {
  return new DevCli(availableCommands);
}
