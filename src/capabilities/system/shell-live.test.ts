import { NodeSdk } from "@effect/opentelemetry";
import { it } from "@effect/vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { ShellTag } from "~/capabilities/system/shell-port";

describe("shell-live", () => {
  it.effect("exec emits shell.exec span with stable attributes", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = NodeSdk.layer(() => ({
      spanProcessor: new SimpleSpanProcessor(exporter),
      resource: {
        serviceName: "test-shell",
      },
    }));

    return Effect.gen(function* () {
      const shell = yield* ShellTag;
      const cwd = process.cwd();
      const result = yield* shell.exec("bun", ["--version"], { cwd });

      expect(result.exitCode).toBe(0);

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "shell.exec");
      expect(span).toBeDefined();
      expect(span?.attributes["shell.command"]).toBe("bun");
      expect(span?.attributes["shell.args.count"]).toBe(1);
      expect(span?.attributes["shell.cwd"]).toBe(cwd);
      expect(span?.attributes["shell.exit_code"]).toBe(0);
    }).pipe(Effect.provide(ShellLiveLayer), Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("execInteractive emits shell.exec_interactive span with stable attributes", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = NodeSdk.layer(() => ({
      spanProcessor: new SimpleSpanProcessor(exporter),
      resource: {
        serviceName: "test-shell",
      },
    }));

    return Effect.gen(function* () {
      const shell = yield* ShellTag;
      const exitCode = yield* shell.execInteractive("bun", ["-e", "process.exit(0)"]);

      expect(exitCode).toBe(0);

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "shell.exec_interactive");
      expect(span).toBeDefined();
      expect(span?.attributes["shell.command"]).toBe("bun");
      expect(span?.attributes["shell.args.count"]).toBe(2);
      expect(span?.attributes["shell.exit_code"]).toBe(0);
    }).pipe(Effect.provide(ShellLiveLayer), Effect.provide(telemetryLayer), Effect.scoped);
  });
});
