import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import type { CliCommandSpec, CommandContext, Logger } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Shell } from "../../domain/ports/Shell";

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

    const baseDir = ctx.fileSystem.resolvePath(ctx.baseDir);
    const directories = yield* ctx.fileSystem.listDirectories(baseDir);

    if (typeof directories === "object" && "_tag" in directories) {
      throw directories;
    }

    // Simple fuzzy matching - find directories that contain the search term
    const matches = directories.filter((dir) => dir.toLowerCase().includes(folderName.toLowerCase()));

    if (matches.length > 0) {
      const targetPath = `${baseDir}/${matches[0]}`;
      yield* ctx.shell.changeDirectory(targetPath);
      yield* ctx.logger.success(`Changed to ${matches[0]}`);
      return;
    }

    yield* ctx.logger.error(`Folder '${folderName}' not found in ${ctx.baseDir}`);
    return yield* Effect.fail(unknownError(`Folder '${folderName}' not found`));
  });
}

function handleInteractiveCd(ctx: ExtendedCommandContext): Effect.Effect<void, DevError> {
  return Effect.gen(function* () {
    const baseDir = ctx.fileSystem.resolvePath(ctx.baseDir);
    const directories = yield* ctx.fileSystem.listDirectories(baseDir);

    if (typeof directories === "object" && "_tag" in directories) {
      throw directories;
    }

    if (directories.length === 0) {
      yield* ctx.logger.error(`No directories found in ${ctx.baseDir}`);
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
      const targetPath = `${baseDir}/${selectedPath}`;
      yield* ctx.shell.changeDirectory(targetPath);
      yield* ctx.logger.success(`Changed to ${selectedPath}`);
    }
  });
}
