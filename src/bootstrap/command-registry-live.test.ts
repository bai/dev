import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { CommandRegistryLiveLayer } from "~/bootstrap/command-registry-live";
import type { CommandInfo } from "~/bootstrap/command-registry-port";
import { CommandRegistry } from "~/bootstrap/command-registry-port";

const makeCommandInfo = (name: string): CommandInfo => ({
  name,
  command: Command.make(name, {}, () => Effect.void),
  displayHelp: () => Effect.void,
});

describe("command-registry-live", () => {
  it.effect("registers commands and preserves insertion order", () =>
    Effect.gen(function* () {
      const alpha = makeCommandInfo("alpha");
      const beta = makeCommandInfo("beta");
      const registry = yield* CommandRegistry;
      yield* registry.register(alpha);
      yield* registry.register(beta);
      const commands = yield* registry.getCommands();

      expect(commands).toEqual([alpha.command, beta.command]);
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );

  it.effect("returns command by name and undefined for missing command", () =>
    Effect.gen(function* () {
      const alpha = makeCommandInfo("alpha");
      const registry = yield* CommandRegistry;
      yield* registry.register(alpha);
      const found = yield* registry.getByName("alpha");
      const missing = yield* registry.getByName("missing");
      expect(found?.name).toBe("alpha");
      expect(missing).toBeUndefined();
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );

  it.effect("projects registered commands", () =>
    Effect.gen(function* () {
      const alpha = makeCommandInfo("alpha");
      const beta = makeCommandInfo("beta");
      const registry = yield* CommandRegistry;
      yield* registry.register(alpha);
      yield* registry.register(beta);
      const commands = yield* registry.getCommands();
      expect(commands).toEqual([alpha.command, beta.command]);
    }).pipe(Effect.provide(CommandRegistryLiveLayer)),
  );
});
