import { Effect, Layer, Ref } from "effect";

import { CommandRegistryTag, type CommandInfo, type CommandRegistry } from "../domain/command-registry-port";

/**
 * Create an in-memory command registry
 */
const makeCommandRegistry = (commandsRef: Ref.Ref<ReadonlyArray<CommandInfo>>): CommandRegistry => ({
  register: (info) => Ref.update(commandsRef, (commands) => [...commands, info]),

  getAll: () => Ref.get(commandsRef),

  getByName: (name) =>
    Effect.gen(function* () {
      const commands = yield* Ref.get(commandsRef);
      return commands.find((cmd) => cmd.name === name);
    }),

  getCommands: () =>
    Effect.gen(function* () {
      const commands = yield* Ref.get(commandsRef);
      return commands.map((cmd) => cmd.command);
    }),

  getHelpHandlers: () =>
    Effect.gen(function* () {
      const commands = yield* Ref.get(commandsRef);
      const handlers: Record<string, () => Effect.Effect<void, never, never>> = {};
      for (const cmd of commands) {
        handlers[cmd.name] = cmd.displayHelp;
      }
      return handlers;
    }),
});

export const CommandRegistryLiveLayer = Layer.effect(
  CommandRegistryTag,
  Effect.gen(function* () {
    const commandsRef = yield* Ref.make<ReadonlyArray<CommandInfo>>([]);
    return makeCommandRegistry(commandsRef);
  }),
);
