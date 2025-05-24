import fs from "fs";
import { baseSearchDir } from "~/utils/constants";

// Validation utilities
export function validateBaseSearchDir(): void {
  if (!fs.existsSync(baseSearchDir)) {
    console.error(`Error: Base search directory does not exist: ${baseSearchDir}`);
    console.error(`Please create the directory first: mkdir -p ${baseSearchDir}`);
    process.exit(1);
  }
}

// Enhanced error handling with more context
export function handleCommandError(
  error: Error & { code?: string },
  commandName: string,
  requiredCommands: string,
  context?: string,
): never {
  const contextMsg = context ? ` (${context})` : "";

  if (error.code === "ENOENT") {
    console.error(`❌ Error: Required command not found${contextMsg}`);
    console.error(`   Command: ${requiredCommands}`);
    console.error(`   Please ensure the following are installed and in your PATH:`);
    console.error(
      `   ${requiredCommands
        .split(", ")
        .map((cmd) => `   - ${cmd}`)
        .join("\n")}`,
    );
  } else {
    console.error(`❌ Failed to execute ${commandName}${contextMsg}: ${error.message}`);
  }
  process.exit(1);
}

// Handles changing directory through shell wrapper
export function handleCdToPath(targetPath: string): void {
  // Validate path exists before attempting to cd
  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Error: Directory does not exist: ${targetPath}`);
    process.exit(1);
  }

  // Special format for the shell wrapper to interpret: "CD:<path>"
  console.log(`CD:${targetPath}`);
  process.exit(0);
}
