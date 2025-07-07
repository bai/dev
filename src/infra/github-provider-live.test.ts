import { it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { describe, expect } from "vitest";

import type { GitProvider } from "../domain/models";
import type { HttpResponse, NetworkPort } from "../domain/network-port";
import { makeGitHubProvider } from "./github-provider-live";

describe("github-provider-live", () => {
  // Mock NetworkPort implementation
  class MockNetwork implements NetworkPort {
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
        network.setResponse("https://api.github.com/repos/myorg/myrepo", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            id: 123,
            name: "myrepo",
            full_name: "myorg/myrepo",
            owner: { login: "myorg" },
            clone_url: "https://github.com/myorg/myrepo.git",
            ssh_url: "git@github.com:myorg/myrepo.git",
            html_url: "https://github.com/myorg/myrepo",
            description: "Test repository",
            private: false,
          }),
        });

        const provider = makeGitHubProvider(network, "default-org");
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
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/repos/octocat/myrepo", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            id: 123,
            name: "myrepo",
            full_name: "octocat/myrepo",
            owner: { login: "octocat" },
            clone_url: "https://github.com/octocat/myrepo.git",
            ssh_url: "git@github.com:octocat/myrepo.git",
            html_url: "https://github.com/octocat/myrepo",
            description: "Test repository",
            private: false,
          }),
        });

        const provider = makeGitHubProvider(network, "octocat");
        const repository = yield* provider.resolveRepository("myrepo");

        expect(repository.organization).toBe("octocat");
      }),
    );

    it.effect("fails when repository not found", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/repos/myorg/nonexistent", {
          status: 404,
          statusText: "Not Found",
          body: JSON.stringify({ message: "Not Found" }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const result = yield* Effect.exit(provider.resolveRepository("nonexistent", "myorg"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("NetworkError");
          expect(error?.reason).toContain("Repository myorg/nonexistent not found");
        }
      }),
    );

    it.effect("handles API errors", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/repos/myorg/myrepo", {
          status: 500,
          statusText: "Internal Server Error",
          body: "",
        });

        const provider = makeGitHubProvider(network, "default-org");
        const result = yield* Effect.exit(provider.resolveRepository("myrepo", "myorg"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("NetworkError");
          expect(error?.reason).toContain("GitHub API error: 500");
        }
      }),
    );

    it.effect("handles rate limit errors", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/repos/myorg/myrepo", {
          status: 403,
          statusText: "Forbidden",
          body: JSON.stringify({ message: "API rate limit exceeded" }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const result = yield* Effect.exit(provider.resolveRepository("myrepo", "myorg"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("NetworkError");
          expect(error?.reason).toContain("GitHub API error: 403");
        }
      }),
    );
  });

  describe("searchRepositories", () => {
    it.effect("searches repositories successfully", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/search/repositories?q=test", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            total_count: 2,
            items: [
              {
                id: 1,
                name: "test-repo",
                full_name: "myorg/test-repo",
                owner: { login: "myorg" },
                clone_url: "https://github.com/myorg/test-repo.git",
                ssh_url: "git@github.com:myorg/test-repo.git",
                html_url: "https://github.com/myorg/test-repo",
                description: "Test repository",
                private: false,
              },
              {
                id: 2,
                name: "another-test",
                full_name: "otherorg/another-test",
                owner: { login: "otherorg" },
                clone_url: "https://github.com/otherorg/another-test.git",
                ssh_url: "git@github.com:otherorg/another-test.git",
                html_url: "https://github.com/otherorg/another-test",
                description: "Another test repository",
                private: false,
              },
            ],
          }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const repositories = yield* provider.searchRepositories("test");

        expect(repositories).toHaveLength(2);
        expect(repositories[0]?.name).toBe("test-repo");
        expect(repositories[0]?.organization).toBe("myorg");
        expect(repositories[1]?.name).toBe("another-test");
        expect(repositories[1]?.organization).toBe("otherorg");
      }),
    );

    it.effect("searches with organization filter", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/search/repositories?q=test%20org%3Amyorg", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            total_count: 1,
            items: [
              {
                id: 1,
                name: "test-repo",
                full_name: "myorg/test-repo",
                owner: { login: "myorg" },
                clone_url: "https://github.com/myorg/test-repo.git",
                ssh_url: "git@github.com:myorg/test-repo.git",
                html_url: "https://github.com/myorg/test-repo",
                description: "Test repository",
                private: false,
              },
            ],
          }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const repositories = yield* provider.searchRepositories("test", "myorg");

        expect(repositories).toHaveLength(1);
        expect(repositories[0]?.name).toBe("test-repo");
        expect(repositories[0]?.organization).toBe("myorg");
      }),
    );

    it.effect("handles empty search results", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/search/repositories?q=veryrandomquery", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            total_count: 0,
            items: [],
          }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const repositories = yield* provider.searchRepositories("veryrandomquery");

        expect(repositories).toHaveLength(0);
      }),
    );

    it.effect("handles search API errors", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/search/repositories?q=test", {
          status: 422,
          statusText: "Unprocessable Entity",
          body: JSON.stringify({ message: "Validation Failed" }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const result = yield* Effect.exit(provider.searchRepositories("test"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("NetworkError");
          expect(error?.reason).toContain("GitHub search API error: 422");
        }
      }),
    );

    it.effect("handles malformed JSON response", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/search/repositories?q=test", {
          status: 200,
          statusText: "OK",
          body: "invalid json",
        });

        const provider = makeGitHubProvider(network, "default-org");
        const result = yield* Effect.exit(provider.searchRepositories("test"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("UnknownError");
          expect(String(error?.reason)).toContain("Failed to parse GitHub search response");
        }
      }),
    );

    it.effect("handles invalid schema in API response", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        network.setResponse("https://api.github.com/search/repositories?q=test", {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            total_count: 1,
            items: [
              {
                id: "not-a-number", // Schema expects number
                name: "test-repo",
                // Missing required fields: full_name, owner, clone_url, etc.
              },
            ],
          }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const result = yield* Effect.exit(provider.searchRepositories("test"));

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const error = result.cause._tag === "Fail" ? result.cause.error : null;
          expect(error?._tag).toBe("UnknownError");
          expect(String(error?.reason)).toContain("Invalid GitHub search response");
        }
      }),
    );

    it.effect("encodes special characters in search query", () =>
      Effect.gen(function* () {
        const network = new MockNetwork();
        const searchQuery = "test language:typescript stars:>100";
        const encodedQuery = encodeURIComponent(searchQuery);
        network.setResponse(`https://api.github.com/search/repositories?q=${encodedQuery}`, {
          status: 200,
          statusText: "OK",
          body: JSON.stringify({
            total_count: 1,
            items: [
              {
                id: 1,
                name: "typescript-test",
                full_name: "tsorg/typescript-test",
                owner: { login: "tsorg" },
                clone_url: "https://github.com/tsorg/typescript-test.git",
                ssh_url: "git@github.com:tsorg/typescript-test.git",
                html_url: "https://github.com/tsorg/typescript-test",
                description: "TypeScript test repository",
                private: false,
              },
            ],
          }),
        });

        const provider = makeGitHubProvider(network, "default-org");
        const repositories = yield* provider.searchRepositories(searchQuery);

        expect(repositories).toHaveLength(1);
        expect(repositories[0]?.name).toBe("typescript-test");
      }),
    );
  });

  describe("getDefaultOrg", () => {
    it.effect("returns configured default org", () =>
      Effect.sync(() => {
        const network = new MockNetwork();
        const provider = makeGitHubProvider(network, "my-default-org");

        expect(provider.getDefaultOrg()).toBe("my-default-org");
      }),
    );

    it.effect("returns octocat when no default specified", () =>
      Effect.sync(() => {
        const network = new MockNetwork();
        const provider = makeGitHubProvider(network);

        expect(provider.getDefaultOrg()).toBe("octocat");
      }),
    );
  });

  describe("getProvider", () => {
    it.effect("returns GitHub provider info", () =>
      Effect.sync(() => {
        const network = new MockNetwork();
        const provider = makeGitHubProvider(network, "default-org");

        const providerInfo: GitProvider = provider.getProvider();
        expect(providerInfo.name).toBe("github");
        expect(providerInfo.baseUrl).toBe("https://github.com");
      }),
    );
  });
});
