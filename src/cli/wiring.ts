import { Layer } from "effect";

import { AppLiveLayer, availableCommands } from "../app/wiring";
import { CommanderAdapter } from "./adapter/commander";
import type { CliAdapter } from "./adapter/types";

// CLI Layer - provides CLI-specific services on top of App layer
export const CliLiveLayer = AppLiveLayer;

// For now, CLI layer is the same as App layer since we don't have
// additional CLI-specific services like telemetry yet

// Create CLI adapter with available commands
export function createCliAdapter(): CliAdapter {
  return new CommanderAdapter(availableCommands);
}
