import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect, vi } from "vitest";

import { makeHealthCheckService } from "./health-check-service";
import type { HealthCheckResult } from "./health-check-port";
import type { ToolHealthRegistry } from "./tool-health-registry-port";

describe("health-check-service", () => {
  it.effect("delegates runAllHealthChecks to ToolHealthRegistry.checkAllTools", () =>
    Effect.gen(function* () {
      const bunResult: HealthCheckResult = {
        toolName: "bun",
        status: "ok",
        checkedAt: new Date(),
      };
      const expectedResults: readonly HealthCheckResult[] = [bunResult];

      const toolHealthRegistry: ToolHealthRegistry = {
        getRegisteredTools: vi.fn(() => Effect.succeed(["bun"])),
        checkTool: vi.fn((_toolName) => Effect.succeed(bunResult)),
        checkAllTools: vi.fn(() => Effect.succeed(expectedResults)),
      };

      const service = makeHealthCheckService(toolHealthRegistry);
      const results = yield* service.runAllHealthChecks();

      expect(results).toEqual(expectedResults);
      expect(toolHealthRegistry.checkAllTools).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("delegates getRegisteredTools to ToolHealthRegistry.getRegisteredTools", () =>
    Effect.gen(function* () {
      const expectedTools = ["bun", "git", "mise"] as const;
      const bunResult: HealthCheckResult = {
        toolName: "bun",
        status: "ok",
        checkedAt: new Date(),
      };

      const toolHealthRegistry: ToolHealthRegistry = {
        getRegisteredTools: vi.fn(() => Effect.succeed(expectedTools)),
        checkTool: vi.fn((_toolName) => Effect.succeed(bunResult)),
        checkAllTools: vi.fn(() => Effect.succeed([])),
      };

      const service = makeHealthCheckService(toolHealthRegistry);
      const tools = yield* service.getRegisteredTools();

      expect(tools).toEqual(expectedTools);
      expect(toolHealthRegistry.getRegisteredTools).toHaveBeenCalledTimes(1);
    }),
  );
});
