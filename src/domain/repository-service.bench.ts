import { Effect, Layer } from "effect";
import { bench, describe } from "vitest";

import type { GitProviderType } from "./models";
import { PathServiceTag, type PathService } from "./path-service";
import { RepositoryLive } from "./repository-service";

describe("repository URL parsing performance", () => {
  // Mock PathService for benchmarks
  const mockPathService: PathService = {
    homeDir: "/home/user",
    baseSearchPath: "/home/user/dev",
    devDir: "/home/user/.dev",
    configDir: "/home/user/.config/dev",
    configPath: "/home/user/.config/dev/config.json",
    dataDir: "/home/user/.local/share/dev",
    dbPath: "/home/user/.local/share/dev/dev.db",
    cacheDir: "/home/user/.cache/dev",
    getBasePath: () => "/home/user/dev",
  };

  const testLayer = Layer.succeed(PathServiceTag, mockPathService);

  bench("parse SSH URL", () => {
    const effect = RepositoryLive.parseRepoUrlToPath("git@github.com:facebook/react.git").pipe(
      Effect.provide(testLayer),
    );
    Effect.runSync(effect);
  });

  bench("parse HTTPS URL", () => {
    const effect = RepositoryLive.parseRepoUrlToPath("https://github.com/microsoft/vscode.git").pipe(
      Effect.provide(testLayer),
    );
    Effect.runSync(effect);
  });

  bench("parse SSH URL with port", () => {
    const effect = RepositoryLive.parseRepoUrlToPath("ssh://git@gitlab.com:2222/company/project.git").pipe(
      Effect.provide(testLayer),
    );
    Effect.runSync(effect);
  });

  bench("expand simple repo name", () => {
    const effect = RepositoryLive.expandToFullGitUrl("myrepo", "myorg");
    Effect.runSync(effect);
  });

  bench("expand org/repo format", () => {
    const effect = RepositoryLive.expandToFullGitUrl("facebook/react", "defaultorg");
    Effect.runSync(effect);
  });

  bench("expand with provider mapping", () => {
    const orgMapping: Record<string, GitProviderType> = {
      "gitlab-org": "gitlab",
      "github-org": "github",
    };
    const effect = RepositoryLive.expandToFullGitUrl("gitlab-org/project", "defaultorg", orgMapping);
    Effect.runSync(effect);
  });
});
