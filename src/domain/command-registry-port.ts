import type { Command } from "@effect/cli";
import { Context, type Effect } from "effect";

export interface CommandInfo {
  readonly name: string;
  readonly command: Command.Command<string, never, any, any>;
  readonly displayHelp: () => Effect.Effect<void, never, never>;
}

export interface CommandRegistry {
  register(info: CommandInfo): Effect.Effect<void, never, never>;
  getAll(): Effect.Effect<ReadonlyArray<CommandInfo>, never, never>;
  getByName(name: string): Effect.Effect<CommandInfo | undefined, never, never>;
  getCommands(): Effect.Effect<ReadonlyArray<Command.Command<string, never, any, any>>, never, never>;
  getHelpHandlers(): Effect.Effect<Record<string, () => Effect.Effect<void, never, never>>, never, never>;
}

export class CommandRegistryTag extends Context.Tag("CommandRegistry")<CommandRegistryTag, CommandRegistry>() {}
