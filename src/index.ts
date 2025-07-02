#!/usr/bin/env bun
import { createCliAdapter } from "./cli/wiring";

async function main() {
  try {
    // Create CLI adapter
    const adapter = createCliAdapter();

    // Set program metadata
    adapter.setMetadata({
      name: "dev",
      description: "A CLI tool for quick directory navigation and environment management",
      version: "2.0.0",
    });

    // Show help when no command is provided
    if (process.argv.slice(2).length === 0) {
      process.argv.push("help");
    }

    // Parse and execute command
    await adapter.parseAndExecute(process.argv);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exitCode = 1;
  }
}

main();
