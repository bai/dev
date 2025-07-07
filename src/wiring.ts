import { Command } from "@effect/cli";
import { Effect } from "effect";

import { cdCommand } from "./app/cd-command";
import { cloneCommand } from "./app/clone-command";
import { runCommand } from "./app/run-command";
import { statusCommand } from "./app/status-command";
import { upCommand } from "./app/up-command";
import { upgradeCommand } from "./app/upgrade-command";
import { extractDynamicValues, loadConfiguration } from "./config/bootstrap";
import { buildAppLiveLayer } from "./config/dynamic-layers";

/**
 * Composition Root - Two-Stage Dynamic Wiring
 *
 * This implements a two-stage process to eliminate hardcoded values:
 * 1. Stage 1: Load configuration (bootstrap)
 * 2. Stage 2: Build layers with runtime configuration values
 */

// Create main command using @effect/cli
export const getMainCommand = () => {
  // Create main command with all subcommands
  return Command.make("dev", {}, () => Effect.logInfo("Use --help to see available commands")).pipe(
    Command.withSubcommands([
      cdCommand,
      cloneCommand,
      upCommand,
      runCommand,
      statusCommand,
      upgradeCommand,
    ]),
  );
};

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
    yield* Effect.logDebug("🔧 Starting two-stage application setup...");
    const config = yield* loadConfiguration(); // This provides its own bootstrap layer

    // Stage 2: Extract values and build dynamic layers
    yield* Effect.logDebug("🔨 Stage 2: Building dynamic layers with configuration...");
    const configValues = extractDynamicValues(config);
    const appLayer = buildAppLiveLayer(configValues);

    yield* Effect.logDebug(`✅ Dynamic layers built successfully with org: ${configValues.defaultOrg}`);

    return {
      config,
      configValues,
      appLayer,
    };
  });
