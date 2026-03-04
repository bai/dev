import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect } from "vitest";

import {
  buildMinimumVersionHealthCheck,
  checkVersionAgainstMinimum,
  ensureMinimumVersionOrUpgrade,
} from "./versioned-tools-live";

describe("versioned-tools-live", () => {
  it.effect("checkVersionAgainstMinimum marks missing versions as invalid", () =>
    Effect.gen(function* () {
      const result = yield* checkVersionAgainstMinimum({
        minVersion: "1.2.3",
        getCurrentVersion: () => Effect.succeed(null),
      });

      expect(result).toEqual({ isValid: false, currentVersion: null });
    }),
  );

  it.effect("checkVersionAgainstMinimum marks compliant versions as valid", () =>
    Effect.gen(function* () {
      const result = yield* checkVersionAgainstMinimum({
        minVersion: "1.2.3",
        getCurrentVersion: () => Effect.succeed("1.2.3"),
      });

      expect(result).toEqual({ isValid: true, currentVersion: "1.2.3" });
    }),
  );

  it.effect("ensureMinimumVersionOrUpgrade does not upgrade compliant versions", () =>
    Effect.gen(function* () {
      let upgradeCalls = 0;

      yield* ensureMinimumVersionOrUpgrade({
        toolId: "bun",
        displayName: "Bun",
        minVersion: "1.3.6",
        getCurrentVersion: () => Effect.succeed("1.4.0"),
        performUpgrade: () =>
          Effect.sync(() => {
            upgradeCalls += 1;
            return true;
          }),
      });

      expect(upgradeCalls).toBe(0);
    }),
  );

  it.effect("ensureMinimumVersionOrUpgrade fails when upgrade command fails", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        ensureMinimumVersionOrUpgrade({
          toolId: "git",
          displayName: "Git",
          minVersion: "2.52.0",
          getCurrentVersion: () => Effect.succeed("2.40.0"),
          performUpgrade: () => Effect.succeed(false),
          manualUpgradeHint: "mise install git@latest",
        }),
      );

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("ExternalToolError");
        }
      }
    }),
  );

  it.effect("ensureMinimumVersionOrUpgrade fails when version is still invalid after upgrade", () =>
    Effect.gen(function* () {
      let checkCalls = 0;

      const result = yield* Effect.exit(
        ensureMinimumVersionOrUpgrade({
          toolId: "bun",
          displayName: "Bun",
          minVersion: "1.3.6",
          getCurrentVersion: () =>
            Effect.sync(() => {
              checkCalls += 1;
              return checkCalls === 1 ? "1.0.0" : "1.2.0";
            }),
          performUpgrade: () => Effect.succeed(true),
        }),
      );

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("ExternalToolError");
        }
      }
    }),
  );

  it.effect("ensureMinimumVersionOrUpgrade succeeds when upgrade reaches required version", () =>
    Effect.gen(function* () {
      let checkCalls = 0;

      const result = yield* Effect.exit(
        ensureMinimumVersionOrUpgrade({
          toolId: "fzf",
          displayName: "Fzf",
          minVersion: "0.67.0",
          getCurrentVersion: () =>
            Effect.sync(() => {
              checkCalls += 1;
              return checkCalls === 1 ? "0.60.0" : "0.68.0";
            }),
          performUpgrade: () => Effect.succeed(true),
        }),
      );

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("buildMinimumVersionHealthCheck returns fail when version is missing", () =>
    Effect.gen(function* () {
      const result = yield* buildMinimumVersionHealthCheck({
        toolId: "gcloud",
        displayName: "Gcloud",
        minVersion: "552.0.0",
        getCurrentVersion: () => Effect.succeed(null),
      });

      expect(result.status).toBe("fail");
      expect(result.notes).toContain("not found");
    }),
  );

  it.effect("buildMinimumVersionHealthCheck returns warning when version is below minimum", () =>
    Effect.gen(function* () {
      const result = yield* buildMinimumVersionHealthCheck({
        toolId: "git",
        displayName: "Git",
        minVersion: "2.52.0",
        getCurrentVersion: () => Effect.succeed("2.40.0"),
      });

      expect(result.status).toBe("warning");
      expect(result.notes).toContain("requires >=2.52.0");
    }),
  );

  it.effect("buildMinimumVersionHealthCheck returns ok when version is compliant", () =>
    Effect.gen(function* () {
      const result = yield* buildMinimumVersionHealthCheck({
        toolId: "bun",
        displayName: "Bun",
        minVersion: "1.3.6",
        getCurrentVersion: () => Effect.succeed("1.3.8"),
      });

      expect(result.status).toBe("ok");
      expect(result.version).toBe("1.3.8");
    }),
  );
});
