import { it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { describe, expect, it as vitestIt } from "vitest";

import { makePathServiceMock } from "../infra/path-service-mock";
import type { GitProviderType } from "./models";
import { PathServiceTag, type PathService } from "./path-service";
import { isFullUrl, makeRepositoryService } from "./repository-service";

describe("repository-service", () => {
  const makePathService = (baseSearchPath = "/home/user/dev"): PathService =>
    makePathServiceMock({
      homeDir: "/home/user",
      baseSearchPath,
    });

  const createRepositoryService = (pathService: PathService = makePathService()) => makeRepositoryService(pathService);

  describe("parseRepoUrlToPath", () => {
    it.effect("parses SSH URL with scp-style syntax", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git@github.com:myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses SSH URL without .git extension", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git@github.com:myorg/myrepo");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses GitLab SSH URL", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git@gitlab.com:mygroup/myproject.git");

        expect(result).toBe("/home/user/dev/gitlab.com/mygroup/myproject");
      }),
    );

    it.effect("parses HTTPS URL", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("https://github.com/myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses HTTPS URL without .git extension", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("https://github.com/myorg/myrepo");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses git+ssh:// URL", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git+ssh://git@github.com/myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses ssh:// URL", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("ssh://git@github.com/myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("parses URL with custom port", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("ssh://git@github.com:2222/myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("fails with invalid URL format", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("not-a-valid-url"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails when URL missing org/repo", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("https://github.com/"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("handles repositories with hyphens and underscores", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git@github.com:my-org/my_repo-2.0.git");

        expect(result).toBe("/home/user/dev/github.com/my-org/my_repo-2.0");
      }),
    );

    it.effect("preserves repository name casing in filesystem path", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("https://github.com/myorg/MyRepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/MyRepo");
      }),
    );

    it.effect("uses custom base path from PathService", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService(makePathService("/custom/projects"));
        const result = yield* repositoryService.parseRepoUrlToPath("git@github.com:myorg/myrepo.git");

        expect(result).toBe("/custom/projects/github.com/myorg/myrepo");
      }),
    );

    it.effect("uses factory-injected PathService even when a different one exists in context", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService(makePathService());
        const contextPathService = makePathServiceMock({
          homeDir: "/ctx/home",
          baseSearchPath: "/ctx/projects",
        });

        const result = yield* repositoryService
          .parseRepoUrlToPath("git@github.com:myorg/myrepo.git")
          .pipe(Effect.provideService(PathServiceTag, contextPathService));

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );
  });

  describe("expandToFullGitUrl", () => {
    it.effect("returns full URL unchanged", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("https://github.com/myorg/myrepo", "default-org");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("returns SSH URL unchanged", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("git@github.com:myorg/myrepo.git", "default-org");

        expect(result).toBe("git@github.com:myorg/myrepo.git");
      }),
    );

    it.effect("expands repo name with default org", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("myrepo", "default-org");

        expect(result).toBe("https://github.com/default-org/myrepo");
      }),
    );

    it.effect("expands org/repo format", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("myorg/myrepo", "default-org");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("uses forced GitHub provider", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("myorg/myrepo", "default-org", undefined, "github");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("uses forced GitLab provider", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("myorg/myrepo", "default-org", undefined, "gitlab");

        expect(result).toBe("https://gitlab.com/myorg/myrepo");
      }),
    );

    it.effect("uses org-to-provider mapping for explicit org", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "GitLab-Org": "gitlab",
          "github-org": "github",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("gitlab-org/myrepo", "default-org", orgToProvider);

        expect(result).toBe("https://gitlab.com/gitlab-org/myrepo");
      }),
    );

    it.effect("uses org-to-provider mapping for default org when no explicit org", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "Default-Org": "gitlab",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("myrepo", "default-org", orgToProvider);

        expect(result).toBe("https://gitlab.com/default-org/myrepo");
      }),
    );

    it.effect("ignores default org provider mapping when explicit org is provided", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "default-org": "gitlab",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("other-org/myrepo", "default-org", orgToProvider);

        // Should use GitHub (default) since other-org is not in the mapping
        expect(result).toBe("https://github.com/other-org/myrepo");
      }),
    );

    it.effect("force provider overrides org mapping", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          myorg: "gitlab",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("myorg/myrepo", "default-org", orgToProvider, "github");

        expect(result).toBe("https://github.com/myorg/myrepo");
      }),
    );

    it.effect("handles repository names with special characters", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("my-org/my-repo_2.0", "default-org");

        expect(result).toBe("https://github.com/my-org/my-repo_2.0");
      }),
    );

    it.effect("preserves repository name casing when expanding URLs", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().expandToFullGitUrl("myorg/MyRepo", "default-org");

        expect(result).toBe("https://github.com/myorg/MyRepo");
      }),
    );

    it.effect("uses github for unmapped org even when defaultOrg maps to gitlab", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          AcmeSoftware: "gitlab", // defaultOrg maps to gitlab (case-insensitive)
        };

        // When cloning bai/config (bai is not in orgToProvider)
        const result = yield* createRepositoryService().expandToFullGitUrl("bai/config", "acmesoftware", orgToProvider);

        // Should use GitHub, not GitLab
        expect(result).toBe("https://github.com/bai/config");
      }),
    );

    it.effect("treats explicit organization mapping as case-insensitive", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          AcmeSoftware: "gitlab",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("acmesoftware/myrepo", "default-org", orgToProvider);

        expect(result).toBe("https://gitlab.com/acmesoftware/myrepo");
      }),
    );

    it.effect("matches mixed-case explicit org against lowercase mapping without rewriting org casing", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          acmesoftware: "gitlab",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("AcMeSoftware/myrepo", "default-org", orgToProvider);

        expect(result).toBe("https://gitlab.com/AcMeSoftware/myrepo");
      }),
    );

    it.effect("matches mixed-case default org against lowercase mapping without rewriting org casing", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          acmesoftware: "gitlab",
        };

        const result = yield* createRepositoryService().expandToFullGitUrl("myrepo", "AcmeSoftware", orgToProvider);

        expect(result).toBe("https://gitlab.com/AcmeSoftware/myrepo");
      }),
    );
  });

  describe("parseFullUrlToRepository", () => {
    it.effect("parses full HTTP URL into repository model", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().parseFullUrlToRepository("http://github.com/myorg/myrepo.git");

        expect(result).toEqual({
          name: "myrepo",
          organization: "myorg",
          provider: {
            name: "github",
            baseUrl: "https://github.com",
          },
          cloneUrl: "http://github.com/myorg/myrepo.git",
        });
      }),
    );

    it.effect("parses full HTTPS URL into repository model", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().parseFullUrlToRepository("https://github.com/myorg/myrepo.git");

        expect(result).toEqual({
          name: "myrepo",
          organization: "myorg",
          provider: {
            name: "github",
            baseUrl: "https://github.com",
          },
          cloneUrl: "https://github.com/myorg/myrepo.git",
        });
      }),
    );

    it.effect("parses full git:// URL into repository model", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().parseFullUrlToRepository("git://github.com/myorg/myrepo.git");

        expect(result).toEqual({
          name: "myrepo",
          organization: "myorg",
          provider: {
            name: "github",
            baseUrl: "https://github.com",
          },
          cloneUrl: "git://github.com/myorg/myrepo.git",
        });
      }),
    );

    it.effect("parses full git+ssh:// URL into repository model", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().parseFullUrlToRepository("git+ssh://git@github.com/myorg/myrepo.git");

        expect(result).toEqual({
          name: "myrepo",
          organization: "myorg",
          provider: {
            name: "github",
            baseUrl: "https://github.com",
          },
          cloneUrl: "git+ssh://git@github.com/myorg/myrepo.git",
        });
      }),
    );

    it.effect("parses full ssh:// URL into repository model", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().parseFullUrlToRepository("ssh://git@github.com/myorg/myrepo.git");

        expect(result).toEqual({
          name: "myrepo",
          organization: "myorg",
          provider: {
            name: "github",
            baseUrl: "https://github.com",
          },
          cloneUrl: "ssh://git@github.com/myorg/myrepo.git",
        });
      }),
    );

    it.effect("parses full SSH URL into repository model", () =>
      Effect.gen(function* () {
        const result = yield* createRepositoryService().parseFullUrlToRepository("git@gitlab.com:mygroup/myproject.git");

        expect(result).toEqual({
          name: "myproject",
          organization: "mygroup",
          provider: {
            name: "gitlab",
            baseUrl: "https://gitlab.com",
          },
          cloneUrl: "git@gitlab.com:mygroup/myproject.git",
        });
      }),
    );

    it.effect("fails for invalid URL format", () =>
      Effect.gen(function* () {
        const result = yield* Effect.exit(createRepositoryService().parseFullUrlToRepository("not-a-valid-url"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );
  });

  describe("isFullUrl", () => {
    vitestIt("returns true for HTTP URLs", () => {
      expect(isFullUrl("http://github.com/myorg/myrepo.git")).toBe(true);
    });

    vitestIt("returns true for HTTPS URLs", () => {
      expect(isFullUrl("https://github.com/myorg/myrepo.git")).toBe(true);
    });

    vitestIt("returns true for git:// URLs", () => {
      expect(isFullUrl("git://github.com/myorg/myrepo.git")).toBe(true);
    });

    vitestIt("returns true for git+ssh:// URLs", () => {
      expect(isFullUrl("git+ssh://git@github.com/myorg/myrepo.git")).toBe(true);
    });

    vitestIt("returns true for ssh:// URLs", () => {
      expect(isFullUrl("ssh://git@github.com/myorg/myrepo.git")).toBe(true);
    });

    vitestIt("returns true for scp-style SSH URLs", () => {
      expect(isFullUrl("git@github.com:myorg/myrepo.git")).toBe(true);
    });

    vitestIt("returns false for org/repo inputs", () => {
      expect(isFullUrl("myorg/myrepo")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it.effect("handles git:// protocol URLs", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git://github.com/myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("handles http:// protocol URLs", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("http://github.com/myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("handles enterprise GitHub URLs", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git@github.enterprise.com:myorg/myrepo.git");

        expect(result).toBe("/home/user/dev/github.enterprise.com/myorg/myrepo");
      }),
    );

    it.effect("handles deeply nested repository paths", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("https://gitlab.com/group/subgroup/project.git");

        expect(result).toBe("/home/user/dev/gitlab.com/group/subgroup");
      }),
    );

    it.effect("handles SSH URLs with dots in repository name", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* repositoryService.parseRepoUrlToPath("git@github.com:foo/my.repo.git");

        expect(result).toBe("/home/user/dev/github.com/foo/my.repo");
      }),
    );

    it.effect("fails with empty string", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath(""));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for malformed SSH URL without username", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("@github.com:foo/repo.git"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for malformed SSH URL without host", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("git@:foo/repo.git"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for SSH URL with missing org", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("git@github.com:repo.git"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for SSH URL with missing repo", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("git@github.com:foo/"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );

    it.effect("fails for URL with empty path segments", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();
        const result = yield* Effect.exit(repositoryService.parseRepoUrlToPath("https://github.com//"));

        expect(Exit.isFailure(result)).toBe(true);
      }),
    );
  });

  describe("integration: expandToFullGitUrl and parseRepoUrlToPath", () => {
    it.effect("handles simple repo name clone", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* repositoryService.expandToFullGitUrl("myrepo", defaultOrg, orgToProvider);
        const localPath = yield* repositoryService.parseRepoUrlToPath(fullUrl);

        expect(fullUrl).toBe("https://github.com/myorg/myrepo");
        expect(localPath).toBe("/home/user/dev/github.com/myorg/myrepo");
      }),
    );

    it.effect("handles org/repo clone", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* repositoryService.expandToFullGitUrl("someorg/myrepo", defaultOrg, orgToProvider);
        const localPath = yield* repositoryService.parseRepoUrlToPath(fullUrl);

        expect(fullUrl).toBe("https://github.com/someorg/myrepo");
        expect(localPath).toBe("/home/user/dev/github.com/someorg/myrepo");
      }),
    );

    it.effect("handles GitLab org/repo clone", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* repositoryService.expandToFullGitUrl("gitlab-org/myrepo", defaultOrg, orgToProvider);
        const localPath = yield* repositoryService.parseRepoUrlToPath(fullUrl);

        expect(fullUrl).toBe("https://gitlab.com/gitlab-org/myrepo");
        expect(localPath).toBe("/home/user/dev/gitlab.com/gitlab-org/myrepo");
      }),
    );

    it.effect("handles forced GitLab provider", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* repositoryService.expandToFullGitUrl("myrepo", defaultOrg, orgToProvider, "gitlab");
        const localPath = yield* repositoryService.parseRepoUrlToPath(fullUrl);

        expect(fullUrl).toBe("https://gitlab.com/myorg/myrepo");
        expect(localPath).toBe("/home/user/dev/gitlab.com/myorg/myrepo");
      }),
    );

    it.effect("handles forced GitHub provider with GitLab org", () =>
      Effect.gen(function* () {
        const repositoryService = createRepositoryService();

        const defaultOrg = "myorg";
        const orgToProvider: Record<string, GitProviderType> = {
          "gitlab-org": "gitlab",
        };

        const fullUrl = yield* repositoryService.expandToFullGitUrl("gitlab-org/myrepo", defaultOrg, orgToProvider, "github");
        const localPath = yield* repositoryService.parseRepoUrlToPath(fullUrl);

        expect(fullUrl).toBe("https://github.com/gitlab-org/myrepo");
        expect(localPath).toBe("/home/user/dev/github.com/gitlab-org/myrepo");
      }),
    );
  });
});
