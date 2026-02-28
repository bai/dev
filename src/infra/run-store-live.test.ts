import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { Database } from "../domain/database-port";
import type { DrizzleDatabase } from "../domain/drizzle-types";
import { makeRunStoreLive } from "./run-store-live";

interface MockRunRow {
  readonly id: string;
  readonly cli_version: string;
  readonly command_name: string;
  readonly arguments: string | null;
  readonly exit_code: number | null;
  readonly cwd: string;
  readonly started_at: Date;
  readonly finished_at: Date | null;
  readonly duration_ms: number | null;
}

const makeMockDrizzleDatabase = (rows: readonly MockRunRow[]): DrizzleDatabase =>
  ({
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  }) as unknown as DrizzleDatabase;

const makeMockDatabase = (rows: readonly MockRunRow[]): Database => {
  const drizzleDatabase = makeMockDrizzleDatabase(rows);

  return {
    query: (fn) => fn(drizzleDatabase),
    transaction: (fn) => fn(drizzleDatabase),
    raw: () => Effect.die("raw database not implemented in test"),
    migrate: () => Effect.void,
  };
};

describe("run-store-live", () => {
  describe("getRecentRuns", () => {
    it.effect("preserves zero exit code and zero duration", () =>
      Effect.gen(function* () {
        const mockRows: readonly MockRunRow[] = [
          {
            id: "run-1",
            cli_version: "abc123",
            command_name: "status",
            arguments: null,
            exit_code: 0,
            cwd: "/tmp/dev",
            started_at: new Date("2026-01-01T10:00:00.000Z"),
            finished_at: new Date("2026-01-01T10:00:00.000Z"),
            duration_ms: 0,
          },
        ];
        const runStore = makeRunStoreLive(makeMockDatabase(mockRows));

        const recentRuns = yield* runStore.getRecentRuns(10);

        expect(recentRuns[0]?.exit_code).toBe(0);
        expect(recentRuns[0]?.duration_ms).toBe(0);
      }),
    );

    it.effect("maps nullable database fields to undefined", () =>
      Effect.gen(function* () {
        const mockRows: readonly MockRunRow[] = [
          {
            id: "run-2",
            cli_version: "abc124",
            command_name: "sync",
            arguments: null,
            exit_code: null,
            cwd: "/tmp/dev",
            started_at: new Date("2026-01-01T10:00:00.000Z"),
            finished_at: null,
            duration_ms: null,
          },
        ];
        const runStore = makeRunStoreLive(makeMockDatabase(mockRows));

        const recentRuns = yield* runStore.getRecentRuns(10);

        expect(recentRuns[0]?.arguments).toBeUndefined();
        expect(recentRuns[0]?.exit_code).toBeUndefined();
        expect(recentRuns[0]?.duration_ms).toBeUndefined();
      }),
    );
  });
});
