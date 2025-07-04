import { Effect } from "effect";

import { authCommand } from "./app/commands/auth";
import { cdCommand } from "./app/commands/cd";
import { cloneCommand } from "./app/commands/clone";
import { helpCommand } from "./app/commands/help";
import { runCommand } from "./app/commands/run";
import { statusCommand } from "./app/commands/status";
import { upCommand } from "./app/commands/up";
import { upgradeCommand } from "./app/commands/upgrade";
import { DevCli } from "./cli/parser";
import { extractDynamicValues, loadConfiguration } from "./config/bootstrap";
import { buildAppLiveLayer } from "./config/dynamic-layers";
import { defaultConfig } from "./config/schema";
import type { CliCommandSpec } from "./domain/models";

/**
 * Composition Root - Two-Stage Dynamic Wiring
 *
 * This implements a two-stage process to eliminate hardcoded values:
 * 1. Stage 1: Load configuration (bootstrap)
 * 2. Stage 2: Build layers with runtime configuration values
 */

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

/**
 * Two-stage application setup with dynamic configuration
 *
 * This replaces the static layer composition with a dynamic system:
 * 1. First, load configuration values (self-contained)
 * 2. Then, build layers using those runtime values
 *
 * This function is completely self-contained and provides all its own dependencies.
 */
export const setupApplicationWithConfig = () =>
  Effect.gen(function* () {
    // Stage 1: Load configuration (self-contained with bootstrap dependencies)
    yield* Effect.logInfo("🔧 Starting two-stage application setup...");
    const config = yield* loadConfiguration(); // This provides its own bootstrap layer

    // Stage 2: Extract values and build dynamic layers
    yield* Effect.logInfo("🔨 Stage 2: Building dynamic layers with configuration...");
    const configValues = extractDynamicValues(config);
    const appLayer = buildAppLiveLayer(configValues);

    yield* Effect.logInfo(`✅ Dynamic layers built successfully with org: ${configValues.defaultOrg}`);

    return {
      config,
      configValues,
      appLayer,
    };
  });

/**
 * Fallback function for backward compatibility
 *
 * This provides a default static app layer using the default configuration.
 * This is used when the dynamic system can't be used (e.g., during CLI parsing).
 */
export function getDefaultAppLayer() {
  // Use default configuration values for the static layer
  const defaultConfigValues = extractDynamicValues(defaultConfig);
  return buildAppLiveLayer(defaultConfigValues);
}

/**
 * Legacy exports for backward compatibility
 * These are now dynamically created, so they can't be exported as constants
 */

// Note: InfraLiveLayer and AppLiveLayer are no longer static exports
// They must be created dynamically using the configuration values
// Use setupApplicationWithConfig() instead

// Legacy static layer exports (deprecated - use dynamic setup instead)
// export const InfraLiveLayer = ...  // Now created dynamically
// export const AppLiveLayer = ...    // Now created dynamically
