import { Effect } from "effect";

/**
 * Opaque command object stored by the registry.
 * Concrete CLI command types are interpreted at the composition root.
 */
export type RegisteredCommand = unknown;

export interface CommandInfo {
  readonly name: string;
  readonly command: RegisteredCommand;
  readonly displayHelp: () => Effect.Effect<void, never, never>;
}

export interface CommandRegistry {
  register(info: CommandInfo): Effect.Effect<void, never, never>;
  getByName(name: string): Effect.Effect<CommandInfo | undefined, never, never>;
  getCommands(): Effect.Effect<ReadonlyArray<RegisteredCommand>, never, never>;
}

export class CommandRegistryTag extends Effect.Tag("CommandRegistry")<CommandRegistryTag, CommandRegistry>() {}
