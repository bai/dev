import type { DevCommand } from "~/types/command";
import {
  arg,
  getArg,
  getOption,
  hasOption,
  isGitRepository,
  option,
  parseNumber,
  runCommand,
  validateArgs,
  validateChoice,
} from "~/utils/command-utils";

export const exampleCommand: DevCommand = {
  name: "example",
  description: "Example command demonstrating the unified interface",
  help: `
The example command demonstrates all features of the unified interface:

Features:
- Required and optional arguments
- Boolean and value options
- Input validation
- Git repository checks
- Proper error handling

Examples:
  dev example hello                    # Basic usage
  dev example hello world              # With optional argument
  dev example hello --uppercase        # With boolean flag
  dev example hello --prefix ">> "     # With value option
  dev example hello world --uppercase --prefix ">> "  # All features
  `,

  arguments: [
    arg("message", "Message to display", { required: true }),
    arg("suffix", "Optional suffix to append", { required: false, defaultValue: "" }),
  ],

  options: [
    option("-u, --uppercase", "Convert output to uppercase"),
    option("-p, --prefix <text>", "Prefix to add to output", { defaultValue: "" }),
    option("-c, --count <n>", "Number of times to repeat", { defaultValue: "1" }),
    option("--require-git", "Require command to be run in git repository"),
    option("-v, --verbose", "Enable verbose output"),
  ],

  aliases: ["demo", "test"],

  async validate(context) {
    const { logger } = context;

    // Validate count option
    const count = parseNumber(context, "count", {
      min: 1,
      max: 10,
      integer: true,
      isOption: true,
    });

    // Check git requirement if requested
    if (hasOption(context, "require-git")) {
      if (!isGitRepository()) {
        logger.error("This command requires being run in a git repository (use --require-git)");
        return false;
      }
      logger.success("Git repository detected");
    }

    return true;
  },

  async exec(context) {
    const { logger } = context;

    try {
      // Validate arguments
      validateArgs(context, ["message"]);

      // Get arguments and options
      const message = getArg(context, "message");
      const suffix = getArg(context, "suffix", "");
      const uppercase = hasOption(context, "uppercase");
      const prefix = getOption(context, "prefix", "");
      const count = parseNumber(context, "count", { isOption: true });
      const verbose = hasOption(context, "verbose");

      if (verbose) {
        logger.info("Example command executed with:");
        logger.info(`  Message: "${message}"`);
        logger.info(`  Suffix: "${suffix || "(none)"}"`);
        logger.info(`  Uppercase: ${uppercase}`);
        logger.info(`  Prefix: "${prefix || "(none)"}"`);
        logger.info(`  Count: ${count}`);
        logger.info("");
      }

      // Build output string
      let output = message;
      if (suffix) {
        output += ` ${suffix}`;
      }
      if (uppercase) {
        output = output.toUpperCase();
      }
      if (prefix) {
        output = `${prefix}${output}`;
      }

      // Display output the specified number of times
      for (let i = 0; i < count; i++) {
        console.log(`${i + 1}. ${output}`);
      }

      // Demonstrate running external command (if verbose)
      if (verbose) {
        logger.info("Running echo command as demonstration:");
        runCommand(["echo", "This is a demonstration of runCommand"], context, { inherit: true });
      }

      logger.success("Example command completed successfully!");
    } catch (error: any) {
      logger.error(`Example command failed: ${error.message}`);
      throw error;
    }
  },
};
