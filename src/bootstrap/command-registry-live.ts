import { Effect, Layer, Ref } from "effect";

import { CommandRegistryTag, type CommandInfo, type CommandRegistry } from "~/bootstrap/command-registry-port";

/**
 * Create an in-memory command registry
 */
const makeCommandRegistry = (commandsRef: Ref.Ref<ReadonlyArray<CommandInfo>>): CommandRegistry => ({
  register: (info) => Ref.update(commandsRef, (commands) => [...commands, info]),

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
});

export const CommandRegistryLiveLayer = Layer.effect(
  CommandRegistryTag,
  Effect.gen(function* () {
    const commandsRef = yield* Ref.make<ReadonlyArray<CommandInfo>>([]);
    return makeCommandRegistry(commandsRef);
  }),
);
