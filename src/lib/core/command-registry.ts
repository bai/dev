import fs from "fs";
import path from "path";

import type { CommandRegistration, DevCommand } from "~/lib/core/command-types";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

/**
 * Internal state for the command registry (module-level encapsulation)
 */
const createRegistryState = () => {
  const commands = new Map<string, CommandRegistration>();
  const aliases = new Map<string, string>();

  return {
    getCommands: () => commands,
    getAliases: () => aliases,
    clearAll: () => {
      commands.clear();
      aliases.clear();
    },
  };
};

// Module-level state
const registryState = createRegistryState();

/**
 * Convert kebab-case to camelCase
 */
const toCamelCase = (str: string): string => {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Check if an object is a valid DevCommand
 */
const isValidCommand = (obj: any): obj is DevCommand => {
  return obj && typeof obj.name === "string" && typeof obj.description === "string" && typeof obj.exec === "function";
};

/**
 * Register a command
 */
export const registerCommand = (
  command: DevCommand,
  filePath?: string,
  source: "auto-discovered" | "manually-registered" = "manually-registered",
): void => {
  const registration: CommandRegistration = {
    command,
    filePath,
    source,
  };

  const commands = registryState.getCommands();
  const aliases = registryState.getAliases();

  commands.set(command.name, registration);

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
  const aliases = registryState.getAliases();
  const commands = registryState.getCommands();
  const name = aliases.get(nameOrAlias) || nameOrAlias;
  return commands.get(name)?.command;
};

/**
 * Get command registration info
 */
export const getCommandRegistration = (nameOrAlias: string): CommandRegistration | undefined => {
  const aliases = registryState.getAliases();
  const commands = registryState.getCommands();
  const name = aliases.get(nameOrAlias) || nameOrAlias;
  return commands.get(name);
};

/**
 * Get all registered commands
 */
export const getAllCommands = (): DevCommand[] => {
  const commands = registryState.getCommands();
  return Array.from(commands.values()).map((reg) => reg.command);
};

/**
 * Get all visible commands (not hidden)
 */
export const getVisibleCommands = (): DevCommand[] => {
  return getAllCommands().filter((cmd) => !cmd.hidden);
};

/**
 * Check if command exists
 */
export const hasCommand = (nameOrAlias: string): boolean => {
  const aliases = registryState.getAliases();
  const commands = registryState.getCommands();
  const name = aliases.get(nameOrAlias) || nameOrAlias;
  return commands.has(name);
};

/**
 * Remove a command
 */
export const removeCommand = (nameOrAlias: string): boolean => {
  const aliases = registryState.getAliases();
  const commands = registryState.getCommands();
  const name = aliases.get(nameOrAlias) || nameOrAlias;
  const registration = commands.get(name);

  if (!registration) {
    return false;
  }

  // Remove aliases
  if (registration.command.aliases) {
    registration.command.aliases.forEach((alias) => {
      aliases.delete(alias);
    });
  }

  return commands.delete(name);
};

/**
 * Clear all commands
 */
export const clearAllCommands = (): void => {
  registryState.clearAll();
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
  const commandFiles = files.filter(
    (file) =>
      file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.endsWith(".spec.ts") && !file.includes("-new.ts"), // Skip the old refactored versions
  );

  let discovered = 0;
  const discoveredCommands: string[] = [];

  for (const file of commandFiles) {
    const filePath = path.join(cmdDir, file);
    const commandName = path.basename(file, ".ts");

    try {
      // Dynamic import of the command module
      const module = await import(filePath);

      // Look for different export patterns
      let command: DevCommand | undefined;

      // 1. Look for default export that implements DevCommand
      if (module.default && isValidCommand(module.default)) {
        command = module.default;
      }
      // 2. Look for named export that matches the file name
      else if (module[commandName] && isValidCommand(module[commandName])) {
        command = module[commandName];
      }
      // 3. Look for command object export
      else if (module.command && isValidCommand(module.command)) {
        command = module.command;
      }
      // 4. Look for camelCase version of filename
      else if (module[toCamelCase(commandName)] && isValidCommand(module[toCamelCase(commandName)])) {
        command = module[toCamelCase(commandName)];
      }
      // 5. Look for commandName + "Command" pattern (e.g., statusCommand)
      else if (module[commandName + "Command"] && isValidCommand(module[commandName + "Command"])) {
        command = module[commandName + "Command"];
      }
      // 6. Look for camelCase + "Command" pattern (e.g., statusCommand for status.ts)
      else if (
        module[toCamelCase(commandName) + "Command"] &&
        isValidCommand(module[toCamelCase(commandName) + "Command"])
      ) {
        command = module[toCamelCase(commandName) + "Command"];
      }

      if (command) {
        registerCommand(command, filePath, "auto-discovered");
        discovered++;
        discoveredCommands.push(command.name);
      } else {
        logger.warn(`⚠️ No valid command found in ${file}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to load command from ${file}:`, error);
    }
  }

  // Log all discovered commands at once in debug mode
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
  autoDiscovered: number;
  manuallyRegistered: number;
  hidden: number;
  withAliases: number;
} => {
  const commands = registryState.getCommands();
  const commandArray = Array.from(commands.values());

  return {
    total: commandArray.length,
    autoDiscovered: commandArray.filter((reg) => reg.source === "auto-discovered").length,
    manuallyRegistered: commandArray.filter((reg) => reg.source === "manually-registered").length,
    hidden: commandArray.filter((reg) => reg.command.hidden).length,
    withAliases: commandArray.filter((reg) => reg.command.aliases && reg.command.aliases.length > 0).length,
  };
};

/**
 * Functional command registry manager
 */
export const commandRegistry = {
  register: registerCommand,
  get: getCommand,
  getRegistration: getCommandRegistration,
  getAll: getAllCommands,
  getVisible: getVisibleCommands,
  has: hasCommand,
  remove: removeCommand,
  clear: clearAllCommands,
  autoDiscoverCommands,
  getStats: getCommandStats,
};
