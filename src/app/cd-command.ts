import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { DirectoryTag } from "../domain/directory-port";
import { unknownError, type DevError } from "../domain/errors";
import { InteractiveSelectorTag } from "../domain/interactive-selector-port";
import { filter } from "../domain/matching";
import { ShellIntegrationTag } from "./shell-integration-service";

// Define the folder name argument as optional
const folderName = Args.text({ name: "folder_name" }).pipe(Args.optional);

// Create the cd command using @effect/cli
export const cdCommand = Command.make("cd", { folderName }, ({ folderName }) =>
  Effect.gen(function* () {
    if (folderName._tag === "Some") {
      yield* Effect.annotateCurrentSpan("cd_mode", "direct");
      yield* Effect.annotateCurrentSpan("folder_name", folderName.value);
      yield* handleDirectCd(folderName.value);
    } else {
      yield* Effect.annotateCurrentSpan("cd_mode", "interactive");
      yield* handleInteractiveCd();
    }
  }).pipe(Effect.withSpan("cd-command")),
);

export function handleDirectCd(folderName: string): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    if (!folderName || folderName.trim() === "") {
      return yield* Effect.fail(unknownError("Folder name for 'cd' command cannot be empty."));
    }

    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryTag;
    const directories = yield* directoryService.findDirs().pipe(
      Effect.tap(() => Effect.annotateCurrentSpan("operation", "find_directories")),
      Effect.withSpan("find-directories"),
    );
    yield* Effect.annotateCurrentSpan("directories_found", directories.length.toString());

    if (directories.length > 0) {
      // Use filter() for fuzzy matching instead of simple includes
      const fuzzyMatches = yield* Effect.sync(() => filter(folderName, directories)).pipe(
        Effect.tap(() => Effect.annotateCurrentSpan("search_term", folderName)),
        Effect.withSpan("fuzzy-match"),
      );
      yield* Effect.annotateCurrentSpan("fuzzy_matches", fuzzyMatches.length.toString());

      if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
        const targetPath = fuzzyMatches[0].str; // This is a relative path
        yield* Effect.annotateCurrentSpan("target_path", targetPath);
        // Use ShellIntegrationService
        const shellIntegration = yield* ShellIntegrationTag;
        yield* shellIntegration.changeDirectory(targetPath).pipe(
          Effect.tap(() => Effect.annotateCurrentSpan("operation", "change_directory")),
          Effect.withSpan("change-directory"),
        );
        return; // Successfully changed directory
      }
    }

    // Nothing found or no directories
    yield* Effect.logError(`Folder '${folderName}' not found`);
    return yield* Effect.fail(unknownError(`Folder '${folderName}' not found`));
  }).pipe(Effect.withSpan("handle-direct-cd"));
}

export function handleInteractiveCd(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryTag;
    const directories = yield* directoryService.findDirs().pipe(
      Effect.tap(() => Effect.annotateCurrentSpan("operation", "find_directories")),
      Effect.withSpan("find-directories"),
    );
    yield* Effect.annotateCurrentSpan("directories_found", directories.length.toString());

    if (directories.length === 0) {
      yield* Effect.logError("No directories found");
      return;
    }

    // Use InteractiveSelector for interactive selection
    const selector = yield* InteractiveSelectorTag;
    const selectedPath = yield* selector.selectFromList(directories).pipe(
      Effect.tap(() => Effect.annotateCurrentSpan("operation", "interactive_selection")),
      Effect.withSpan("interactive-selection"),
    );

    if (selectedPath) {
      yield* Effect.annotateCurrentSpan("selected_path", selectedPath);
      // Use ShellIntegrationService
      const shellIntegration = yield* ShellIntegrationTag;
      yield* shellIntegration.changeDirectory(selectedPath).pipe(
        Effect.tap(() => Effect.annotateCurrentSpan("operation", "change_directory")),
        Effect.withSpan("change-directory"),
      );
    }
  }).pipe(Effect.withSpan("handle-interactive-cd"));
}
