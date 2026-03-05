import { Effect } from "effect";
import { bench, describe } from "vitest";

import type { GitProviderType } from "./models";
import type { PathService } from "./path-service";
import { makeRepositoryService } from "./repository-service";

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

  const repositoryService = makeRepositoryService(mockPathService);

  bench("parse SSH URL", () => {
    const effect = repositoryService.parseRepoUrlToPath("git@github.com:facebook/react.git");
    Effect.runSync(effect);
  });

  bench("parse HTTPS URL", () => {
    const effect = repositoryService.parseRepoUrlToPath("https://github.com/microsoft/vscode.git");
    Effect.runSync(effect);
  });

  bench("parse SSH URL with port", () => {
    const effect = repositoryService.parseRepoUrlToPath("ssh://git@gitlab.com:2222/company/project.git");
    Effect.runSync(effect);
  });

  bench("expand simple repo name", () => {
    const effect = repositoryService.expandToFullGitUrl("myrepo", "myorg");
    Effect.runSync(effect);
  });

  bench("expand org/repo format", () => {
    const effect = repositoryService.expandToFullGitUrl("facebook/react", "defaultorg");
    Effect.runSync(effect);
  });

  bench("expand with provider mapping", () => {
    const orgMapping: Record<string, GitProviderType> = {
      "gitlab-org": "gitlab",
      "github-org": "github",
    };
    const effect = repositoryService.expandToFullGitUrl("gitlab-org/project", "defaultorg", orgMapping);
    Effect.runSync(effect);
  });
});
