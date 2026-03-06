import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { makeGitHubProvider } from "~/capabilities/repositories/adapters/github-provider-live";
import type { GitProvider } from "~/core/models";

describe("github-provider-live", () => {
  describe("resolveRepository", () => {
    it.effect("resolves repository successfully", () =>
      Effect.gen(function* () {
        const provider = makeGitHubProvider("default-org");
        const repository = yield* provider.resolveRepository("myrepo", "myorg");

        expect(repository.name).toBe("myrepo");
        expect(repository.organization).toBe("myorg");
        expect(repository.provider.name).toBe("github");
        expect(repository.provider.baseUrl).toBe("https://github.com");
        expect(repository.cloneUrl).toBe("https://github.com/myorg/myrepo.git");
      }),
    );

    it.effect("uses default org when not specified", () =>
      Effect.gen(function* () {
        const provider = makeGitHubProvider("octocat");
        const repository = yield* provider.resolveRepository("myrepo");

        expect(repository.organization).toBe("octocat");
      }),
    );

    it.effect("always succeeds even for non-existent repositories", () =>
      Effect.gen(function* () {
        const provider = makeGitHubProvider("default-org");
        const result = yield* provider.resolveRepository("nonexistent", "myorg");

        expect(result.name).toBe("nonexistent");
        expect(result.organization).toBe("myorg");
        expect(result.provider.name).toBe("github");
        expect(result.cloneUrl).toBe("https://github.com/myorg/nonexistent.git");
      }),
    );
  });

  describe("getDefaultOrg", () => {
    it.effect("returns configured default org", () =>
      Effect.sync(() => {
        const provider = makeGitHubProvider("my-default-org");

        expect(provider.getDefaultOrg()).toBe("my-default-org");
      }),
    );

    it.effect("returns octocat when no default specified", () =>
      Effect.sync(() => {
        const provider = makeGitHubProvider();

        expect(provider.getDefaultOrg()).toBe("octocat");
      }),
    );
  });

  describe("getProvider", () => {
    it.effect("returns GitHub provider info", () =>
      Effect.sync(() => {
        const provider = makeGitHubProvider("default-org");

        const providerInfo: GitProvider = provider.getProvider();
        expect(providerInfo.name).toBe("github");
        expect(providerInfo.baseUrl).toBe("https://github.com");
      }),
    );
  });
});
