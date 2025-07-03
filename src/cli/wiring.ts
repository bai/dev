import { Layer } from "effect";

import { AppLiveLayer, availableCommands } from "../app/wiring";
import { DevCli } from "./parser";

// CLI Layer - provides CLI-specific services on top of App layer
export const CliLiveLayer = AppLiveLayer;

// For now, CLI layer is the same as App layer since we don't have
// additional CLI-specific services like telemetry yet

// Create CLI instance with available commands
export function createDevCli(): DevCli {
  return new DevCli(availableCommands);
}
