import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { filter } from "../../domain/matching";
import { DirectoryService } from "../../domain/ports/DirectoryService";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { InteractiveSelectorService } from "../../domain/ports/InteractiveSelector";
import { ShellService } from "../../domain/ports/Shell";
import { ShellIntegrationServiceTag } from "../services/ShellIntegrationService";

// Define the folder name argument as optional
const folderName = Args.text({ name: "folder_name" }).pipe(Args.optional);

// Create the cd command using @effect/cli
export const cdCommand = Command.make("cd", { folderName }, ({ folderName }) =>
  Effect.gen(function* () {
    if (folderName._tag === "Some") {
      yield* handleDirectCd(folderName.value);
    } else {
      yield* handleInteractiveCd();
    }
  }),
);

function handleDirectCd(folderName: string): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    if (!folderName || folderName.trim() === "") {
      return yield* Effect.fail(unknownError("Folder name for 'cd' command cannot be empty."));
    }

    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryService;
    const directories = yield* directoryService.findDirs();

    if (directories.length > 0) {
      // Use filter() for fuzzy matching instead of simple includes
      const fuzzyMatches = yield* Effect.sync(() => filter(folderName, directories));

      if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
        const targetPath = fuzzyMatches[0].str; // This is a relative path
        // Use ShellIntegrationService
        const shellIntegration = yield* ShellIntegrationServiceTag;
        yield* shellIntegration.changeDirectory(targetPath);
        return; // Successfully changed directory
      }
    }

    // Nothing found or no directories
    yield* Effect.logError(`Folder '${folderName}' not found`);
    return yield* Effect.fail(unknownError(`Folder '${folderName}' not found`));
  });
}

function handleInteractiveCd(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryService;
    const directories = yield* directoryService.findDirs();

    if (directories.length === 0) {
      yield* Effect.logError("No directories found");
      return;
    }

    // Use InteractiveSelector for interactive selection
    const selector = yield* InteractiveSelectorService;
    const selectedPath = yield* selector.selectFromList(directories);

    if (selectedPath) {
      // Use ShellIntegrationService
      const shellIntegration = yield* ShellIntegrationServiceTag;
      yield* shellIntegration.changeDirectory(selectedPath);
    }
  });
}
