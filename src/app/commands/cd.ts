import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import type { CliCommandSpec, CommandContext, Logger } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Shell } from "../../domain/ports/Shell";
import { findDirs } from "../../lib/find-dirs";
import { handleCdToPath } from "../../lib/handle-cd-to-path";
import { filter } from "../../lib/match";

// Extended command context that includes all services
interface ExtendedCommandContext extends CommandContext {
  logger: Logger;
  fileSystem: FileSystem;
  shell: Shell;
  baseDir: string;
}

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

  exec(context: CommandContext): Effect.Effect<void, never, any> {
    return Effect.gen(function* () {
      const ctx = context as ExtendedCommandContext;
      const folderName = ctx.args.folder_name;

      if (folderName) {
        yield* handleDirectCd(folderName, ctx);
      } else {
        yield* handleInteractiveCd(ctx);
      }
    }).pipe(
      Effect.catchAll((error) => {
        // Handle all errors and convert to success to match the never error type
        console.error("Command failed:", error);
        return Effect.succeed(void 0);
      }),
    );
  },
};

function handleDirectCd(folderName: string, ctx: ExtendedCommandContext): Effect.Effect<void, DevError> {
  return Effect.gen(function* () {
    if (!folderName || folderName.trim() === "") {
      return yield* Effect.fail(unknownError("Folder name for 'cd' command cannot be empty."));
    }

    // Use findDirs() to get directories, wrapped in Effect
    const directories = yield* Effect.sync(() => findDirs());

    if (directories.length > 0) {
      // Use filter() for fuzzy matching instead of simple includes
      const fuzzyMatches = yield* Effect.sync(() => filter(folderName, directories));

      if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
        const targetPath = fuzzyMatches[0].str; // This is a relative path
        // Use handleCdToPath instead of direct shell.changeDirectory
        yield* handleCdToPath(targetPath);
        return; // Successfully changed directory
      }
    }

    // Nothing found or no directories
    yield* ctx.logger.error(`Folder '${folderName}' not found`);
    return yield* Effect.fail(unknownError(`Folder '${folderName}' not found`));
  });
}

function handleInteractiveCd(ctx: ExtendedCommandContext): Effect.Effect<void, DevError> {
  return Effect.gen(function* () {
    // Use findDirs() to get directories, wrapped in Effect
    const directories = yield* Effect.sync(() => findDirs());

    if (directories.length === 0) {
      yield* ctx.logger.error("No directories found");
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
      // Use handleCdToPath instead of direct shell.changeDirectory
      yield* handleCdToPath(selectedPath);
    }
  });
}
