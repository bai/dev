import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, describe, expect, vi } from "vitest";

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("record", () => {
    it.effect("uses runtime-generated uuid for inserted run id", () =>
      Effect.gen(function* () {
        const insertedRows: Array<Record<string, unknown>> = [];
        const expectedRunId = "0196ed78-467a-7f2f-bf6b-95e73fd43b90";
        const randomUuidSpy = vi
          .spyOn(Bun, "randomUUIDv7")
          .mockImplementation(() => expectedRunId as unknown as ReturnType<typeof Bun.randomUUIDv7>);

        const database: Database = {
          query: (fn) =>
            fn({
              insert: (_table: unknown) => ({
                values: (row: Record<string, unknown>) => {
                  insertedRows.push(row);
                  return {
                    returning: async () => [{ id: row.id as string }],
                  };
                },
              }),
            } as never),
          transaction: (fn) => fn({} as never),
          raw: () => Effect.die("raw database not implemented in test"),
          migrate: () => Effect.void,
        };

        const runStore = makeRunStoreLive(database);
        const recordedRunId = yield* runStore.record({
          cliVersion: "1.2.3",
          commandName: "status",
          arguments: "--json",
          cwd: "/tmp/dev",
          startedAt: new Date("2026-01-01T10:00:00.000Z"),
          finishedAt: new Date("2026-01-01T10:00:01.000Z"),
          exitCode: 0,
        });

        expect(recordedRunId).toBe(expectedRunId);
        expect(insertedRows).toHaveLength(1);
        expect(insertedRows[0]?.id).toBe(expectedRunId);
        expect(insertedRows[0]?.cli_version).toBe("1.2.3");
        expect(insertedRows[0]?.command_name).toBe("status");
        expect(insertedRows[0]?.arguments).toBe("--json");
        expect(insertedRows[0]?.cwd).toBe("/tmp/dev");
        expect(insertedRows[0]?.started_at).toEqual(new Date("2026-01-01T10:00:00.000Z"));
        expect(insertedRows[0]?.finished_at).toEqual(new Date("2026-01-01T10:00:01.000Z"));
        expect(insertedRows[0]?.exit_code).toBe(0);
        expect(randomUuidSpy).toHaveBeenCalledTimes(1);
      }),
    );
  });

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

        expect(recentRuns[0]?.exitCode).toBe(0);
        expect(recentRuns[0]?.durationMs).toBe(0);
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
        expect(recentRuns[0]?.exitCode).toBeUndefined();
        expect(recentRuns[0]?.durationMs).toBeUndefined();
      }),
    );
  });
});
