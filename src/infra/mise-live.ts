import path from "path";

import { stringify } from "@iarna/toml";
import { Effect, Layer } from "effect";

import { ConfigLoaderTag, type ConfigLoader } from "../domain/config-loader-port";
import { shellExecutionError, unknownError, type ShellExecutionError, type UnknownError } from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";
import { MiseTag, type Mise, type MiseInfo } from "../domain/mise-port";
import { ShellTag, type Shell } from "../domain/shell-port";

const homeDir = process.env.HOME || process.env.USERPROFILE || "";

// Factory function to create Mise implementation
export const makeMiseLive = (shell: Shell, fileSystem: FileSystem, configLoader: ConfigLoader): Mise => ({
  checkInstallation: (): Effect.Effect<MiseInfo, ShellExecutionError> =>
    shell.exec("mise", ["--version"]).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(shellExecutionError("mise", ["--version"], "Mise is not installed"));
        }

        const version = result.stdout.split(" ")[0] || "unknown";

        // Get runtime versions
        return shell.exec("mise", ["current"]).pipe(
          Effect.map((currentResult) => {
            const runtimeVersions: Record<string, string> = {};

            if (currentResult.exitCode === 0) {
              const lines = currentResult.stdout.split("\n");
              for (const line of lines) {
                const match = line.match(/^(\S+)\s+(\S+)/);
                if (match && match[1] && match[2]) {
                  runtimeVersions[match[1]] = match[2];
                }
              }
            }

            return {
              version,
              runtimeVersions,
            };
          }),
          Effect.catchAll(() =>
            Effect.succeed({
              version,
              runtimeVersions: {},
            }),
          ),
        );
      }),
    ),

  install: (): Effect.Effect<void, ShellExecutionError> =>
    shell
      .exec("curl", [
        "-sSfL",
        "https://mise.run",
        "|",
        "sh",
      ])
      .pipe(
        Effect.flatMap((result) => {
          if (result.exitCode !== 0) {
            return Effect.fail(
              shellExecutionError(
                "curl",
                ["-sSfL", "https://mise.run", "|", "sh"],
                `Failed to install mise: ${result.stderr}`,
              ),
            );
          }
          return Effect.void;
        }),
      ),

  installTools: (cwd?: string): Effect.Effect<void, ShellExecutionError> =>
    shell.exec("mise", ["install"], { cwd }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(
            shellExecutionError("mise", ["install"], `Failed to install tools: ${result.stderr}`, { cwd }),
          );
        }
        return Effect.void;
      }),
    ),

  runTask: (taskName: string, args?: readonly string[], cwd?: string): Effect.Effect<void, ShellExecutionError> => {
    const miseArgs = ["run", taskName, ...(args || [])];
    return shell.execInteractive("mise", miseArgs, { cwd }).pipe(
      Effect.flatMap((exitCode) => {
        if (exitCode !== 0) {
          return Effect.fail(
            shellExecutionError("mise", miseArgs, `Task '${taskName}' failed with exit code ${exitCode}`, {
              cwd,
            }),
          );
        }
        return Effect.void;
      }),
    );
  },

  getTasks: (cwd?: string): Effect.Effect<string[], ShellExecutionError> =>
    shell.exec("mise", ["tasks", "--list"], { cwd }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(
            shellExecutionError("mise", ["tasks", "--list"], `Failed to get tasks: ${result.stderr}`, { cwd }),
          );
        }

        const tasks = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
          .map((line) => line.split(/\s+/)[0])
          .filter((task): task is string => Boolean(task));

        return Effect.succeed(tasks);
      }),
    ),

  setupGlobalConfig: (): Effect.Effect<void, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("🔧 Setting up mise global configuration...");

      const miseConfigDir = path.join(homeDir, ".config", "mise");
      const miseConfigFile = path.join(miseConfigDir, "config.toml");

      // Create config directory if it doesn't exist
      const configDirExists = yield* fileSystem.exists(miseConfigDir);
      if (!configDirExists) {
        yield* Effect.logDebug("   📂 Creating mise config directory...");
        yield* fileSystem.mkdir(miseConfigDir, true).pipe(
          Effect.mapError((error) => {
            return unknownError(`Failed to create mise config directory: ${error}`);
          }),
        );
      }

      // Load config dynamically from the config loader
      const config = yield* configLoader.load().pipe(
        Effect.mapError((error) => {
          return unknownError(`Failed to load config: ${error}`);
        }),
      );

      // Write mise global config if it exists in the loaded config
      if (config.miseGlobalConfig) {
        const tomlContent = stringify(config.miseGlobalConfig as Record<string, any>);

        yield* fileSystem.writeFile(miseConfigFile, tomlContent).pipe(
          Effect.mapError((error) => {
            return unknownError(`Failed to write mise config: ${error}`);
          }),
        );
        yield* Effect.logDebug("   ✅ Mise global config ready");
      } else {
        yield* Effect.logDebug("   ⚠️  No mise global config found in loaded configuration");
      }
    }),
});

// Effect Layer for dependency injection
export const MiseLiveLayer = Layer.effect(
  MiseTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    const fileSystem = yield* FileSystemTag;
    const configLoader = yield* ConfigLoaderTag;
    return makeMiseLive(shell, fileSystem, configLoader);
  }),
);
