import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag } from "../domain/command-registry-port";
import { DirectoryTag } from "../domain/directory-port";
import { unknownError, type DevError } from "../domain/errors";
import { InteractiveSelectorTag } from "../domain/interactive-selector-port";
import { filter } from "../domain/matching";
import { ShellIntegrationTag } from "./shell-integration-service";

// Define the folder name argument as optional
const folderName = Args.text({ name: "folder_name" }).pipe(Args.optional);

/**
 * Display help for the cd command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Navigate to directories using fuzzy search capabilities\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev cd [folder_name]\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev cd                     # Interactive directory selection");
    yield* Effect.logInfo("  dev cd myproject           # Direct navigation by name");
    yield* Effect.logInfo("  dev cd ~/Documents         # Navigate to specific path\n");

    yield* Effect.logInfo("ARGUMENTS");
    yield* Effect.logInfo("  folder_name               # Optional directory name or path\n");
  });

// Create the cd command using @effect/cli
export const cdCommand = Command.make("cd", { folderName }, ({ folderName }) =>
  Effect.gen(function* () {
    if (folderName._tag === "Some") {
      yield* Effect.annotateCurrentSpan("operation.type", "direct");
      yield* Effect.annotateCurrentSpan("search.term", folderName.value);
      yield* handleDirectCd(folderName.value);
    } else {
      yield* Effect.annotateCurrentSpan("operation.type", "interactive");
      yield* handleInteractiveCd();
    }
  }).pipe(Effect.withSpan("cd.execute")),
);

export function handleDirectCd(folderName: string): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    if (!folderName || folderName.trim() === "") {
      return yield* Effect.fail(unknownError("Folder name for 'cd' command cannot be empty."));
    }

    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryTag;
    const directories = yield* directoryService.findDirs().pipe(Effect.withSpan("directory.find"));
    yield* Effect.annotateCurrentSpan("search.results_count", directories.length.toString());

    if (directories.length > 0) {
      // Use filter() for fuzzy matching instead of simple includes
      const fuzzyMatches = yield* Effect.sync(() => filter(folderName, directories)).pipe(
        Effect.withSpan("search.fuzzy_match"),
      );
      yield* Effect.annotateCurrentSpan("search.term", folderName);
      yield* Effect.annotateCurrentSpan("search.matches_count", fuzzyMatches.length.toString());

      if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
        const targetPath = fuzzyMatches[0].str; // This is a relative path
        yield* Effect.annotateCurrentSpan("file.path", targetPath);
        // Use ShellIntegrationService
        const shellIntegration = yield* ShellIntegrationTag;
        yield* shellIntegration.changeDirectory(targetPath).pipe(Effect.withSpan("directory.change"));
        return; // Successfully changed directory
      }
    }

    // Nothing found or no directories
    yield* Effect.logError(`Folder '${folderName}' not found`);
    return yield* Effect.fail(unknownError(`Folder '${folderName}' not found`));
  }).pipe(Effect.withSpan("cd.handle_direct"));
}

export function handleInteractiveCd(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryTag;
    const directories = yield* directoryService.findDirs().pipe(Effect.withSpan("directory.find"));
    yield* Effect.annotateCurrentSpan("search.results_count", directories.length.toString());

    if (directories.length === 0) {
      yield* Effect.logError("No directories found");
      return;
    }

    // Use InteractiveSelector for interactive selection
    const selector = yield* InteractiveSelectorTag;
    const selectedPath = yield* selector.selectFromList(directories).pipe(Effect.withSpan("ui.select_interactive"));

    if (selectedPath) {
      yield* Effect.annotateCurrentSpan("file.path", selectedPath);
      // Use ShellIntegrationService
      const shellIntegration = yield* ShellIntegrationTag;
      yield* shellIntegration.changeDirectory(selectedPath).pipe(Effect.withSpan("directory.change"));
    }
  }).pipe(Effect.withSpan("cd.handle_interactive"));
}

/**
 * Register the cd command with the command registry
 */
export const registerCdCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "cd",
    command: cdCommand as Command.Command<string, never, any, any>,
    displayHelp,
  });
});
