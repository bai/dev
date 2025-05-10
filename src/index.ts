import { showUsage } from "./utils";
import { handleCdCommand } from "./cmd/cd";
import { handleUpCommand } from "./cmd/up";
import { handleUpgradeCommand } from "./cmd/upgrade";

// Remove 'bun' and 'index.ts' / or executable name
const args = process.argv.slice(2);

// Main CLI logic
if (args.length === 0) {
  showUsage();
} else if (args[0] === "cd") {
  // Handle cd command with remaining arguments
  handleCdCommand(args.slice(1));
} else if (args.length === 1 && args[0] === "up") {
  // Handle 'dev up' command
  handleUpCommand();
} else if (args.length === 1 && args[0] === "upgrade") {
  // Handle 'dev upgrade' command
  handleUpgradeCommand();
} else {
  showUsage();
}
