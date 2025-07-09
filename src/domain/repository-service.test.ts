import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { describe, expect } from "vitest";

import type { Config, GitProviderType } from "./models";
import { PathServiceTag, type PathService } from "./path-service";
import { RepositoryLive } from "./repository-service";

describe("repository-service", () => {
  // Mock PathService implementation
  class MockPathService implements PathService {
    homeDir = "/home/user";
    baseSearchDir = "/home/user/dev";
    devDir = "/home/user/.dev";
    configDir = "/home/user/.config/dev";
    configPath = "/home/user/.config/dev/config.json";
    dataDir = "/home/user/.local/share/dev";
    dbPath = "/home/user/.local/share/dev/dev.db";
    cacheDir = "/home/user/.cache/dev";

    getBasePath(_config: Config): string {
      return this.baseSearchDir;
    }
  }

  describe("parseRepoUrlToPath", () => {
    it.effect("parses SSH URL with scp-style syntax", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@github.com:myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses SSH URL without .git extension", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@github.com:myorg/myrepo").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses GitLab SSH URL", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@gitlab.com:mygroup/myproject.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/gitlab.com/mygroup/myproject");
      }),
    );

    it.effect("parses HTTPS URL", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("https://github.com/myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses HTTPS URL without .git extension", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("https://github.com/myorg/myrepo").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses git+ssh:// URL", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git+ssh://git@github.com/myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses ssh:// URL", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("ssh://git@github.com/myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses URL with custom port", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("ssh://git@github.com:2222/myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("fails with invalid URL format", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("not-a-valid-url").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails when URL missing org/repo", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("https://github.com/").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("handles repositories with hyphens and underscores", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@github.com:my-org/my_repo-2.0.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/my-org/my_repo-2.0");
      }),
    );

    it.effect("uses custom base path from PathService", () =>
      Effect.gen(function* () {
        class CustomPathService extends MockPathService {
          baseSearchDir = "/custom/projects";
        }

        const pathService = new CustomPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@github.com:myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/custom/projects/github.com/myorg/myrepo");
      }),
    );
  });

  describe("expandToFullGitUrl", () => {
    it.effect("returns full URL unchanged", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("https://github.com/myorg/myrepo", "default-org");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("returns SSH URL unchanged", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("git@github.com:myorg/myrepo.git", "default-org");

        expect(result).toBe("git@github.com:myorg/myrepo.git");
      }),
    );

    it.effect("expands repo name with default org", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("myrepo", "default-org");

        expect(result).toBe("https://github.com/default-org/myrepo");
      }),
    );

    it.effect("expands org/repo format", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("myorg/myrepo", "default-org");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("uses forced GitHub provider", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("myorg/myrepo", "default-org", undefined, "github");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("uses forced GitLab provider", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("myorg/myrepo", "default-org", undefined, "gitlab");

        expect(result).toBe("https://gitlab.com/myorg/myrepo");
      }),
    );

    it.effect("uses org-to-provider mapping for explicit org", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
          "github-org": "github",
        };

        const result = yield* RepositoryLive.expandToFullGitUrl("gitlab-org/myrepo", "default-org", orgToProvider);

        expect(result).toBe("https://gitlab.com/gitlab-org/myrepo");
      }),
    );

    it.effect("uses org-to-provider mapping for default org when no explicit org", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "default-org": "gitlab",
        };

        const result = yield* RepositoryLive.expandToFullGitUrl("myrepo", "default-org", orgToProvider);

        expect(result).toBe("https://gitlab.com/default-org/myrepo");
      }),
    );

    it.effect("ignores default org provider mapping when explicit org is provided", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "default-org": "gitlab",
        };

        const result = yield* RepositoryLive.expandToFullGitUrl("other-org/myrepo", "default-org", orgToProvider);

        // Should use GitHub (default) since other-org is not in the mapping
        expect(result).toBe("https://github.com/other-org/myrepo");
      }),
    );

    it.effect("force provider overrides org mapping", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          myorg: "gitlab",
        };

        const result = yield* RepositoryLive.expandToFullGitUrl("myorg/myrepo", "default-org", orgToProvider, "github");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("handles repository names with special characters", () =>
      Effect.gen(function* () {
        const result = yield* RepositoryLive.expandToFullGitUrl("my-org/my-repo_2.0", "default-org");

        expect(result).toBe("https://github.com/my-org/my-repo_2.0");
      }),
    );

    it.effect("uses github for unmapped org even when defaultOrg maps to gitlab", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          flywheelsoftware: "gitlab", // defaultOrg maps to gitlab
        };

        // When cloning bai/config (bai is not in orgToProvider)
        const result = yield* RepositoryLive.expandToFullGitUrl("bai/config", "flywheelsoftware", orgToProvider);

        // Should use GitHub, not GitLab
        expect(result).toBe("https://github.com/bai/config");
      }),
    );
  });

  describe("edge cases", () => {
    it.effect("handles git:// protocol URLs", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git://github.com/myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("handles http:// protocol URLs", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("http://github.com/myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("handles enterprise GitHub URLs", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@github.enterprise.com:myorg/myrepo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.enterprise.com/myorg/myrepo");
      }),
    );

    it.effect("handles deeply nested repository paths", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("https://gitlab.com/group/subgroup/project.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/gitlab.com/group/subgroup");
      }),
    );

    it.effect("handles SSH URLs with dots in repository name", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* RepositoryLive.parseRepoUrlToPath("git@github.com:foo/my.repo.git").pipe(
          Effect.provide(testLayer),
        );

        expect(result).toBe("/home/user/dev/github.com/foo/my.repo");
      }),
    );

    it.effect("fails with empty string", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(RepositoryLive.parseRepoUrlToPath("").pipe(Effect.provide(testLayer)));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for malformed SSH URL without username", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("@github.com:foo/repo.git").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for malformed SSH URL without host", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("git@:foo/repo.git").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for SSH URL with missing org", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("git@github.com:repo.git").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for SSH URL with missing repo", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("git@github.com:foo/").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for URL with empty path segments", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const result = yield* Effect.exit(
          RepositoryLive.parseRepoUrlToPath("https://github.com//").pipe(Effect.provide(testLayer)),
        );

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );
  });

  describe("integration: expandToFullGitUrl and parseRepoUrlToPath", () => {
    it.effect("handles simple repo name clone", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* RepositoryLive.expandToFullGitUrl("myrepo", defaultOrg, orgToProvider);
        const localPath = yield* RepositoryLive.parseRepoUrlToPath(fullUrl).pipe(Effect.provide(testLayer));

        expect(fullUrl).toBe("https://github.com/myorg/myrepo");
        expect(localPath).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("handles org/repo clone", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* RepositoryLive.expandToFullGitUrl("someorg/myrepo", defaultOrg, orgToProvider);
        const localPath = yield* RepositoryLive.parseRepoUrlToPath(fullUrl).pipe(Effect.provide(testLayer));

        expect(fullUrl).toBe("https://github.com/someorg/myrepo");
        expect(localPath).toBe("/home/user/dev/github.com/someorg/myrepo");
      }),
    );

    it.effect("handles GitLab org/repo clone", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* RepositoryLive.expandToFullGitUrl("gitlab-org/myrepo", defaultOrg, orgToProvider);
        const localPath = yield* RepositoryLive.parseRepoUrlToPath(fullUrl).pipe(Effect.provide(testLayer));

        expect(fullUrl).toBe("https://gitlab.com/gitlab-org/myrepo");
        expect(localPath).toBe("/home/user/dev/gitlab.com/gitlab-org/myrepo");
      }),
    );

    it.effect("handles forced GitLab provider", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* RepositoryLive.expandToFullGitUrl("myrepo", defaultOrg, orgToProvider, "gitlab");
        const localPath = yield* RepositoryLive.parseRepoUrlToPath(fullUrl).pipe(Effect.provide(testLayer));

        expect(fullUrl).toBe("https://gitlab.com/myorg/myrepo");
        expect(localPath).toBe("/home/user/dev/gitlab.com/myorg/myrepo");
      }),
    );

    it.effect("handles forced GitHub provider with GitLab org", () =>
      Effect.gen(function* () {
        const pathService = new MockPathService();
        const testLayer = Layer.succeed(PathServiceTag, pathService);

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* RepositoryLive.expandToFullGitUrl(
          "gitlab-org/myrepo",
          defaultOrg,
          orgToProvider,
          "github",
        );
        const localPath = yield* RepositoryLive.parseRepoUrlToPath(fullUrl).pipe(Effect.provide(testLayer));

        expect(fullUrl).toBe("https://github.com/gitlab-org/myrepo");
        expect(localPath).toBe("/home/user/dev/github.com/gitlab-org/myrepo");
      }),
    );
  });
});
