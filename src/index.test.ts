import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect, vi } from "vitest";

import type { CommandInfo, CommandRegistry, RegisteredCommand } from "./domain/command-registry-port";
import { configError } from "./domain/errors";
import { checkAndDisplayHelp, createMainCommand, handleProgramError } from "./index";

const makeRegistry = (commandInfos: ReadonlyArray<CommandInfo>): CommandRegistry => ({
  register: () => Effect.void,
  getByName: (name) => Effect.succeed(commandInfos.find((commandInfo) => commandInfo.name === name)),
  getCommands: () => Effect.succeed(commandInfos.map((commandInfo) => commandInfo.command)),
});

const makeCommandInfo = (name: string, displayHelp?: () => Effect.Effect<void, never, never>): CommandInfo => ({
  name,
  command: Command.make(name, {}, () => Effect.void) as RegisteredCommand,
  displayHelp: displayHelp ?? (() => Effect.void),
});

describe("index", () => {
  it.effect("checkAndDisplayHelp renders command help when a known command is requested", () =>
    Effect.gen(function* () {
      const displayHelp = vi.fn(() => Effect.void);
      const registry = makeRegistry([makeCommandInfo("clone", displayHelp)]);

      const displayed = yield* checkAndDisplayHelp(["clone", "--help"], registry);

      expect(displayed).toBe(true);
      expect(displayHelp).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("checkAndDisplayHelp renders main help for unknown command help requests", () =>
    Effect.gen(function* () {
      const registry = makeRegistry([makeCommandInfo("clone")]);

      const displayed = yield* checkAndDisplayHelp(["unknown", "--help"], registry);

      expect(displayed).toBe(true);
    }),
  );

  it.effect("checkAndDisplayHelp returns false when help flags are absent", () =>
    Effect.gen(function* () {
      const registry = makeRegistry([makeCommandInfo("clone")]);

      const displayed = yield* checkAndDisplayHelp(["clone"], registry);

      expect(displayed).toBe(false);
    }),
  );

  it.effect("createMainCommand succeeds even when no commands are registered", () =>
    Effect.gen(function* () {
      const registry = makeRegistry([]);
      const command = yield* createMainCommand(registry);

      expect(command).toBeDefined();
    }),
  );

  it.effect("createMainCommand succeeds when commands are registered", () =>
    Effect.gen(function* () {
      const registry = makeRegistry([makeCommandInfo("clone"), makeCommandInfo("cd")]);
      const command = yield* createMainCommand(registry);

      expect(command).toBeDefined();
    }),
  );

  it.effect("handleProgramError maps DevError to domain exit code", () =>
    Effect.gen(function* () {
      const code = yield* handleProgramError(configError("invalid config"));
      expect(code).toBe(2);
    }),
  );

  it.effect("handleProgramError maps unknown errors to exit code 1", () =>
    Effect.gen(function* () {
      const code = yield* handleProgramError(new Error("boom"));
      expect(code).toBe(1);
    }),
  );

  it.effect("handleProgramError treats non-domain tagged errors as unknown errors", () =>
    Effect.gen(function* () {
      const code = yield* handleProgramError({ _tag: "InvalidArgument", message: "boom" });
      expect(code).toBe(1);
    }),
  );
});
