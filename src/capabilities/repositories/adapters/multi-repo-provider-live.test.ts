import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { makeMultiRepoProvider, MultiRepoProviderLiveLayer } from "~/capabilities/repositories/adapters/multi-repo-provider-live";
import { RepoProvider } from "~/capabilities/repositories/repo-provider-port";
import type { GitProviderType } from "~/core/models";

describe("multi-repo-provider-live", () => {
  describe("makeMultiRepoProvider", () => {
    it("creates a MultiRepoProvider with correct configuration", () => {
      const provider = makeMultiRepoProvider("acmesoftware", "github", { acmesoftware: "gitlab" });

      expect(provider.getDefaultOrg()).toBe("acmesoftware");
    });

    it("returns default provider info when no mapping for default org", () => {
      const provider = makeMultiRepoProvider("someorg", "github", {});

      const providerInfo = provider.getProvider();
      expect(providerInfo.name).toBe("github");
      expect(providerInfo.baseUrl).toBe("https://github.com");
    });

    it("returns mapped provider info for default org", () => {
      const provider = makeMultiRepoProvider("acmesoftware", "github", { acmesoftware: "gitlab" });

      const providerInfo = provider.getProvider();
      expect(providerInfo.name).toBe("gitlab");
      expect(providerInfo.baseUrl).toBe("https://gitlab.com");
    });
  });

  describe("resolveRepository", () => {
    it.effect("resolves repository with no org using default org and its mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("acmesoftware", "github", {
          acmesoftware: "gitlab",
        });

        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("acmesoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/acmesoftware/test-repo.git");
      }),
    );

    it.effect("resolves repository with explicit org that has mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", { acmesoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo", "acmesoftware");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("acmesoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/acmesoftware/test-repo.git");
      }),
    );

    it.effect("resolves repository with explicit org that has no mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", { acmesoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo", "octocat");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("octocat");
        expect(repository.provider.name).toBe("github");
        expect(repository.cloneUrl).toBe("https://github.com/octocat/test-repo.git");
      }),
    );

    it.effect("resolves repository with explicit org using default provider when no mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "gitlab", {});

        const repository = yield* provider.resolveRepository("test-repo", "someorg");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("someorg");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/someorg/test-repo.git");
      }),
    );

    it.effect("resolves repository with default org when no mapping and default provider", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", {});

        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("defaultorg");
        expect(repository.provider.name).toBe("github");
        expect(repository.cloneUrl).toBe("https://github.com/defaultorg/test-repo.git");
      }),
    );
  });

  describe("provider selection logic", () => {
    it("selects GitHub provider when org not in mapping and default is github", () => {
      const provider = makeMultiRepoProvider("defaultorg", "github", { acmesoftware: "gitlab" });

      // Test internal provider selection by checking the result
      const result = provider.getProvider();
      expect(result.name).toBe("github");
    });

    it("selects GitLab provider when org not in mapping and default is gitlab", () => {
      const provider = makeMultiRepoProvider("defaultorg", "gitlab", { acmesoftware: "github" });

      const result = provider.getProvider();
      expect(result.name).toBe("gitlab");
    });

    it("selects GitLab provider when default org is mapped to gitlab", () => {
      const provider = makeMultiRepoProvider("acmesoftware", "github", { AcmeSoftware: "gitlab" });

      const result = provider.getProvider();
      expect(result.name).toBe("gitlab");
    });

    it("selects GitHub provider when default org is mapped to github", () => {
      const provider = makeMultiRepoProvider("acmesoftware", "gitlab", { AcmeSoftware: "github" });

      const result = provider.getProvider();
      expect(result.name).toBe("github");
    });
  });

  describe("MultiRepoProviderLiveLayer", () => {
    it.effect("provides MultiRepoProvider through Effect layer", () => {
      const providerLayer = MultiRepoProviderLiveLayer("acmesoftware", "github", { acmesoftware: "gitlab" });

      return Effect.gen(function* () {
        const provider = yield* RepoProvider;

        expect(provider.getDefaultOrg()).toBe("acmesoftware");

        const providerInfo = provider.getProvider();
        expect(providerInfo.name).toBe("gitlab");
      }).pipe(Effect.provide(providerLayer));
    });

    it.effect("resolves repository through layer-provided instance", () => {
      const providerLayer = MultiRepoProviderLiveLayer("acmesoftware", "github", { acmesoftware: "gitlab" });

      return Effect.gen(function* () {
        const provider = yield* RepoProvider;
        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("acmesoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/acmesoftware/test-repo.git");
      }).pipe(Effect.provide(providerLayer));
    });
  });

  describe("edge cases", () => {
    it.effect("handles empty orgToProvider mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", {});

        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.organization).toBe("defaultorg");
        expect(repository.provider.name).toBe("github");
      }),
    );

    it.effect("handles complex orgToProvider mapping", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "acmesoftware": "gitlab",
          "octocat": "github",
          "gitlab-org": "gitlab",
          "microsoft": "github",
        };

        const provider = makeMultiRepoProvider("acmesoftware", "github", orgToProvider);

        // Test different orgs
        const repo1 = yield* provider.resolveRepository("test1", "acmesoftware");
        expect(repo1.provider.name).toBe("gitlab");

        const repo2 = yield* provider.resolveRepository("test2", "octocat");
        expect(repo2.provider.name).toBe("github");

        const repo3 = yield* provider.resolveRepository("test3", "gitlab-org");
        expect(repo3.provider.name).toBe("gitlab");

        const repo4 = yield* provider.resolveRepository("test4", "microsoft");
        expect(repo4.provider.name).toBe("github");

        // Test unmapped org
        const repo5 = yield* provider.resolveRepository("test5", "someorg");
        expect(repo5.provider.name).toBe("github"); // Should use default
      }),
    );

    it("handles organization mappings case-insensitively for default org", () => {
      const provider = makeMultiRepoProvider("acmesoftware", "github", { AcmeSoftware: "gitlab" });

      const providerInfo = provider.getProvider();
      expect(providerInfo.name).toBe("gitlab");
    });

    it.effect("handles organization mappings case-insensitively for explicit org", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", { AcmeSoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo", "acmesoftware");

        expect(repository.organization).toBe("acmesoftware");
        expect(repository.provider.name).toBe("gitlab");
      }),
    );

    it.effect("matches mixed-case default org against lowercase mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("AcmeSoftware", "github", { acmesoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.organization).toBe("AcmeSoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/AcmeSoftware/test-repo.git");
      }),
    );

    it.effect("matches mixed-case explicit org against lowercase mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", { acmesoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo", "AcMeSoftware");

        expect(repository.organization).toBe("AcMeSoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/AcMeSoftware/test-repo.git");
      }),
    );

    it.effect("preserves repository name casing while resolving provider", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider("defaultorg", "github", { acmesoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("MyRepo", "AcMeSoftware");

        expect(repository.name).toBe("MyRepo");
        expect(repository.organization).toBe("AcMeSoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/AcMeSoftware/MyRepo.git");
      }),
    );
  });
});
