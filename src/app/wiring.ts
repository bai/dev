import os from "os";
import path from "path";

import { Layer } from "effect";

import { ConfigLoaderLiveLayer } from "../config/loader";
import type { CliCommandSpec } from "../domain/models";
import { ClockLiveLayer } from "../effect/Clock";
import { LoggerLiveLayer } from "../effect/LoggerLive";
import { RunStoreLiveLayer } from "../infra/db/RunStoreLive";
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

// Infrastructure Layer - provides all the basic services
export const InfraLiveLayer = Layer.mergeAll(
  FileSystemLiveLayer,
  ShellLiveLayer,
  NetworkLiveLayer,
  RunStoreLiveLayer,
).pipe(
  Layer.provide(Layer.mergeAll(GitLiveLayer, KeychainLiveLayer, MiseLiveLayer)),
  Layer.provide(GitHubProviderLayer("github")), // default org can be overridden
);

// App Layer - provides application-level services
export const AppLiveLayer = Layer.mergeAll(
  LoggerLiveLayer,
  ClockLiveLayer,
  ConfigLoaderLiveLayer(path.join(os.homedir(), ".config", "dev", "config.json")),
).pipe(Layer.provide(InfraLiveLayer));

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
