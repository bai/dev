import type { CliCommandSpec } from "../../domain/models";

export interface CliAdapter {
  /**
   * Initialize the CLI with available commands
   */
  initialize(commands: CliCommandSpec[]): void;

  /**
   * Parse and execute command line arguments
   */
  parseAndExecute(args: string[]): Promise<void>;

  /**
   * Set program metadata
   */
  setMetadata(metadata: { name: string; description: string; version: string }): void;
}
