import fs from "fs";
import path from "path";

import type { CommandRegistration, DevCommand } from "~/types/command";

/**
 * Command registry for managing all available commands
 */
export class CommandRegistry {
  private commands = new Map<string, CommandRegistration>();
  private aliases = new Map<string, string>();

  /**
   * Register a command
   */
  register(
    command: DevCommand,
    filePath?: string,
    source: "auto-discovered" | "manually-registered" = "manually-registered",
  ): void {
    const registration: CommandRegistration = {
      command,
      filePath,
      source,
    };

    this.commands.set(command.name, registration);

    // Register aliases
    if (command.aliases) {
      command.aliases.forEach((alias) => {
        this.aliases.set(alias, command.name);
      });
    }
  }

  /**
   * Get a command by name or alias
   */
  get(nameOrAlias: string): DevCommand | undefined {
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.commands.get(name)?.command;
  }

  /**
   * Get command registration info
   */
  getRegistration(nameOrAlias: string): CommandRegistration | undefined {
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.commands.get(name);
  }

  /**
   * Get all registered commands
   */
  getAll(): DevCommand[] {
    return Array.from(this.commands.values()).map((reg) => reg.command);
  }

  /**
   * Get all visible commands (not hidden)
   */
  getVisible(): DevCommand[] {
    return this.getAll().filter((cmd) => !cmd.hidden);
  }

  /**
   * Check if command exists
   */
  has(nameOrAlias: string): boolean {
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.commands.has(name);
  }

  /**
   * Remove a command
   */
  remove(nameOrAlias: string): boolean {
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    const registration = this.commands.get(name);

    if (!registration) {
      return false;
    }

    // Remove aliases
    if (registration.command.aliases) {
      registration.command.aliases.forEach((alias) => {
        this.aliases.delete(alias);
      });
    }

    return this.commands.delete(name);
  }

  /**
   * Clear all commands
   */
  clear(): void {
    this.commands.clear();
    this.aliases.clear();
  }

  /**
   * Auto-discover and register commands from a directory
   */
  async autoDiscoverCommands(cmdDir: string): Promise<void> {
    if (!fs.existsSync(cmdDir)) {
      console.warn(`⚠️ Command directory ${cmdDir} does not exist`);
      return;
    }

    const files = fs.readdirSync(cmdDir);
    const commandFiles = files.filter(
      (file) =>
        file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.endsWith(".spec.ts") && !file.includes("-new.ts"), // Skip the old refactored versions
    );

    for (const file of commandFiles) {
      const filePath = path.join(cmdDir, file);
      const commandName = path.basename(file, ".ts");

      try {
        // Dynamic import of the command module
        const module = await import(filePath);

        // Look for different export patterns
        let command: DevCommand | undefined;

        // 1. Look for default export that implements DevCommand
        if (module.default && this.isValidCommand(module.default)) {
          command = module.default;
        }
        // 2. Look for named export that matches the file name
        else if (module[commandName] && this.isValidCommand(module[commandName])) {
          command = module[commandName];
        }
        // 3. Look for command object export
        else if (module.command && this.isValidCommand(module.command)) {
          command = module.command;
        }
        // 4. Look for camelCase version of filename
        else if (module[this.toCamelCase(commandName)] && this.isValidCommand(module[this.toCamelCase(commandName)])) {
          command = module[this.toCamelCase(commandName)];
        }
        // 5. Look for commandName + "Command" pattern (e.g., statusCommand)
        else if (module[commandName + "Command"] && this.isValidCommand(module[commandName + "Command"])) {
          command = module[commandName + "Command"];
        }
        // 6. Look for camelCase + "Command" pattern (e.g., statusCommand for status.ts)
        else if (
          module[this.toCamelCase(commandName) + "Command"] &&
          this.isValidCommand(module[this.toCamelCase(commandName) + "Command"])
        ) {
          command = module[this.toCamelCase(commandName) + "Command"];
        }

        if (command) {
          this.register(command, filePath, "auto-discovered");
          console.log(
            `📦 Discovered command: ${command.name}${command.aliases ? ` (aliases: ${command.aliases.join(", ")})` : ""}`,
          );
        } else {
          console.warn(`⚠️ No valid command found in ${file}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load command from ${file}:`, error);
      }
    }
  }

  /**
   * Get statistics about registered commands
   */
  getStats(): {
    total: number;
    autoDiscovered: number;
    manuallyRegistered: number;
    hidden: number;
    withAliases: number;
  } {
    const commands = Array.from(this.commands.values());

    return {
      total: commands.length,
      autoDiscovered: commands.filter((reg) => reg.source === "auto-discovered").length,
      manuallyRegistered: commands.filter((reg) => reg.source === "manually-registered").length,
      hidden: commands.filter((reg) => reg.command.hidden).length,
      withAliases: commands.filter((reg) => reg.command.aliases && reg.command.aliases.length > 0).length,
    };
  }

  /**
   * Check if an object is a valid DevCommand
   */
  private isValidCommand(obj: any): obj is DevCommand {
    return obj && typeof obj.name === "string" && typeof obj.description === "string" && typeof obj.exec === "function";
  }

  /**
   * Convert kebab-case to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

/**
 * Global command registry instance
 */
export const commandRegistry = new CommandRegistry();
