import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { describe, expect } from "vitest";

import { DirectoryTag, type Directory } from "../domain/directory-port";
import { InteractiveSelectorTag, type InteractiveSelector } from "../domain/interactive-selector-port";
import { handleDirectCd, handleInteractiveCd } from "./cd-command";
import { ShellIntegrationTag, type ShellIntegration } from "./shell-integration-service";

describe("cd-command", () => {
  // Mock implementations
  class MockDirectoryService implements Directory {
    constructor(private readonly directories: readonly string[]) {}

    ensureBaseDirectoryExists(): Effect.Effect<void, never, never> {
      return Effect.void;
    }

    findDirs(): Effect.Effect<string[], never, never> {
      return Effect.succeed([...this.directories]);
    }
  }

  class MockInteractiveSelector implements InteractiveSelector {
    constructor(private readonly selectedPath: string | null) {}

    selectFromList(_items: readonly string[]): Effect.Effect<string | null, never, never> {
      return Effect.succeed(this.selectedPath);
    }
  }

  class MockShellIntegration implements ShellIntegration {
    public changedDirectories: string[] = [];

    changeDirectory(path: string): Effect.Effect<void, never, never> {
      this.changedDirectories.push(path);
      return Effect.void;
    }
  }

  describe("handleDirectCd", () => {
    it.effect("changes to exact matching directory", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src", "docs", "tests"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("docs").pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["docs"]);
      }),
    );

    it.effect("uses fuzzy matching to find directory", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src/domain", "src/infra", "src/app"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("infra").pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["src/infra"]);
      }),
    );

    it.effect("fails when folder name is empty", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src", "docs"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const result = yield* Effect.exit(handleDirectCd("").pipe(Effect.provide(testLayer)));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          expect(result.cause._tag).toBe("Fail");
        }
        expect(shellIntegration.changedDirectories).toEqual([]);
      }),
    );

    it.effect("fails when no matching directory found", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src", "docs"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const result = yield* Effect.exit(handleDirectCd("nonexistent").pipe(Effect.provide(testLayer)));

        expect(Exit.isFailure(result)).toBe(true);
        expect(shellIntegration.changedDirectories).toEqual([]);
      }),
    );

    it.effect("handles empty directory list", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService([])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const result = yield* Effect.exit(handleDirectCd("anything").pipe(Effect.provide(testLayer)));

        expect(Exit.isFailure(result)).toBe(true);
        expect(shellIntegration.changedDirectories).toEqual([]);
      }),
    );

    it.effect("handles directory names with spaces", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["my documents", "project files", "test data"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("documents").pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["my documents"]);
      }),
    );

    it.effect("handles special characters in directory names", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src@2.0", "docs#draft", "test_data"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("src").pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["src@2.0"]);
      }),
    );

    it.effect("matches partial directory names", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(
            DirectoryTag,
            new MockDirectoryService(["infrastructure", "infrastructure-as-code", "infra-scripts"]),
          ),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("infra").pipe(Effect.provide(testLayer));

        // The fuzzy matching algorithm selects "infra-scripts" as the best match
        expect(shellIntegration.changedDirectories).toEqual(["infra-scripts"]);
      }),
    );
  });

  describe("handleInteractiveCd", () => {
    it.effect("changes to selected directory", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src", "docs", "tests"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector("docs")),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleInteractiveCd().pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["docs"]);
      }),
    );

    it.effect("handles cancelled selection", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["src", "docs", "tests"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleInteractiveCd().pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual([]);
      }),
    );

    it.effect("handles empty directory list gracefully", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService([])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleInteractiveCd().pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual([]);
      }),
    );

    it.effect("presents all available directories to selector", () =>
      Effect.gen(function* () {
        let presentedItems: readonly string[] = [];

        class CapturingSelector implements InteractiveSelector {
          selectFromList(items: readonly string[]): Effect.Effect<string | null, never, never> {
            presentedItems = items;
            return Effect.succeed("src");
          }
        }

        const shellIntegration = new MockShellIntegration();
        const directories = ["src", "docs", "tests", "node_modules"];

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(directories)),
          Layer.succeed(InteractiveSelectorTag, new CapturingSelector()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleInteractiveCd().pipe(Effect.provide(testLayer));

        expect(presentedItems).toEqual(directories);
        expect(shellIntegration.changedDirectories).toEqual(["src"]);
      }),
    );
  });

  describe("integration scenarios", () => {
    it.effect("handles deeply nested paths", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(
            DirectoryTag,
            new MockDirectoryService([
              "src/app/commands",
              "src/domain/models",
              "src/infra/adapters",
              "tests/unit/app",
              "tests/integration/infra",
            ]),
          ),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("adapters").pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["src/infra/adapters"]);
      }),
    );

    it.effect("prefers exact matches over fuzzy matches", () =>
      Effect.gen(function* () {
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(DirectoryTag, new MockDirectoryService(["test", "tests", "testing", "test-utils"])),
          Layer.succeed(InteractiveSelectorTag, new MockInteractiveSelector(null)),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        yield* handleDirectCd("test").pipe(Effect.provide(testLayer));

        expect(shellIntegration.changedDirectories).toEqual(["test"]);
      }),
    );
  });
});
