import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { makeGitLabProvider } from "~/capabilities/repositories/adapters/gitlab-provider-live";
import type { GitProvider } from "~/core/models";

describe("gitlab-provider-live", () => {
  describe("resolveRepository", () => {
    it.effect("resolves repository successfully", () =>
      Effect.gen(function* () {
        const provider = makeGitLabProvider("default-org");
        const repository = yield* provider.resolveRepository("myrepo", "myorg");

        expect(repository.name).toBe("myrepo");
        expect(repository.organization).toBe("myorg");
        expect(repository.provider.name).toBe("gitlab");
        expect(repository.provider.baseUrl).toBe("https://gitlab.com");
        expect(repository.cloneUrl).toBe("https://gitlab.com/myorg/myrepo.git");
      }),
    );

    it.effect("uses default org when not specified", () =>
      Effect.gen(function* () {
        const provider = makeGitLabProvider("default-org");
        const repository = yield* provider.resolveRepository("myrepo");

        expect(repository.organization).toBe("default-org");
      }),
    );

    it.effect("always succeeds even for non-existent repositories", () =>
      Effect.gen(function* () {
        const provider = makeGitLabProvider("default-org");
        const result = yield* provider.resolveRepository("nonexistent", "myorg");

        expect(result.name).toBe("nonexistent");
        expect(result.organization).toBe("myorg");
        expect(result.provider.name).toBe("gitlab");
        expect(result.cloneUrl).toBe("https://gitlab.com/myorg/nonexistent.git");
      }),
    );
  });

  describe("getDefaultOrg", () => {
    it.effect("returns configured default org", () =>
      Effect.sync(() => {
        const provider = makeGitLabProvider("my-default-org");

        expect(provider.getDefaultOrg()).toBe("my-default-org");
      }),
    );
  });

  describe("getProvider", () => {
    it.effect("returns GitLab provider info", () =>
      Effect.sync(() => {
        const provider = makeGitLabProvider("default-org");

        const providerInfo: GitProvider = provider.getProvider();
        expect(providerInfo.name).toBe("gitlab");
        expect(providerInfo.baseUrl).toBe("https://gitlab.com");
      }),
    );
  });
});
