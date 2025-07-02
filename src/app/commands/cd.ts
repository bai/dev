import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { filter } from "../../domain/matching";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { ShellService } from "../../domain/ports/Shell";
import { DirectoryServiceTag } from "../../infra/fs/DirectoryService";
import { ShellIntegrationServiceTag } from "../services/ShellIntegrationService";

export const cdCommand: CliCommandSpec = {
  name: "cd",
  description: "Navigate to a directory in the base directory",
  help: `
The cd command helps you quickly navigate to directories:

Interactive Mode:
  dev cd                  # Shows interactive directory picker using fzf

Direct Mode:
  dev cd <folder_name>    # Jump directly to matching directory

Examples:
  dev cd                  # Interactive mode with fuzzy finder
  dev cd myproject        # Direct navigation to myproject directory
  dev cd proj             # Fuzzy match to any directory containing 'proj'
  `,

  arguments: [
    {
      name: "folder_name",
      description: "Name of the folder to navigate to",
      required: false,
    },
  ],

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const folderName = context.args.folder_name;

      if (folderName) {
        yield* handleDirectCd(folderName);
      } else {
        yield* handleInteractiveCd();
      }
    });
  },
};

function handleDirectCd(folderName: string): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    if (!folderName || folderName.trim() === "") {
      return yield* Effect.fail(unknownError("Folder name for 'cd' command cannot be empty."));
    }

    // Use DirectoryService to get directories
    const directoryService = yield* DirectoryServiceTag;
    const directories = yield* directoryService.findDirs();

    if (directories.length > 0) {
      // Use filter() for fuzzy matching instead of simple includes
      const fuzzyMatches = yield* Effect.sync(() => filter(folderName, directories));

      if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
        const targetPath = fuzzyMatches[0].str; // This is a relative path
        // Use ShellIntegrationService instead of direct handleCdToPath
        const shellIntegration = yield* ShellIntegrationServiceTag;
        yield* shellIntegration.handleCdToPathLegacy(targetPath);
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
    const directoryService = yield* DirectoryServiceTag;
    const directories = yield* directoryService.findDirs();

    if (directories.length === 0) {
      yield* Effect.logError("No directories found");
      return;
    }

    // Use fzf for interactive selection
    const directoryList = directories.join("\n") + "\n";

    const selectedPath = yield* Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(["fzf"], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });

        if (proc.stdin) {
          await proc.stdin.write(directoryList);
          await proc.stdin.end();
        }

        const exitCode = await proc.exited;

        if (exitCode === 0 && proc.stdout) {
          const output = await new Response(proc.stdout).text();
          return output.trim();
        }

        return null;
      },
      catch: (error) => unknownError(`Failed to run fzf: ${error}`),
    });

    if (selectedPath) {
      // Use ShellIntegrationService instead of direct handleCdToPath
      const shellIntegration = yield* ShellIntegrationServiceTag;
      yield* shellIntegration.handleCdToPathLegacy(selectedPath);
    }
  });
}
