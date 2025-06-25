import fs from "fs";
import path from "path";

import type { CommandRegistration, DevCommand } from "~/lib/core/command-types";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

/**
 * Simple command registry state
 */
const commands = new Map<string, DevCommand>();
const aliases = new Map<string, string>();

/**
 * Register a command
 */
export const registerCommand = (command: DevCommand): void => {
  commands.set(command.name, command);

  // Register aliases
  if (command.aliases) {
    command.aliases.forEach((alias) => {
      aliases.set(alias, command.name);
    });
  }
};

/**
 * Get a command by name or alias
 */
export const getCommand = (nameOrAlias: string): DevCommand | undefined => {
  const name = aliases.get(nameOrAlias) || nameOrAlias;
  return commands.get(name);
};

/**
 * Get all registered commands
 */
export const getAllCommands = (): DevCommand[] => {
  return Array.from(commands.values());
};

/**
 * Auto-discover and register commands from a directory
 */
export const autoDiscoverCommands = async (cmdDir: string): Promise<number> => {
  if (!fs.existsSync(cmdDir)) {
    logger.warn(`⚠️ Command directory ${cmdDir} does not exist`);
    return 0;
  }

  const files = fs.readdirSync(cmdDir);
  const commandFiles = files.filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

  let discovered = 0;
  const discoveredCommands: string[] = [];

  for (const file of commandFiles) {
    const filePath = path.join(cmdDir, file);

    try {
      const module = await import(filePath);

      // Look for exports ending with "Command"
      const commandExport = Object.values(module).find(
        (exp: any) =>
          exp && typeof exp.name === "string" && typeof exp.description === "string" && typeof exp.exec === "function",
      ) as DevCommand | undefined;

      if (commandExport) {
        registerCommand(commandExport);
        discovered++;
        discoveredCommands.push(commandExport.name);
      } else {
        logger.warn(`⚠️ No valid command found in ${file}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to load command from ${file}:`, error);
    }
  }

  if (isDebugMode() && discoveredCommands.length > 0) {
    logger.debug(`📦 Discovered commands: ${discoveredCommands.join(", ")}`);
  }

  return discovered;
};

/**
 * Get statistics about registered commands
 */
export const getCommandStats = (): {
  total: number;
  withAliases: number;
} => {
  const commandArray = Array.from(commands.values());

  return {
    total: commandArray.length,
    withAliases: commandArray.filter((cmd) => cmd.aliases && cmd.aliases.length > 0).length,
  };
};

/**
 * Simplified command registry
 */
export const commandRegistry = {
  getAll: getAllCommands,
  autoDiscoverCommands,
  getStats: getCommandStats,
};
