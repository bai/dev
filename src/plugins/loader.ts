import { Effect } from "effect";

import { unknownError, type DevError } from "../domain/errors";
import type { AppModule } from "../domain/models";
import { FileSystemService, type FileSystem } from "../domain/ports/FileSystem";
import { GitService, type Git } from "../domain/ports/Git";

// Factory function that creates PluginLoader with dependencies
export const makePluginLoader = (fileSystem: FileSystem, git: Git) => {
  const loadAllPlugins = (): Effect.Effect<AppModule[], DevError> =>
    Effect.gen(function* () {
      // Load all plugin sources in parallel for better performance
      const [localModules, nodeModules, gitModules] = yield* Effect.all(
        [
          loadLocalPlugins(fileSystem),
          loadNodeModulesPlugins(),
          loadGitPlugins(fileSystem),
        ],
        { concurrency: "unbounded" },
      );

      // Flatten all modules into a single array
      return [...localModules, ...nodeModules, ...gitModules];
    });

  return {
    loadAllPlugins,
  };
};

// Standalone functions to avoid "this" context issues
function loadLocalPlugins(fileSystem: FileSystem): Effect.Effect<AppModule[], DevError> {
  return Effect.gen(function* () {
    const pluginsDir = fileSystem.resolvePath("~/.dev/plugins");

    const exists = yield* fileSystem.exists(pluginsDir);
    if (!exists) {
      return [];
    }

    return yield* loadPluginsFromDirectory(fileSystem, pluginsDir);
  });
}

function loadNodeModulesPlugins(): Effect.Effect<AppModule[], DevError> {
  // This would scan node_modules for @*/dev-plugin-* packages
  // For now, return empty array as it requires more complex logic
  return Effect.succeed([]);
}

function loadGitPlugins(fileSystem: FileSystem): Effect.Effect<AppModule[], DevError> {
  return Effect.gen(function* () {
    // Load plugins from XDG_CACHE_HOME/dev/plugins/
    const cacheDir = process.env.XDG_CACHE_HOME || fileSystem.resolvePath("~/.cache");
    const gitPluginsDir = `${cacheDir}/dev/plugins`;

    const exists = yield* fileSystem.exists(gitPluginsDir);
    if (!exists) {
      return [];
    }

    return yield* loadPluginsFromDirectory(fileSystem, gitPluginsDir);
  });
}

function loadPluginsFromDirectory(fileSystem: FileSystem, directory: string): Effect.Effect<AppModule[], DevError> {
  return Effect.gen(function* () {
    const modules: AppModule[] = [];

    // Get directory entries using Effect
    const entries = yield* fileSystem.listDirectories(directory);

    for (const entry of entries) {
      const moduleResult = yield* Effect.either(loadPlugin(fileSystem, `${directory}/${entry}`));

      if (moduleResult._tag === "Right" && moduleResult.right) {
        modules.push(moduleResult.right);
      }
      // Ignore individual plugin load failures to allow other plugins to load
    }

    return modules;
  });
}

function loadPlugin(fileSystem: FileSystem, pluginPath: string): Effect.Effect<AppModule | null, DevError> {
  return Effect.gen(function* () {
    // Try to load index.js or index.ts from plugin directory
    const indexPath = `${pluginPath}/index.js`;

    const exists = yield* fileSystem.exists(indexPath);
    if (!exists) {
      return null;
    }

    // Dynamic import of the plugin using Effect.tryPromise
    const pluginModule = yield* Effect.tryPromise({
      try: () => import(indexPath),
      catch: (error) => unknownError(`Failed to load plugin from ${pluginPath}: ${error}`),
    });

    // Verify it exports default as AppModule
    if (pluginModule.default && isValidAppModule(pluginModule.default)) {
      return pluginModule.default as AppModule;
    }

    return null;
  });
}

function isValidAppModule(module: any): boolean {
  return (
    module &&
    typeof module === "object" &&
    Array.isArray(module.commands) &&
    module.commands.every((cmd: any) => cmd.name && cmd.description && typeof cmd.exec === "function")
  );
}

// Effect Layer for dependency injection using factory function
export const PluginLoaderLive = Effect.gen(function* () {
  const fileSystem = yield* FileSystemService;
  const git = yield* GitService;
  return makePluginLoader(fileSystem, git);
});
