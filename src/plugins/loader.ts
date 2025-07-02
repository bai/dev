import { unknownError, type DevError } from "../domain/errors";
import type { AppModule } from "../domain/models";
import type { FileSystem } from "../domain/ports/FileSystem";
import type { Git } from "../domain/ports/Git";

export class PluginLoader {
  constructor(
    private fileSystem: FileSystem,
    private git: Git,
  ) {}

  async loadAllPlugins(): Promise<AppModule[]> {
    const modules: AppModule[] = [];

    // 1. Load local plugins from ~/.dev/plugins/**
    const localModules = await this.loadLocalPlugins();
    modules.push(...localModules);

    // 2. Load from node_modules/@*/dev-plugin-*
    const nodeModules = await this.loadNodeModulesPlugins();
    modules.push(...nodeModules);

    // 3. Git URL plugins are handled during upgrade
    // They're cloned to $XDG_CACHE_HOME/dev/plugins/<hash>
    const gitModules = await this.loadGitPlugins();
    modules.push(...gitModules);

    return modules;
  }

  private async loadLocalPlugins(): Promise<AppModule[]> {
    const pluginsDir = this.fileSystem.resolvePath("~/.dev/plugins");

    if (!(await this.fileSystem.exists(pluginsDir))) {
      return [];
    }

    return await this.loadPluginsFromDirectory(pluginsDir);
  }

  private async loadNodeModulesPlugins(): Promise<AppModule[]> {
    // This would scan node_modules for @*/dev-plugin-* packages
    // For now, return empty array as it requires more complex logic
    return [];
  }

  private async loadGitPlugins(): Promise<AppModule[]> {
    // Load plugins from XDG_CACHE_HOME/dev/plugins/
    const cacheDir = process.env.XDG_CACHE_HOME || this.fileSystem.resolvePath("~/.cache");
    const gitPluginsDir = `${cacheDir}/dev/plugins`;

    if (!(await this.fileSystem.exists(gitPluginsDir))) {
      return [];
    }

    return await this.loadPluginsFromDirectory(gitPluginsDir);
  }

  private async loadPluginsFromDirectory(directory: string): Promise<AppModule[]> {
    const modules: AppModule[] = [];

    try {
      const entries = await this.fileSystem.listDirectories(directory);

      if (typeof entries === "object" && "_tag" in entries) {
        return modules; // Return empty on error
      }

      for (const entry of entries) {
        try {
          const module = await this.loadPlugin(`${directory}/${entry}`);
          if (module) {
            modules.push(module);
          }
        } catch (error) {
          // Log error but continue loading other plugins
          console.warn(`Failed to load plugin from ${entry}: ${error}`);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return modules;
  }

  private async loadPlugin(pluginPath: string): Promise<AppModule | null> {
    try {
      // Try to load index.js or index.ts from plugin directory
      const indexPath = `${pluginPath}/index.js`;

      if (await this.fileSystem.exists(indexPath)) {
        // Dynamic import of the plugin
        const pluginModule = await import(indexPath);

        // Verify it exports default as AppModule
        if (pluginModule.default && this.isValidAppModule(pluginModule.default)) {
          return pluginModule.default as AppModule;
        }
      }
    } catch (error) {
      throw unknownError(`Failed to load plugin from ${pluginPath}: ${error}`);
    }

    return null;
  }

  private isValidAppModule(module: any): boolean {
    return (
      module &&
      typeof module === "object" &&
      Array.isArray(module.commands) &&
      module.commands.every((cmd: any) => cmd.name && cmd.description && typeof cmd.exec === "function")
    );
  }
}
