import os from "os";
import path from "path";

import { Layer } from "effect";

import { ConfigLoaderLiveLayer } from "../config/loader";
import type { CliCommandSpec } from "../domain/models";
import { PathServiceLive } from "../domain/services/PathService";
import { ClockLiveLayer } from "../effect/Clock";
import { LoggerLiveLayer } from "../effect/LoggerLive";
import { RunStoreLiveLayer } from "../infra/db/RunStoreLive";
import { DirectoryServiceLive } from "../infra/fs/DirectoryService";
import { FileSystemLiveLayer } from "../infra/fs/FileSystemLive";
import { GitLiveLayer } from "../infra/git/GitLive";
import { KeychainLiveLayer } from "../infra/keychain/KeychainLive";
import { MiseLiveLayer } from "../infra/mise/MiseLive";
import { NetworkLiveLayer } from "../infra/network/NetworkLive";
import { GitHubProviderLayer } from "../infra/providers/GitHubProvider";
import { ShellLiveLayer } from "../infra/shell/ShellLive";
import { authCommand } from "./commands/auth";
import { cdCommand } from "./commands/cd";
import { cloneCommand } from "./commands/clone";
import { helpCommand } from "./commands/help";
import { runCommand } from "./commands/run";
import { statusCommand } from "./commands/status";
import { upCommand } from "./commands/up";
import { upgradeCommand } from "./commands/upgrade";
import { CommandTrackingServiceLive } from "./services/CommandTrackingService";
import { DebugServiceLive } from "./services/DebugService";
import { ShellIntegrationServiceLive } from "./services/ShellIntegrationService";
import { UpdateCheckServiceLive } from "./services/UpdateCheckService";
import { VersionServiceLive } from "./services/VersionService";

// Infrastructure Layer - merging all services directly
export const AppLiveLayer = Layer.mergeAll(
  // Core infrastructure
  FileSystemLiveLayer,
  LoggerLiveLayer,
  ClockLiveLayer,

  // Infrastructure services (NetworkLiveLayer must come before ConfigLoaderLiveLayer)
  NetworkLiveLayer,
  ConfigLoaderLiveLayer(path.join(os.homedir(), ".config", "dev", "config.json")),

  // Domain services
  PathServiceLive,

  // More infrastructure services
  DirectoryServiceLive,
  ShellLiveLayer,
  GitLiveLayer,
  MiseLiveLayer,
  KeychainLiveLayer,
  RunStoreLiveLayer,
  GitHubProviderLayer("acme"), // Default org from config

  // App services
  ShellIntegrationServiceLive,
  CommandTrackingServiceLive,
  VersionServiceLive,
  DebugServiceLive,
  UpdateCheckServiceLive,
);

// Available commands
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

// All services are now accessed through Effect Context services instead of a centralized interface
