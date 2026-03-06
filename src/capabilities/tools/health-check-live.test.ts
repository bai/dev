import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { afterEach, describe, expect, vi } from "vitest";

import { DatabaseMock } from "~/capabilities/persistence/database-mock";
import { Database } from "~/capabilities/persistence/database-port";
import { HealthCheckLiveLayer } from "~/capabilities/tools/health-check-live";
import { HealthCheck, type HealthCheckService, type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { ToolHealthRegistry } from "~/capabilities/tools/tool-health-registry-port";
import type { ToolHealthRegistryService } from "~/capabilities/tools/tool-health-registry-port";
import { configError, healthCheckError } from "~/core/errors";

interface DatabaseCapture {
  readonly database: DatabaseMock;
  readonly insertedRows: Array<Record<string, unknown>>;
  readonly pruneCalls: { count: number };
}

const createDatabaseCapture = (): DatabaseCapture => {
  const insertedRows: Array<Record<string, unknown>> = [];
  const pruneCalls = { count: 0 };

  const fakeDb = {
    transaction: async (
      callback: (tx: { insert: (table: unknown) => { values: (row: Record<string, unknown>) => Promise<void> } }) => Promise<void>,
    ) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: async (row: Record<string, unknown>) => {
            insertedRows.push(row);
          },
        }),
      };
      await callback(tx);
    },
    insert: (_table: unknown) => ({
      values: async (row: Record<string, unknown>) => {
        insertedRows.push(row);
      },
    }),
    delete: (_table: unknown) => ({
      where: async (_condition: unknown) => {
        pruneCalls.count += 1;
      },
    }),
  };

  const database = new DatabaseMock({
    queryDb: fakeDb as never,
    transactionDb: fakeDb as never,
  });

  return {
    database,
    insertedRows,
    pruneCalls,
  };
};

describe("health-check-live", () => {
  const makeHealthCheck = (database: DatabaseMock, toolHealthRegistry: ToolHealthRegistryService): Effect.Effect<HealthCheckService> =>
    Effect.gen(function* () {
      return yield* HealthCheck;
    }).pipe(
      Effect.provide(
        Layer.provide(
          HealthCheckLiveLayer,
          Layer.mergeAll(Layer.succeed(Database, database), Layer.succeed(ToolHealthRegistry, toolHealthRegistry)),
        ),
      ),
    );

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect("stores health check results and prunes stale entries", () =>
    Effect.gen(function* () {
      const databaseCapture = createDatabaseCapture();
      const firstHealthCheckId = "0196ed78-467a-7f2f-bf6b-95e73fd43b91";
      const secondHealthCheckId = "0196ed78-467a-7f2f-bf6b-95e73fd43b92";
      const randomUuidSpy = vi
        .spyOn(Bun, "randomUUIDv7")
        .mockImplementationOnce(() => firstHealthCheckId as unknown as ReturnType<typeof Bun.randomUUIDv7>)
        .mockImplementationOnce(() => secondHealthCheckId as unknown as ReturnType<typeof Bun.randomUUIDv7>);
      const results: readonly HealthCheckResult[] = [
        {
          toolName: "git",
          version: "2.60.1",
          status: "ok",
          notes: "healthy",
          checkedAt: new Date(),
        },
        {
          toolName: "bun",
          version: "1.3.8",
          status: "warning",
          notes: "upgrade recommended",
          checkedAt: new Date(),
        },
      ];

      const toolHealthRegistry: ToolHealthRegistryService = {
        checkAllTools: () => Effect.succeed(results),
        checkTool: () => healthCheckError("not used in this test"),
        getRegisteredTools: () => Effect.succeed(["git", "bun"]),
      };

      const healthCheck = yield* makeHealthCheck(databaseCapture.database, toolHealthRegistry);
      const returnedResults = yield* healthCheck.runHealthChecks();

      expect(returnedResults).toEqual(results);
      expect(databaseCapture.insertedRows).toHaveLength(2);
      expect(databaseCapture.insertedRows[0]?.tool_name).toBe("git");
      expect(databaseCapture.insertedRows[1]?.tool_name).toBe("bun");
      expect(databaseCapture.insertedRows[0]?.id).toBe(firstHealthCheckId);
      expect(databaseCapture.insertedRows[1]?.id).toBe(secondHealthCheckId);
      expect(databaseCapture.pruneCalls.count).toBe(1);
      expect(randomUuidSpy).toHaveBeenCalledTimes(2);
    }),
  );

  it.effect("uses Database.transaction instead of raw drizzle transaction", () =>
    Effect.gen(function* () {
      const insertedRows: Array<Record<string, unknown>> = [];
      let rawDrizzleTransactionCalls = 0;

      const fakeDb = {
        transaction: async (
          callback: (tx: { insert: (table: unknown) => { values: (row: Record<string, unknown>) => Promise<void> } }) => Promise<void>,
        ) => {
          rawDrizzleTransactionCalls += 1;
          const tx = {
            insert: (_table: unknown) => ({
              values: async (row: Record<string, unknown>) => {
                insertedRows.push(row);
              },
            }),
          };
          await callback(tx);
        },
        insert: (_table: unknown) => ({
          values: async (row: Record<string, unknown>) => {
            insertedRows.push(row);
          },
        }),
        delete: (_table: unknown) => ({
          where: async (_condition: unknown) => undefined,
        }),
      };

      const database = new DatabaseMock({
        queryDb: fakeDb as never,
        transactionDb: fakeDb as never,
      });

      const toolHealthRegistry: ToolHealthRegistryService = {
        checkAllTools: () =>
          Effect.succeed([
            {
              toolName: "git",
              status: "ok",
              checkedAt: new Date(),
            } satisfies HealthCheckResult,
          ]),
        checkTool: () => healthCheckError("not used in this test"),
        getRegisteredTools: () => Effect.succeed(["git"]),
      };

      const healthCheck = yield* makeHealthCheck(database, toolHealthRegistry);
      yield* healthCheck.runHealthChecks();

      expect(database.transactionCalls).toBe(1);
      expect(rawDrizzleTransactionCalls).toBe(0);
      expect(insertedRows).toHaveLength(1);
    }),
  );

  it.effect("maps database-level failures to HealthCheckError", () =>
    Effect.gen(function* () {
      const failingDatabase = new DatabaseMock({
        queryDb: {} as never,
        overrides: {
          transaction: () => configError("database unavailable"),
        },
      });

      const toolHealthRegistry: ToolHealthRegistryService = {
        checkAllTools: () =>
          Effect.succeed([
            {
              toolName: "git",
              status: "ok",
              checkedAt: new Date(),
            } satisfies HealthCheckResult,
          ]),
        checkTool: () => healthCheckError("not used in this test"),
        getRegisteredTools: () => Effect.succeed(["git"]),
      };

      const healthCheck = yield* makeHealthCheck(failingDatabase, toolHealthRegistry);
      const result = yield* Effect.exit(healthCheck.runHealthChecks());

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          const error = failure.value as { readonly _tag: string; readonly message: string };
          expect(error._tag).toBe("HealthCheckError");
          expect(error.message).toContain("Database operation failed");
        }
      }
    }),
  );

  it.effect("propagates health-check service failures", () =>
    Effect.gen(function* () {
      const databaseCapture = createDatabaseCapture();

      const toolHealthRegistry: ToolHealthRegistryService = {
        checkAllTools: () => healthCheckError("tool registry unavailable"),
        checkTool: () => healthCheckError("not used in this test"),
        getRegisteredTools: () => Effect.succeed([]),
      };

      const healthCheck = yield* makeHealthCheck(databaseCapture.database, toolHealthRegistry);
      const result = yield* Effect.exit(healthCheck.runHealthChecks());

      expect(Exit.isFailure(result)).toBe(true);
      expect(databaseCapture.insertedRows).toHaveLength(0);
      expect(databaseCapture.pruneCalls.count).toBe(0);
    }),
  );
});
