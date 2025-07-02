import { unknownError, type DevError } from "../../domain/errors";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Shell } from "../../domain/ports/Shell";

interface CdContext extends CommandContext {
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

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as CdContext;
    const folderName = ctx.args.folder_name;

    if (folderName) {
      await handleDirectCd(folderName, ctx);
    } else {
      await handleInteractiveCd(ctx);
    }
  },
};

async function handleDirectCd(folderName: string, ctx: CdContext): Promise<void> {
  if (!folderName || folderName.trim() === "") {
    throw unknownError("Folder name for 'cd' command cannot be empty.");
  }

  const baseDir = ctx.fileSystem.resolvePath(ctx.baseDir);
  const directories = await ctx.fileSystem.listDirectories(baseDir);

  if (typeof directories === "object" && "_tag" in directories) {
    throw directories;
  }

  // Simple fuzzy matching - find directories that contain the search term
  const matches = directories.filter((dir) => dir.toLowerCase().includes(folderName.toLowerCase()));

  if (matches.length > 0) {
    const targetPath = `${baseDir}/${matches[0]}`;
    ctx.shell.changeDirectory(targetPath);
    ctx.logger.success(`Changed to ${matches[0]}`);
    return;
  }

  ctx.logger.error(`Folder '${folderName}' not found in ${ctx.baseDir}`);
  throw unknownError(`Folder '${folderName}' not found`);
}

async function handleInteractiveCd(ctx: CdContext): Promise<void> {
  const baseDir = ctx.fileSystem.resolvePath(ctx.baseDir);
  const directories = await ctx.fileSystem.listDirectories(baseDir);

  if (typeof directories === "object" && "_tag" in directories) {
    throw directories;
  }

  if (directories.length === 0) {
    ctx.logger.error(`No directories found in ${ctx.baseDir}`);
    return;
  }

  // Use fzf for interactive selection
  const result = await ctx.shell.exec("fzf", [], {});

  if (typeof result === "object" && "_tag" in result) {
    throw result;
  }

  // Create directory list as input for fzf
  const proc = Bun.spawn(["fzf"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.stdin) {
    const directoryList = directories.join("\n") + "\n";
    await proc.stdin.write(directoryList);
    await proc.stdin.end();
  }

  const exitCode = await proc.exited;

  if (exitCode === 0 && proc.stdout) {
    const output = await new Response(proc.stdout).text();
    const selectedPath = output.trim();

    if (selectedPath) {
      const targetPath = `${baseDir}/${selectedPath}`;
      ctx.shell.changeDirectory(targetPath);
      ctx.logger.success(`Changed to ${selectedPath}`);
    }
  }
}
