import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect } from "vitest";

import type { Database } from "../domain/database-port";
import { configError, healthCheckError } from "../domain/errors";
import type { HealthCheckResult } from "../domain/health-check-port";
import type { HealthCheckService } from "../domain/health-check-service";
import { makeHealthCheckLive } from "./health-check-live";

interface DatabaseCapture {
  readonly database: Database;
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
    delete: (_table: unknown) => ({
      where: async (_condition: unknown) => {
        pruneCalls.count += 1;
      },
    }),
  };

  const database: Database = {
    query: (fn) => fn(fakeDb as never),
    transaction: (fn) => fn(fakeDb as never),
    raw: () => Effect.succeed({} as never),
    migrate: () => Effect.void,
  };

  return {
    database,
    insertedRows,
    pruneCalls,
  };
};

describe("health-check-live", () => {
  it.effect("stores health check results and prunes stale entries", () =>
    Effect.gen(function* () {
      const databaseCapture = createDatabaseCapture();
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

      const healthCheckService: HealthCheckService = {
        runAllHealthChecks: () => Effect.succeed(results),
        getRegisteredTools: () => Effect.succeed(["git", "bun"]),
      };

      const healthCheck = makeHealthCheckLive(databaseCapture.database, healthCheckService);
      const returnedResults = yield* healthCheck.runHealthChecks();

      expect(returnedResults).toEqual(results);
      expect(databaseCapture.insertedRows).toHaveLength(2);
      expect(databaseCapture.insertedRows[0]?.tool_name).toBe("git");
      expect(databaseCapture.insertedRows[1]?.tool_name).toBe("bun");
      expect(databaseCapture.pruneCalls.count).toBe(1);
    }),
  );

  it.effect("maps database-level failures to HealthCheckError", () =>
    Effect.gen(function* () {
      const failingDatabase: Database = {
        query: () => configError("database unavailable"),
        transaction: (fn) => fn({} as never),
        raw: () => Effect.succeed({} as never),
        migrate: () => Effect.void,
      };

      const healthCheckService: HealthCheckService = {
        runAllHealthChecks: () =>
          Effect.succeed([
            {
              toolName: "git",
              status: "ok",
              checkedAt: new Date(),
            } satisfies HealthCheckResult,
          ]),
        getRegisteredTools: () => Effect.succeed(["git"]),
      };

      const healthCheck = makeHealthCheckLive(failingDatabase, healthCheckService);
      const result = yield* Effect.exit(healthCheck.runHealthChecks());

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("HealthCheckError");
          expect(String((failure.value as { readonly reason: string }).reason)).toContain("Database operation failed");
        }
      }
    }),
  );

  it.effect("propagates health-check service failures", () =>
    Effect.gen(function* () {
      const databaseCapture = createDatabaseCapture();

      const healthCheckService: HealthCheckService = {
        runAllHealthChecks: () => healthCheckError("tool registry unavailable"),
        getRegisteredTools: () => Effect.succeed([]),
      };

      const healthCheck = makeHealthCheckLive(databaseCapture.database, healthCheckService);
      const result = yield* Effect.exit(healthCheck.runHealthChecks());

      expect(Exit.isFailure(result)).toBe(true);
      expect(databaseCapture.insertedRows).toHaveLength(0);
      expect(databaseCapture.pruneCalls.count).toBe(0);
    }),
  );
});
