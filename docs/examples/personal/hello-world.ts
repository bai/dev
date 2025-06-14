/**
 * Hello World Command
 * Usage: dev hello-world
 * This plugin prints "hello world" when executed
 */

import type { DevCommand, CommandContext } from "../../../src/lib/core/command-types";

/**
 * Hello World command implementation
 */
const helloWorldCommand: DevCommand = {
  name: 'hello-world',
  description: 'Prints hello world to the console',
  help: `
This is a simple hello world command that demonstrates the dev CLI plugin system.

Examples:
  dev hello-world           # Prints "hello world"
  `,

  async exec(context: CommandContext): Promise<void> {
    context.logger.info('hello world');
  }
};

export default helloWorldCommand;
