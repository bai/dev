import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { FileSystemTag } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import { makeFileSystemLive } from "../infra/file-system-live";
import { ensureCorrectConfigUrl } from "./upgrade-command";

describe("upgrade-command", () => {
  describe("ensureCorrectConfigUrl", () => {
    it.effect("parses JSONC in project and local config files", () =>
      Effect.gen(function* () {
        const tempDir = path.join(os.tmpdir(), `upgrade-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));

        const devDir = path.join(tempDir, ".dev");
        const configDir = path.join(tempDir, ".config", "dev");
        const configPath = path.join(configDir, "config.json");

        yield* Effect.promise(() => fs.mkdir(devDir, { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(configDir, { recursive: true }));

        const projectConfigWithComments = `{
  // Source of truth remote config
  "configUrl": "https://example.com/remote-config.json",
  "defaultOrg": "acme",
}`;
        const localConfigWithComments = `{
  // Outdated local URL that should be replaced
  "configUrl": "https://example.com/old-config.json",
  "defaultOrg": "acme",
}`;

        yield* Effect.promise(() => fs.writeFile(path.join(devDir, "config.json"), projectConfigWithComments));
        yield* Effect.promise(() => fs.writeFile(configPath, localConfigWithComments));

        const pathService: PathService = {
          homeDir: tempDir,
          baseSearchPath: path.join(tempDir, "src"),
          devDir,
          configDir,
          configPath,
          dataDir: path.join(tempDir, ".local", "share", "dev"),
          dbPath: path.join(tempDir, ".local", "share", "dev", "dev.db"),
          cacheDir: path.join(tempDir, ".cache", "dev"),
          getBasePath: () => path.join(tempDir, "src"),
        };

        const fileSystem = makeFileSystemLive();
        const fileSystemLayer = Layer.succeed(FileSystemTag, fileSystem);

        yield* ensureCorrectConfigUrl(pathService).pipe(Effect.provide(fileSystemLayer));

        const updatedLocalConfigContent = yield* Effect.promise(() => fs.readFile(configPath, "utf8"));
        const updatedLocalConfig = JSON.parse(updatedLocalConfigContent) as { configUrl: string };

        expect(updatedLocalConfig.configUrl).toBe("https://example.com/remote-config.json");

        yield* Effect.promise(() => fs.rm(tempDir, { recursive: true, force: true }));
      }),
    );
  });
});
