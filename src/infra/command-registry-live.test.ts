import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { CommandInfo, RegisteredCommand } from "../domain/command-registry-port";
import { CommandRegistryTag } from "../domain/command-registry-port";
import { CommandRegistryLiveLayer } from "./command-registry-live";

const makeCommandInfo = (name: string): CommandInfo => ({
  name,
  command: Command.make(name, {}, () => Effect.void) as RegisteredCommand,
  displayHelp: () => Effect.void,
});

describe("command-registry-live", () => {
  it.effect("registers commands and preserves insertion order", () =>
    Effect.gen(function* () {
      const alpha = makeCommandInfo("alpha");
      const beta = makeCommandInfo("beta");
      const registry = yield* CommandRegistryTag;
      yield* registry.register(alpha);
      yield* registry.register(beta);
      const allCommands = yield* registry.getAll();

      expect(allCommands.map((command) => command.name)).toEqual(["alpha", "beta"]);
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );

  it.effect("returns command by name and undefined for missing command", () =>
    Effect.gen(function* () {
      const alpha = makeCommandInfo("alpha");
      const registry = yield* CommandRegistryTag;
      yield* registry.register(alpha);
      const found = yield* registry.getByName("alpha");
      const missing = yield* registry.getByName("missing");
      expect(found?.name).toBe("alpha");
      expect(missing).toBeUndefined();
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );

  it.effect("projects registered commands and help handlers", () =>
    Effect.gen(function* () {
      const alpha = makeCommandInfo("alpha");
      const beta = makeCommandInfo("beta");
      const registry = yield* CommandRegistryTag;
      yield* registry.register(alpha);
      yield* registry.register(beta);
      const commands = yield* registry.getCommands();
      const handlers = yield* registry.getHelpHandlers();
      expect(commands).toEqual([alpha.command, beta.command]);
      expect(Object.keys(handlers).sort()).toEqual(["alpha", "beta"]);
      expect(handlers.alpha).toBe(alpha.displayHelp);
      expect(handlers.beta).toBe(beta.displayHelp);
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );
});
