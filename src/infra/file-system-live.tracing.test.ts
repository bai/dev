import fs from "fs/promises";
import os from "os";
import path from "path";

import { NodeSdk } from "@effect/opentelemetry";
import { it } from "@effect/vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_FILE_PATH } from "@opentelemetry/semantic-conventions/incubating";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect } from "vitest";

import { makeFileSystemLive } from "./file-system-live";

const createTelemetryLayer = (exporter: InMemorySpanExporter) =>
  NodeSdk.layer(() => ({
    spanProcessor: new SimpleSpanProcessor(exporter),
    resource: {
      serviceName: "test-file-system",
    },
  }));

describe("file-system-live", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `fs-tracing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.effect("readFile emits file.path span attribute", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);

    return Effect.gen(function* () {
      const fileSystem = makeFileSystemLive();
      const filePath = path.join(tempDir, "read-target.txt");
      yield* Effect.promise(() => fs.writeFile(filePath, "payload"));

      const result = yield* fileSystem.readFile(filePath);
      expect(result).toBe("payload");

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "fs.read_file");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_FILE_PATH]).toBe(filePath);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("writeFile emits file.path span attribute", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);

    return Effect.gen(function* () {
      const fileSystem = makeFileSystemLive();
      const filePath = path.join(tempDir, "write-target.txt");
      yield* fileSystem.writeFile(filePath, "payload");

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "fs.write_file");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_FILE_PATH]).toBe(filePath);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("exists emits file.path span attribute", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);

    return Effect.gen(function* () {
      const fileSystem = makeFileSystemLive();
      const filePath = path.join(tempDir, "exists-target.txt");
      yield* fileSystem.exists(filePath);

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "fs.exists");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_FILE_PATH]).toBe(filePath);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });
});
