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

  it.effect("mkdir emits file.path span attribute", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);

    return Effect.gen(function* () {
      const fileSystem = makeFileSystemLive();
      const dirPath = path.join(tempDir, "mkdir-target");
      yield* fileSystem.mkdir(dirPath, true);

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "fs.mkdir");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_FILE_PATH]).toBe(dirPath);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("findDirectoriesGlob emits file.path span attribute", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);

    return Effect.gen(function* () {
      const fileSystem = makeFileSystemLive();
      yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "project-one"), { recursive: true }));
      yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "project-two"), { recursive: true }));

      const result = yield* fileSystem.findDirectoriesGlob(tempDir, "project*");
      expect(result.length).toBeGreaterThan(0);

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "fs.find_directories_glob");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_FILE_PATH]).toBe(tempDir);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });
});
