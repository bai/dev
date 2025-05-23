import { spawnSync } from "bun";
import fs from "fs";
import { baseSearchDir, handleCommandError } from "~/utils";

/**
 * Opens a directory in the default editor/IDE
 */
export function handleOpenCommand(args: string[] = []): void {
  let targetPath: string;

  if (args.length === 0) {
    // Open current directory
    targetPath = process.cwd();
  } else if (args.length === 1) {
    const folderName = args[0];
    if (!folderName || folderName.trim() === "") {
      console.error("❌ Error: Folder name cannot be empty.");
      process.exit(1);
    }

    // Search for the folder in the base search directory
    const foundPath = findProjectDirectory(folderName);
    if (!foundPath) {
      console.error(`❌ Error: Folder '${folderName}' not found in ${baseSearchDir}`);
      process.exit(1);
    }
    targetPath = foundPath;
  } else {
    console.error("❌ Error: Too many arguments for 'open' command.");
    console.error("Usage: dev open [folder_name]");
    process.exit(1);
  }

  // Validate target path exists
  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Error: Directory does not exist: ${targetPath}`);
    process.exit(1);
  }

  console.log(`🚀 Opening ${targetPath}...`);

  // Try different editors in order of preference
  const editors = [
    { name: "code", displayName: "VS Code" },
    { name: "cursor", displayName: "Cursor" },
    { name: "subl", displayName: "Sublime Text" },
    { name: "atom", displayName: "Atom" },
    { name: "vim", displayName: "Vim" },
    { name: "nano", displayName: "Nano" },
  ];

  for (const editor of editors) {
    try {
      // Check if editor is available
      const whichResult = spawnSync(["which", editor.name], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (whichResult.exitCode === 0) {
        console.log(`📝 Opening with ${editor.displayName}...`);

        // Open the directory with the editor
        const openResult = spawnSync([editor.name, targetPath], {
          stdio: ["ignore", "inherit", "inherit"],
        });

        if (openResult.exitCode === 0) {
          console.log(`✅ Successfully opened ${targetPath} with ${editor.displayName}`);
          return;
        } else {
          console.warn(`⚠️  Failed to open with ${editor.displayName}, trying next option...`);
        }
      }
    } catch (error) {
      // Continue to next editor
      continue;
    }
  }

  // If no editor worked, try system default
  try {
    console.log("📝 Trying system default...");
    const openResult = spawnSync(["open", targetPath], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    if (openResult.exitCode === 0) {
      console.log(`✅ Successfully opened ${targetPath} with system default`);
      return;
    }
  } catch (error) {
    // Fall through to error
  }

  console.error("❌ Error: No suitable editor found. Please install VS Code, Cursor, or another supported editor.");
  console.error("💡 Supported editors: code, cursor, subl, atom, vim, nano");
}

/**
 * Finds a project directory by name using fuzzy matching
 */
function findProjectDirectory(folderName: string): string | null {
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never . "${baseSearchDir}" | sed 's/\\/*$//g' | fzf -f "${folderName}" | sort -r | head -n 1`;

  try {
    const proc = spawnSync(["sh", "-c", commandString], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (proc.stdout) {
      const foundPath = proc.stdout.toString().trim();
      if (foundPath) {
        return foundPath;
      }
    }

    return null;
  } catch (error: any) {
    handleCommandError(error, `find folder '${folderName}'`, "sh, fd, fzf, or head");
  }
}
