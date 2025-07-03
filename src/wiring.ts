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
import { DebugServiceLive } from "./app/services/DebugService";
import { ShellIntegrationServiceLive } from "./app/services/ShellIntegrationService";
import { UpdateCheckServiceLive } from "./app/services/UpdateCheckService";
import { VersionServiceLive } from "./app/services/VersionService";
import { ConfigLoaderLiveLayer } from "./config/loader";
import type { CliCommandSpec } from "./domain/models";
import { PathServiceLive } from "./domain/services/PathService";
import { ClockLiveLayer } from "./effect/Clock";
import { LoggerLiveLayer } from "./effect/LoggerLive";
import { RunStoreLiveLayer } from "./infra/db/RunStoreLive";
import { DirectoryServiceLive } from "./infra/fs/DirectoryService";
import { FileSystemLiveLayer } from "./infra/fs/FileSystemLive";
import { GitLiveLayer } from "./infra/git/GitLive";
import { KeychainLiveLayer } from "./infra/keychain/KeychainLive";
import { MiseLiveLayer } from "./infra/mise/MiseLive";
import { NetworkLiveLayer } from "./infra/network/NetworkLive";
import { GitHubProviderLayer } from "./infra/providers/GitHubProvider";
import { ShellLiveLayer } from "./infra/shell/ShellLive";

/**
 * Composition Root - Wires all layers together
 * This is the only place where infrastructure implementations are imported
 * and composed with the application layer.
 */

// Infrastructure Layer - building step by step to avoid duplication
const BaseInfraLayer = Layer.mergeAll(
  FileSystemLiveLayer,
  LoggerLiveLayer,
  ClockLiveLayer,
  PathServiceLive,
  DirectoryServiceLive,
  ShellLiveLayer,
);

const NetworkLayer = Layer.provide(NetworkLiveLayer, BaseInfraLayer);

const GitLayer = Layer.provide(GitLiveLayer, BaseInfraLayer);

const ConfigLayer = Layer.provide(
  ConfigLoaderLiveLayer(path.join(os.homedir(), ".config", "dev", "config.json")),
  Layer.mergeAll(BaseInfraLayer, NetworkLayer),
);

// Complete Infrastructure Layer
export const InfraLiveLayer = Layer.mergeAll(
  BaseInfraLayer,
  GitLayer,
  RunStoreLiveLayer,
  Layer.provide(MiseLiveLayer, BaseInfraLayer),
  Layer.provide(KeychainLiveLayer, BaseInfraLayer),
  // GitHubProviderLayer("acme"), // Depends on NetworkService
);

// Application Layer (orchestration services only - no infrastructure imports)
export const AppLiveLayer = Layer.mergeAll(
  InfraLiveLayer,

  // App services - these coordinate domain logic
  ShellIntegrationServiceLive,
  CommandTrackingServiceLive,
  VersionServiceLive,
  DebugServiceLive,
  UpdateCheckServiceLive,
);

// CLI Layer
export const CliLiveLayer = AppLiveLayer;

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
