import { Context, type Effect } from "effect";

import { type ExternalToolError, type ShellExecutionError, type UnknownError } from "./errors";

/**
 * Result of a tool version check
 */
export interface ToolVersionCheckResult {
  readonly isValid: boolean;
  readonly currentVersion: string | null;
}

/**
 * Individual tool manager interface
 */
export interface ToolManager {
  readonly getCurrentVersion: () => Effect.Effect<string | null, ShellExecutionError | UnknownError>;
  readonly checkVersion: () => Effect.Effect<ToolVersionCheckResult, ShellExecutionError | UnknownError>;
  readonly performUpgrade: () => Effect.Effect<boolean, ShellExecutionError | UnknownError>;
  readonly ensureVersionOrUpgrade: () => Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError>;
}

/**
 * Tool management port that provides access to individual tool managers
 */
export interface ToolManagement {
  readonly bun: ToolManager;
  readonly git: ToolManager;
  readonly mise: ToolManager;
  readonly fzf: ToolManager;
  readonly gcloud: ToolManager;
}

export class ToolManagementTag extends Context.Tag("ToolManagement")<ToolManagementTag, ToolManagement>() {}
