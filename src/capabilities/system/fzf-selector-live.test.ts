import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { afterEach, describe, expect } from "vitest";

import { makeFzfSelector } from "~/capabilities/system/fzf-selector-live";
import { UnknownError } from "~/core/errors";

const toStream = (text: string): ReadableStream<Uint8Array> => new Blob([text]).stream();

const createSubprocess = (config: {
  exitCode: number;
  stdout?: string;
  stdin?: {
    write: (value: string) => unknown;
    end: () => unknown;
  };
}): ReturnType<typeof Bun.spawn> =>
  ({
    stdin: config.stdin ?? null,
    stdout: config.stdout === undefined ? null : toStream(config.stdout),
    stderr: toStream(""),
    exited: Promise.resolve(config.exitCode),
  }) as unknown as ReturnType<typeof Bun.spawn>;

describe("fzf-selector-live", () => {
  const bunGlobal = Bun as unknown as { spawn: typeof Bun.spawn };
  const originalSpawn = bunGlobal.spawn;

  afterEach(() => {
    bunGlobal.spawn = originalSpawn;
  });

  it.effect("returns selected value from fzf output", () =>
    Effect.gen(function* () {
      let stdinPayload = "";

      bunGlobal.spawn = (() =>
        createSubprocess({
          exitCode: 0,
          stdout: "beta\n",
          stdin: {
            write: (value: string) => {
              stdinPayload = value;
            },
            end: () => undefined,
          },
        })) as typeof Bun.spawn;

      const selector = makeFzfSelector();
      const selected = yield* selector.selectFromList(["alpha", "beta"]);

      expect(selected).toBe("beta");
      expect(stdinPayload).toBe("alpha\nbeta\n");
    }),
  );

  it.effect("returns null when fzf exits with cancellation code", () =>
    Effect.gen(function* () {
      bunGlobal.spawn = (() =>
        createSubprocess({
          exitCode: 130,
          stdout: "",
          stdin: {
            write: () => undefined,
            end: () => undefined,
          },
        })) as typeof Bun.spawn;

      const selector = makeFzfSelector();
      const selected = yield* selector.selectFromList(["alpha", "beta"]);

      expect(selected).toBeNull();
    }),
  );

  it.effect("maps stdin write failures to UnknownError", () =>
    Effect.gen(function* () {
      bunGlobal.spawn = (() =>
        createSubprocess({
          exitCode: 0,
          stdout: "alpha\n",
          stdin: {
            write: () => {
              throw new Error("stdin broken");
            },
            end: () => undefined,
          },
        })) as typeof Bun.spawn;

      const selector = makeFzfSelector();
      const result = yield* Effect.exit(selector.selectFromList(["alpha"]));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value).toBeInstanceOf(UnknownError);
        }
      }
    }),
  );
});
