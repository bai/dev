import { type Command } from "@effect/cli";
import { Effect } from "effect";

import type { DevError } from "~/core/errors";

/**
 * CLI commands registered with the application.
 * The registry preserves the shared domain error channel to keep the app boundary typed.
 * Command payload and requirement types remain erased because each command has a different shape.
 */
export type RegisteredCommand = Command.Command<any, any, DevError, any>;

export interface CommandInfo {
  readonly name: string;
  readonly command: RegisteredCommand;
  readonly displayHelp: () => Effect.Effect<void, never, never>;
}

export class CommandRegistryTag extends Effect.Tag("CommandRegistry")<
  CommandRegistryTag,
  {
    register(info: CommandInfo): Effect.Effect<void, never, never>;
    getByName(name: string): Effect.Effect<CommandInfo | undefined, never, never>;
    getCommands(): Effect.Effect<ReadonlyArray<RegisteredCommand>, never, never>;
  }
>() {}

export type CommandRegistry = (typeof CommandRegistryTag)["Service"];
