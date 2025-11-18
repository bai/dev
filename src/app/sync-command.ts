import path from "path";

import { Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag } from "../domain/command-registry-port";
import { DirectoryTag } from "../domain/directory-port";
import { GitTag } from "../domain/git-port";
import { PathServiceTag } from "../domain/path-service";

/**
 * Display help for the sync command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Update all repositories in your workspace\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev sync\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev sync                   # Pull changes for all repositories\n");
  });

/**
 * Sync command implementation
 */
export const syncCommand = Command.make("sync", {}, () =>
  Effect.gen(function* () {
    const directoryService = yield* DirectoryTag;
    const git = yield* GitTag;
    const pathService = yield* PathServiceTag;

    yield* Effect.logInfo("Scanning for repositories...");

    // Find all directories
    const directories = yield* directoryService.findDirs().pipe(Effect.withSpan("sync.find_dirs"));

    if (directories.length === 0) {
      yield* Effect.logInfo("No repositories found to sync.");
      return;
    }

    yield* Effect.logInfo(`Found ${directories.length} repositories. Starting sync...`);

    let successCount = 0;
    let failureCount = 0;

    // Process repositories in parallel with limited concurrency
    yield* Effect.forEach(
      directories,
      (dir) =>
        Effect.gen(function* () {
          const absolutePath = path.join(pathService.baseSearchPath, dir);

          yield* Effect.logDebug(`Checking ${dir}...`);

          // Verify it's a git repository
          const isGit = yield* git.isGitRepository(absolutePath).pipe(Effect.catchAll(() => Effect.succeed(false)));

          if (!isGit) {
            yield* Effect.logDebug(`Skipping ${dir} (not a git repository)`);
            return;
          }

          // Pull changes
          yield* git.pullLatestChanges(absolutePath).pipe(
            Effect.tap(() => {
              successCount++;
              return Effect.logInfo(`✅ Synced ${dir}`);
            }),
            Effect.catchAll((error) => {
              failureCount++;
              return Effect.logError(`❌ Failed to sync ${dir}: ${error.message || "Unknown error"}`);
            }),
          );
        }).pipe(Effect.withSpan("sync.repo", { attributes: { repo: dir } })),
      { concurrency: 5 }, // reasonable concurrency limit
    ).pipe(Effect.withSpan("sync.process_all"));

    yield* Effect.logInfo("\nSync complete!");
    yield* Effect.logInfo(`Success: ${successCount}`);
    if (failureCount > 0) {
      yield* Effect.logInfo(`Failed: ${failureCount}`);
    }
  }).pipe(Effect.withSpan("sync.execute")),
);

/**
 * Register the sync command with the command registry
 */
export const registerSyncCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "sync",
    command: syncCommand as Command.Command<string, never, any, any>,
    displayHelp,
  });
});
