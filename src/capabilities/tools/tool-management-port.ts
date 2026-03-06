import { Effect } from "effect";

import { type ExternalToolError, type ShellExecutionError, type UnknownError } from "~/core/errors";

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

export interface ManagedTool {
  readonly id: string;
  readonly displayName: string;
  readonly essential: boolean;
  readonly manager: ToolManager;
}

/**
 * Tool management port that provides access to individual tool managers
 */
export class ToolManagementTag extends Effect.Tag("ToolManagement")<
  ToolManagementTag,
  {
    readonly tools: Readonly<Record<string, ToolManager>>;
    readonly listTools: () => readonly ManagedTool[];
    readonly listEssentialTools: () => readonly ManagedTool[];
  }
>() {}

export type ToolManagement = (typeof ToolManagementTag)["Service"];
