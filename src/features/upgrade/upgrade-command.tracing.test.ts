import { NodeSdk } from "@effect/opentelemetry";
import { it } from "@effect/vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect, Ref } from "effect";
import { describe, expect } from "vitest";

import type { ToolManager } from "~/capabilities/tools/tool-management-port";
import { checkTool } from "~/features/upgrade/upgrade-command";

const createTelemetryLayer = (exporter: InMemorySpanExporter) =>
  NodeSdk.layer(() => ({
    spanProcessor: new SimpleSpanProcessor(exporter),
    resource: {
      serviceName: "test-upgrade",
    },
  }));

const makeToolManager = (
  checkVersionResult: { readonly isValid: boolean; readonly currentVersion: string | null },
  onEnsureVersionOrUpgrade: () => Effect.Effect<void, never, never>,
): ToolManager => ({
  getCurrentVersion: () => Effect.succeed(checkVersionResult.currentVersion),
  checkVersion: () => Effect.succeed(checkVersionResult),
  performUpgrade: () => Effect.succeed(true),
  ensureVersionOrUpgrade: onEnsureVersionOrUpgrade,
});

describe("upgrade-command tracing", () => {
  it.effect("checkTool emits stable tools.check_version span name", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);

    return Effect.gen(function* () {
      const ensureVersionCalls = yield* Ref.make(0);
      const toolManager = makeToolManager(
        {
          isValid: true,
          currentVersion: "1.2.3",
        },
        () => Ref.update(ensureVersionCalls, (count) => count + 1),
      );

      yield* checkTool("Bun", toolManager).pipe(Effect.withSpan("tools.upgrade_one"));

      const spans = exporter.getFinishedSpans();
      const spanNames = spans.map((span) => span.name);
      const dynamicSpanNames = spanNames.filter((spanName) => /^tools\.check_.+_version$/.test(spanName));
      const checkVersionSpan = spans.find((span) => span.name === "tools.check_version");
      const toolSpan = spans.find((span) => span.name === "tools.upgrade_one");

      expect(checkVersionSpan).toBeDefined();
      expect(dynamicSpanNames).toHaveLength(0);
      expect(toolSpan?.attributes["tool.name"]).toBe("Bun");
      expect(toolSpan?.attributes["tool.version.valid"]).toBe("true");
      expect(toolSpan?.attributes["tool.version.current"]).toBe("1.2.3");
      expect(yield* Ref.get(ensureVersionCalls)).toBe(0);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });
});
