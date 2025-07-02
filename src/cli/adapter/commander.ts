import { Command } from "commander";

import type { AppServices } from "../../app/wiring";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { CliAdapter } from "./types";

export class CommanderAdapter implements CliAdapter {
  private program: Command;
  private services: AppServices;

  constructor(services: AppServices) {
    this.program = new Command();
    this.services = services;
    this.program.exitOverride(); // Convert Commander failures into typed errors
  }

  setMetadata(metadata: { name: string; description: string; version: string }): void {
    this.program.name(metadata.name).description(metadata.description).version(metadata.version);
  }

  initialize(commands: CliCommandSpec[]): void {
    for (const commandSpec of commands) {
      this.registerCommand(commandSpec);
    }
  }

  async parseAndExecute(args: string[]): Promise<void> {
    await this.program.parseAsync(args);
  }

  private registerCommand(commandSpec: CliCommandSpec): void {
    const cmd = this.program.command(commandSpec.name);

    cmd.description(commandSpec.description);

    // Add aliases
    if (commandSpec.aliases) {
      for (const alias of commandSpec.aliases) {
        cmd.alias(alias);
      }
    }

    // Add arguments
    if (commandSpec.arguments) {
      for (const arg of commandSpec.arguments) {
        if (arg.required) {
          cmd.argument(`<${arg.name}>`, arg.description, arg.defaultValue);
        } else {
          cmd.argument(`[${arg.name}]`, arg.description, arg.defaultValue);
        }
      }
    }

    // Add options
    if (commandSpec.options) {
      for (const option of commandSpec.options) {
        if (option.parser) {
          cmd.option(option.flags, option.description, option.parser, option.defaultValue);
        } else {
          cmd.option(option.flags, option.description, option.defaultValue);
        }
      }
    }

    // Set action handler
    cmd.action(async (...args) => {
      const commandArgs = args.slice(0, -1); // Remove the Command object
      const commanderCommand = args[args.length - 1] as Command;

      // Create context for command execution
      const context: CommandContext = {
        args: this.parseArguments(commandSpec, commandArgs),
        options: commanderCommand.opts(),
        logger: this.services.logger,
        config: await this.createConfigManager(),
        // Add other services without duplicating logger
        fileSystem: this.services.fileSystem,
        shell: this.services.shell,
        git: this.services.git,
        network: this.services.network,
        keychain: this.services.keychain,
        mise: this.services.mise,
        repoProvider: this.services.repoProvider,
        runStore: this.services.runStore,
        clock: this.services.clock,
        configLoader: this.services.configLoader,
      };

      try {
        await commandSpec.exec(context);
      } catch (error) {
        this.services.logger.error(`Command failed: ${error}`);
        throw error;
      }
    });
  }

  private parseArguments(commandSpec: CliCommandSpec, args: any[]): Record<string, any> {
    const parsed: Record<string, any> = {};

    if (commandSpec.arguments) {
      for (let i = 0; i < commandSpec.arguments.length; i++) {
        const argSpec = commandSpec.arguments[i];
        if (argSpec) {
          parsed[argSpec.name] = args[i];
        }
      }
    }

    return parsed;
  }

  private async createConfigManager() {
    // Load configuration and create a manager
    const config = await this.services.configLoader.load();

    if (typeof config === "object" && "_tag" in config) {
      // Use default config if loading fails
      return {
        get: (key: string, defaultValue?: any) => defaultValue,
        set: () => {
          throw new Error("Config modification not supported");
        },
        has: () => false,
        getAll: () => ({}),
      };
    }

    return {
      get: (key: string, defaultValue?: any) => {
        const keys = key.split(".");
        let value: any = config;

        for (const k of keys) {
          value = value?.[k];
        }

        return value !== undefined ? value : defaultValue;
      },
      set: () => {
        throw new Error("Config modification not supported");
      },
      has: (key: string) => {
        const keys = key.split(".");
        let value: any = config;

        for (const k of keys) {
          value = value?.[k];
        }

        return value !== undefined;
      },
      getAll: () => ({ ...config }),
    };
  }
}
