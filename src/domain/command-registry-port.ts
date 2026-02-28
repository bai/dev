import type { Command } from "@effect/cli";
import { Context, type Effect } from "effect";

export type RegisteredCommand = Command.Command<string, unknown, unknown, unknown>;

export interface CommandInfo {
  readonly name: string;
  readonly command: RegisteredCommand;
  readonly displayHelp: () => Effect.Effect<void, never, never>;
}

export interface CommandRegistry {
  register(info: CommandInfo): Effect.Effect<void, never, never>;
  getAll(): Effect.Effect<ReadonlyArray<CommandInfo>, never, never>;
  getByName(name: string): Effect.Effect<CommandInfo | undefined, never, never>;
  getCommands(): Effect.Effect<ReadonlyArray<RegisteredCommand>, never, never>;
  getHelpHandlers(): Effect.Effect<Record<string, () => Effect.Effect<void, never, never>>, never, never>;
}

export class CommandRegistryTag extends Context.Tag("CommandRegistry")<CommandRegistryTag, CommandRegistry>() {}
