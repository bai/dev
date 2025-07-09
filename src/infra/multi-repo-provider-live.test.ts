import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import type { GitProviderType } from "../domain/models";
import { NetworkTag, type HttpResponse, type Network } from "../domain/network-port";
import { RepoProviderTag } from "../domain/repo-provider-port";
import { makeMultiRepoProvider, MultiRepoProviderLiveLayer } from "./multi-repo-provider-live";

describe("multi-repo-provider-live", () => {
  // Mock Network implementation
  class MockNetwork implements Network {
    get(url: string): Effect.Effect<HttpResponse, never> {
      // Return different responses based on URL to simulate GitHub vs GitLab
      if (url.includes("github.com")) {
        return Effect.succeed({
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            total_count: 0,
            incomplete_results: false,
            items: [],
          }),
          headers: {},
        });
      } else if (url.includes("gitlab.com")) {
        return Effect.succeed({
          status: 200,
          statusText: "OK",
          body: JSON.stringify([]),
          headers: {},
        });
      }

      return Effect.succeed({
        status: 200,
        statusText: "OK",
        body: "[]",
        headers: {},
      });
    }

    downloadFile(_url: string, _destinationPath: string): Effect.Effect<void, never> {
      return Effect.succeed(undefined);
    }

    checkConnectivity(_url: string): Effect.Effect<boolean> {
      return Effect.succeed(true);
    }
  }

  const mockNetwork = new MockNetwork();

  describe("makeMultiRepoProvider", () => {
    it("creates a MultiRepoProvider with correct configuration", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "flywheelsoftware", "github", { flywheelsoftware: "gitlab" });

      expect(provider.getDefaultOrg()).toBe("flywheelsoftware");
    });

    it("returns default provider info when no mapping for default org", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "someorg", "github", {});

      const providerInfo = provider.getProvider();
      expect(providerInfo.name).toBe("github");
      expect(providerInfo.baseUrl).toBe("https://github.com");
    });

    it("returns mapped provider info for default org", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "flywheelsoftware", "github", { flywheelsoftware: "gitlab" });

      const providerInfo = provider.getProvider();
      expect(providerInfo.name).toBe("gitlab");
      expect(providerInfo.baseUrl).toBe("https://gitlab.com");
    });
  });

  describe("resolveRepository", () => {
    it.effect("resolves repository with no org using default org and its mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider(mockNetwork, "flywheelsoftware", "github", {
          flywheelsoftware: "gitlab",
        });

        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("flywheelsoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/flywheelsoftware/test-repo.git");
      }),
    );

    it.effect("resolves repository with explicit org that has mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "github", { flywheelsoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo", "flywheelsoftware");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("flywheelsoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/flywheelsoftware/test-repo.git");
      }),
    );

    it.effect("resolves repository with explicit org that has no mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "github", { flywheelsoftware: "gitlab" });

        const repository = yield* provider.resolveRepository("test-repo", "octocat");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("octocat");
        expect(repository.provider.name).toBe("github");
        expect(repository.cloneUrl).toBe("https://github.com/octocat/test-repo.git");
      }),
    );

    it.effect("resolves repository with explicit org using default provider when no mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "gitlab", {});

        const repository = yield* provider.resolveRepository("test-repo", "someorg");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("someorg");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/someorg/test-repo.git");
      }),
    );

    it.effect("resolves repository with default org when no mapping and default provider", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "github", {});

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
      const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "github", { flywheelsoftware: "gitlab" });

      // Test internal provider selection by checking the result
      const result = provider.getProvider();
      expect(result.name).toBe("github");
    });

    it("selects GitLab provider when org not in mapping and default is gitlab", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "gitlab", { flywheelsoftware: "github" });

      const result = provider.getProvider();
      expect(result.name).toBe("gitlab");
    });

    it("selects GitLab provider when default org is mapped to gitlab", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "flywheelsoftware", "github", { flywheelsoftware: "gitlab" });

      const result = provider.getProvider();
      expect(result.name).toBe("gitlab");
    });

    it("selects GitHub provider when default org is mapped to github", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "flywheelsoftware", "gitlab", { flywheelsoftware: "github" });

      const result = provider.getProvider();
      expect(result.name).toBe("github");
    });
  });

  describe("MultiRepoProviderLiveLayer", () => {
    it.effect("provides MultiRepoProvider through Effect layer", () => {
      const networkLayer = Layer.succeed(NetworkTag, mockNetwork);
      const providerLayer = Layer.provide(
        MultiRepoProviderLiveLayer("flywheelsoftware", "github", { flywheelsoftware: "gitlab" }),
        networkLayer,
      );

      return Effect.gen(function* () {
        const provider = yield* RepoProviderTag;

        expect(provider.getDefaultOrg()).toBe("flywheelsoftware");

        const providerInfo = provider.getProvider();
        expect(providerInfo.name).toBe("gitlab");
      }).pipe(Effect.provide(providerLayer));
    });

    it.effect("resolves repository through layer-provided instance", () => {
      const networkLayer = Layer.succeed(NetworkTag, mockNetwork);
      const providerLayer = Layer.provide(
        MultiRepoProviderLiveLayer("flywheelsoftware", "github", { flywheelsoftware: "gitlab" }),
        networkLayer,
      );

      return Effect.gen(function* () {
        const provider = yield* RepoProviderTag;
        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.name).toBe("test-repo");
        expect(repository.organization).toBe("flywheelsoftware");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.cloneUrl).toBe("https://gitlab.com/flywheelsoftware/test-repo.git");
      }).pipe(Effect.provide(providerLayer));
    });
  });

  describe("edge cases", () => {
    it.effect("handles empty orgToProvider mapping", () =>
      Effect.gen(function* () {
        const provider = makeMultiRepoProvider(mockNetwork, "defaultorg", "github", {});

        const repository = yield* provider.resolveRepository("test-repo");

        expect(repository.organization).toBe("defaultorg");
        expect(repository.provider.name).toBe("github");
      }),
    );

    it.effect("handles complex orgToProvider mapping", () =>
      Effect.gen(function* () {
        const orgToProvider: Record<string, GitProviderType> = {
          "flywheelsoftware": "gitlab",
          "octocat": "github",
          "gitlab-org": "gitlab",
          "microsoft": "github",
        };

        const provider = makeMultiRepoProvider(mockNetwork, "flywheelsoftware", "github", orgToProvider);

        // Test different orgs
        const repo1 = yield* provider.resolveRepository("test1", "flywheelsoftware");
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

    it("handles case sensitivity in org names", () => {
      const provider = makeMultiRepoProvider(mockNetwork, "FlywheelSoftware", "github", { flywheelsoftware: "gitlab" });

      // Should not match due to case difference
      const providerInfo = provider.getProvider();
      expect(providerInfo.name).toBe("github"); // Should use default, not mapping
    });
  });
});
