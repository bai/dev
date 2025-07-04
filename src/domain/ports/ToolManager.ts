import { Context, type Effect } from "effect";

import { type ExternalToolError, type UnknownError } from "../errors";

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
  readonly getCurrentVersion: () => Effect.Effect<string | null, UnknownError>;
  readonly checkVersion: () => Effect.Effect<ToolVersionCheckResult, UnknownError>;
  readonly performUpgrade: () => Effect.Effect<boolean, UnknownError>;
  readonly ensureVersionOrUpgrade: () => Effect.Effect<void, ExternalToolError | UnknownError>;
}

/**
 * Tool management service that provides access to individual tool managers
 */
export interface ToolManagementService {
  readonly bun: ToolManager;
  readonly git: ToolManager;
  readonly mise: ToolManager;
  readonly fzf: ToolManager;
  readonly gcloud: ToolManager;
}

/**
 * Context tag for tool management service
 */
export class ToolManagementServiceTag extends Context.Tag("ToolManagementService")<
  ToolManagementServiceTag,
  ToolManagementService
>() {}
