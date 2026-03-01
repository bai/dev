import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { GitProvider } from "../domain/models";
import type { HttpResponse, Network } from "../domain/network-port";
import { makeGitLabProvider } from "./gitlab-provider-live";

describe("gitlab-provider-live", () => {
  // Mock NetworkPort implementation
  class MockNetwork implements Network {
    private responses = new Map<string, { status: number; statusText: string; body: string }>();

    setResponse(url: string, response: { status: number; statusText: string; body: string }): void {
      this.responses.set(url, response);
    }

    get(_url: string, _options?: { headers?: Record<string, string> }): Effect.Effect<HttpResponse, never, never> {
      const response = this.responses.get(_url);
      if (!response) {
        return Effect.succeed({
          status: 404,
          statusText: "Not Found",
          body: "",
          headers: {},
        });
      }
      return Effect.succeed({
        ...response,
        headers: {},
      });
    }

    downloadFile(_url: string, _destinationPath: string): Effect.Effect<void, never, never> {
      return Effect.void;
    }

    checkConnectivity(_url: string): Effect.Effect<boolean, never, never> {
      return Effect.succeed(true);
    }
  }

  describe("resolveRepository", () => {
    it.effect("resolves repository successfully", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();

        const provider = makeGitLabProvider(network, "default-org");
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
        const network = new MockNetwork();

        const provider = makeGitLabProvider(network, "default-org");
        const repository = yield* provider.resolveRepository("myrepo");

        expect(repository.organization).toBe("default-org");
      }),
    );

    it.effect("always succeeds even for non-existent repositories", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();

        const provider = makeGitLabProvider(network, "default-org");
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
        const network = new MockNetwork();
        const provider = makeGitLabProvider(network, "my-default-org");

        expect(provider.getDefaultOrg()).toBe("my-default-org");
      }),
    );
  });

  describe("getProvider", () => {
    it.effect("returns GitLab provider info", () =>
      Effect.sync(() => {
        const network = new MockNetwork();
        const provider = makeGitLabProvider(network, "default-org");

        const providerInfo: GitProvider = provider.getProvider();
        expect(providerInfo.name).toBe("gitlab");
        expect(providerInfo.baseUrl).toBe("https://gitlab.com");
      }),
    );
  });
});
