import { it } from "@effect/vitest";
import { Effect, Exit } from "effect";
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
      return Effect.succeed(undefined);
    }

    checkConnectivity(_url: string): Effect.Effect<boolean, never, never> {
      return Effect.succeed(true);
    }
  }

  describe("resolveRepository", () => {
    it.effect("resolves repository successfully", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://gitlab.com/api/v4/projects/myorg%2Fmyrepo", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            id: 123,
            name: "myrepo",
            path: "myrepo",
            path_with_namespace: "myorg/myrepo",
            namespace: { full_path: "myorg" },
            http_url_to_repo: "https://gitlab.com/myorg/myrepo.git",
            ssh_url_to_repo: "git@gitlab.com:myorg/myrepo.git",
            web_url: "https://gitlab.com/myorg/myrepo",
            description: "Test repository",
            visibility: "public",
          }),
        });

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
        network.setResponse("https://gitlab.com/api/v4/projects/default-org%2Fmyrepo", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            id: 123,
            name: "myrepo",
            path: "myrepo",
            path_with_namespace: "default-org/myrepo",
            namespace: { full_path: "default-org" },
            http_url_to_repo: "https://gitlab.com/default-org/myrepo.git",
            ssh_url_to_repo: "git@gitlab.com:default-org/myrepo.git",
            web_url: "https://gitlab.com/default-org/myrepo",
            description: "Test repository",
            visibility: "public",
          }),
        });

        const provider = makeGitLabProvider(network, "default-org");
        const repository = yield* provider.resolveRepository("myrepo");

        expect(repository.organization).toBe("default-org");
      }),
    );

    it.effect("always succeeds even for non-existent repositories", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        // No network call should be made anymore

        const provider = makeGitLabProvider(network, "default-org");
        const result = yield* provider.resolveRepository("nonexistent", "myorg");

        expect(result.name).toBe("nonexistent");
        expect(result.organization).toBe("myorg");
        expect(result.provider.name).toBe("gitlab");
        expect(result.cloneUrl).toBe("https://gitlab.com/myorg/nonexistent.git");
      }),
    );

    // Note: API error handling tests removed since resolveRepository no longer makes API calls
  });

  describe("searchRepositories", () => {
    it.effect("searches repositories successfully", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://gitlab.com/api/v4/search?search=test&scope=projects", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify([
            {
              id: 1,
              name: "test-repo",
              path: "test-repo",
              path_with_namespace: "myorg/test-repo",
              namespace: { full_path: "myorg" },
              http_url_to_repo: "https://gitlab.com/myorg/test-repo.git",
              ssh_url_to_repo: "git@gitlab.com:myorg/test-repo.git",
              web_url: "https://gitlab.com/myorg/test-repo",
              description: "Test repository",
              visibility: "public",
            },
            {
              id: 2,
              name: "another-test",
              path: "another-test",
              path_with_namespace: "otherorg/another-test",
              namespace: { full_path: "otherorg" },
              http_url_to_repo: "https://gitlab.com/otherorg/another-test.git",
              ssh_url_to_repo: "git@gitlab.com:otherorg/another-test.git",
              web_url: "https://gitlab.com/otherorg/another-test",
              description: "Another test repository",
              visibility: "public",
            },
          ]),
        });

        const provider = makeGitLabProvider(network, "default-org");
        const repositories = yield* provider.searchRepositories("test");

        expect(repositories).toHaveLength(2);
        expect(repositories[0]?.name).toBe("test-repo");
        expect(repositories[0]?.organization).toBe("myorg");
        expect(repositories[1]?.name).toBe("another-test");
        expect(repositories[1]?.organization).toBe("otherorg");
      }),
    );

    it.effect("filters search results by organization", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://gitlab.com/api/v4/search?search=test&scope=projects", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify([
            {
              id: 1,
              name: "test-repo",
              path: "test-repo",
              path_with_namespace: "myorg/test-repo",
              namespace: { full_path: "myorg" },
              http_url_to_repo: "https://gitlab.com/myorg/test-repo.git",
              ssh_url_to_repo: "git@gitlab.com:myorg/test-repo.git",
              web_url: "https://gitlab.com/myorg/test-repo",
              description: "Test repository",
              visibility: "public",
            },
            {
              id: 2,
              name: "another-test",
              path: "another-test",
              path_with_namespace: "otherorg/another-test",
              namespace: { full_path: "otherorg" },
              http_url_to_repo: "https://gitlab.com/otherorg/another-test.git",
              ssh_url_to_repo: "git@gitlab.com:otherorg/another-test.git",
              web_url: "https://gitlab.com/otherorg/another-test",
              description: "Another test repository",
              visibility: "public",
            },
          ]),
        });

        const provider = makeGitLabProvider(network, "default-org");
        const repositories = yield* provider.searchRepositories("test", "myorg");

        expect(repositories).toHaveLength(1);
        expect(repositories[0]?.name).toBe("test-repo");
        expect(repositories[0]?.organization).toBe("myorg");
      }),
    );

    it.effect("handles search API errors", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://gitlab.com/api/v4/search?search=test&scope=projects", {
          status: 401,
          statusText: "Unauthorized",
          body: "",
        });

        const provider = makeGitLabProvider(network, "default-org");
        const result = yield* Effect.exit(provider.searchRepositories("test"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("NetworkError");
          expect(error?.reason).toContain("GitLab search API error: 401");
        }
      }),
    );

    it.effect("handles malformed JSON response", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://gitlab.com/api/v4/search?search=test&scope=projects", {
          status: 200,
          statusText: "OK",
          body: "invalid json",
        });

        const provider = makeGitLabProvider(network, "default-org");
        const result = yield* Effect.exit(provider.searchRepositories("test"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("UnknownError");
          expect(String(error?.reason)).toContain("Failed to parse GitLab search response");
        }
      }),
    );

    it.effect("handles invalid schema in API response", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://gitlab.com/api/v4/search?search=test&scope=projects", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify([
            {
              id: "not-a-number", // Schema expects number
              name: "test-repo",
              // Missing required fields: path, path_with_namespace, namespace, etc.
            },
          ]),
        });

        const provider = makeGitLabProvider(network, "default-org");
        const result = yield* Effect.exit(provider.searchRepositories("test"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("UnknownError");
          expect(String(error?.reason)).toContain("Invalid GitLab search response");
        }
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
