import { Command, HelpDoc, ValidationError } from "@effect/cli";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect, vi } from "vitest";

import { checkAndDisplayHelp, createMainCommand } from "~/bootstrap/cli-router";
import type { CommandInfo, CommandRegistry } from "~/bootstrap/command-registry-port";
import { configError } from "~/core/errors";
import { handleProgramError } from "~/index";

const makeRegistry = (commandInfos: ReadonlyArray<CommandInfo>): CommandRegistry => ({
  register: () => Effect.void,
  getByName: (name) => Effect.succeed(commandInfos.find((commandInfo) => commandInfo.name === name)),
  getCommands: () => Effect.succeed(commandInfos.map((commandInfo) => commandInfo.command)),
});

const makeCommandInfo = (name: string, displayHelp?: () => Effect.Effect<void, never, never>): CommandInfo => ({
  name,
  command: Command.make(name, {}, () => Effect.void),
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

  it.effect("handleProgramError maps DevError to exit code 1", () =>
    Effect.gen(function* () {
      const code = yield* handleProgramError(configError("invalid config"));
      expect(code).toBe(1);
    }),
  );

  it.effect("handleProgramError maps CLI validation errors to exit code 1", () =>
    Effect.gen(function* () {
      const code = yield* handleProgramError(ValidationError.invalidArgument(HelpDoc.p("boom")));
      expect(code).toBe(1);
    }),
  );
});
