import { Command } from "commander";
import { Effect, Layer, Runtime } from "effect";

import { AppLiveLayer } from "../../app/wiring";
import { exitCode, type DevError } from "../../domain/errors";
import { LoggerService, type CliCommandSpec, type CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { ShellService } from "../../domain/ports/Shell";
import type { CliAdapter } from "./types";

export class CommanderAdapter implements CliAdapter {
  private program: Command;
  private commands: CliCommandSpec[];
  private runtime: Runtime.Runtime<never>;

  constructor(commands: CliCommandSpec[]) {
    this.program = new Command();
    this.commands = commands;
    this.program.exitOverride(); // Convert Commander failures into typed errors

    // Create runtime with app layers
    this.runtime = Runtime.defaultRuntime;
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
    // Initialize with available commands
    this.initialize(this.commands);
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

      // Parse arguments
      const parsedArgs = this.parseArguments(commandSpec, commandArgs);

      // FIXME: Command tracking and service resolution
      // Current issue: CommandTrackingService integration requires resolving
      // Effect Context service dependencies that are not being properly satisfied
      // by AppLiveLayer. The services (FileSystemService, ShellService, NetworkService)
      // are included in the layer but Effect Context resolution is failing.
      //
      // This may require:
      // 1. Reviewing layer composition in app/wiring.ts
      // 2. Ensuring all service tags are properly exported and imported
      // 3. Investigating Effect Context resolution patterns
      // 4. Consider alternative tracking approaches (interceptors, middleware)

      // Create and execute the main command program
      const program = Effect.gen(function* () {
        // Get services from the Effect Context
        const logger = yield* LoggerService;
        const fileSystem = yield* FileSystemService;
        const shell = yield* ShellService;

        // Create enhanced context with services
        const context: CommandContext = {
          args: parsedArgs,
          options: commanderCommand.opts(),
        };

        // Execute the command (with service dependency workaround)
        // This type assertion bypasses the service resolution issue
        // TODO: Fix service dependency resolution properly
        yield* commandSpec.exec(context) as Effect.Effect<void, DevError, never>;
      }).pipe(Effect.provide(AppLiveLayer));

      // Run with runtime
      const exit = await Runtime.runPromiseExit(this.runtime)(program);

      if (exit._tag === "Failure") {
        // Check if it's a DevError for proper exit code
        const cause = exit.cause;
        if (cause._tag === "Fail" && cause.error && typeof cause.error === "object" && "_tag" in cause.error) {
          const devError = cause.error as DevError;
          console.error(`❌ ${devError._tag}:`, devError);
          process.exitCode = exitCode(devError);
        } else {
          console.error("❌ Command execution failed:", cause);
          process.exitCode = 1;
        }
        throw new Error("Command execution failed");
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
}
