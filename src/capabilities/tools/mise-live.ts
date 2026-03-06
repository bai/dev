import path from "path";

import { stringify } from "@iarna/toml";
import { Effect, Layer } from "effect";

import { FileSystem } from "~/capabilities/system/file-system-port";
import { Shell } from "~/capabilities/system/shell-port";
import { Mise, type MiseService, type MiseInfo } from "~/capabilities/tools/mise-port";
import { ConfigLoader } from "~/core/config/config-loader-port";
import { ShellExecutionError, UnknownError } from "~/core/errors";
import { EnvironmentPaths } from "~/core/runtime/path-service";

export const MiseLiveLayer = Layer.effect(
  Mise,
  Effect.gen(function* () {
    const shell = yield* Shell;
    const fileSystem = yield* FileSystem;
    const configLoader = yield* ConfigLoader;
    const environmentPaths = yield* EnvironmentPaths;
    return {
      checkInstallation: (): Effect.Effect<MiseInfo, ShellExecutionError> =>
        shell.exec("mise", ["--version"]).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new ShellExecutionError({ command: "mise", args: ["--version"], message: "Mise is not installed" });
            }

            const version = result.stdout.split(" ")[0] || "unknown";

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
              Effect.orElseSucceed(() => ({
                version,
                runtimeVersions: {},
              })),
            );
          }),
        ),
      install: (): Effect.Effect<void, ShellExecutionError> =>
        shell.exec("sh", ["-c", "curl -sSfL https://mise.run | sh"]).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new ShellExecutionError({
                command: "sh",
                args: ["-c", "curl -sSfL https://mise.run | sh"],
                message: `Failed to install mise: ${result.stderr}`,
              });
            }
            return Effect.void;
          }),
        ),
      installTools: (cwd?: string): Effect.Effect<void, ShellExecutionError> =>
        shell.exec("mise", ["install"], { cwd }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new ShellExecutionError({
                command: "mise",
                args: ["install"],
                message: `Failed to install tools: ${result.stderr}`,
                cwd,
              });
            }
            return Effect.void;
          }),
        ),
      runTask: (taskName: string, args?: readonly string[], cwd?: string): Effect.Effect<void, ShellExecutionError> => {
        const miseArgs = ["run", taskName, ...(args || [])];
        return shell.execInteractive("mise", miseArgs, { cwd }).pipe(
          Effect.flatMap((exitCode) => {
            if (exitCode !== 0) {
              return new ShellExecutionError({
                command: "mise",
                args: miseArgs,
                message: `Task '${taskName}' failed with exit code ${exitCode}`,
                cwd,
              });
            }
            return Effect.void;
          }),
        );
      },
      getTasks: (cwd?: string): Effect.Effect<string[], ShellExecutionError> =>
        shell.exec("mise", ["tasks", "--list"], { cwd }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new ShellExecutionError({
                command: "mise",
                args: ["tasks", "--list"],
                message: `Failed to get tasks: ${result.stderr}`,
                cwd,
              });
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

          const xdgConfigHome = environmentPaths.xdgConfigHome;
          const miseConfigDir = path.join(xdgConfigHome, "mise");
          const miseConfigFile = path.join(miseConfigDir, "config.toml");

          const configDirExists = yield* fileSystem.exists(miseConfigDir);
          if (!configDirExists) {
            yield* Effect.logDebug("   📂 Creating mise config directory...");
            yield* fileSystem.mkdir(miseConfigDir, true).pipe(
              Effect.mapError((error) => {
                return new UnknownError({
                  message: `Failed to create mise config directory: ${error}`,
                  details: `Failed to create mise config directory: ${error}`,
                });
              }),
            );
          }

          const config = yield* configLoader.load().pipe(
            Effect.mapError((error) => {
              return new UnknownError({ message: `Failed to load config: ${error}`, details: `Failed to load config: ${error}` });
            }),
          );

          if (config.miseGlobalConfig) {
            const tomlContent = stringify(config.miseGlobalConfig as Parameters<typeof stringify>[0]);

            yield* fileSystem.writeFile(miseConfigFile, tomlContent).pipe(
              Effect.mapError((error) => {
                return new UnknownError({
                  message: `Failed to write mise config: ${error}`,
                  details: `Failed to write mise config: ${error}`,
                });
              }),
            );
            yield* Effect.logDebug("   ✅ Mise global config ready");
          } else {
            yield* Effect.logDebug("   ⚠️  No mise global config found in loaded configuration");
          }
        }),
    } satisfies MiseService;
  }),
);
