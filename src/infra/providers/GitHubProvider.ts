import { Effect, Layer } from "effect";

import { networkError, unknownError, type NetworkError, type UnknownError } from "../../domain/errors";
import type { GitProvider, Repository } from "../../domain/models";
import { NetworkService, type Network } from "../../domain/ports/Network";
import { RepoProviderService, type RepoProvider } from "../../domain/ports/RepoProvider";

export class GitHubProvider implements RepoProvider {
  private provider: GitProvider = {
    name: "github",
    baseUrl: "https://github.com",
  };

  constructor(
    private network: Network,
    private defaultOrg = "octocat",
  ) {}

  resolveRepository(name: string, org?: string): Effect.Effect<Repository, NetworkError | UnknownError> {
    const organization = org || this.defaultOrg;
    const cloneUrl = `${this.provider.baseUrl}/${organization}/${name}.git`;

    // Verify repository exists by checking the API
    const apiUrl = `https://api.github.com/repos/${organization}/${name}`;

    return this.network.get(apiUrl).pipe(
      Effect.flatMap((response) => {
        if (response.status === 404) {
          return Effect.fail(networkError(`Repository ${organization}/${name} not found`));
        }
        if (response.status !== 200) {
          return Effect.fail(networkError(`GitHub API error: ${response.status} ${response.statusText}`));
        }

        return Effect.succeed({
          name,
          organization,
          provider: this.provider,
          cloneUrl,
        });
      }),
    );
  }

  getDefaultOrg(): string {
    return this.defaultOrg;
  }

  getProvider(): GitProvider {
    return this.provider;
  }

  searchRepositories(query: string, org?: string): Effect.Effect<Repository[], NetworkError | UnknownError> {
    const searchQuery = org ? `${query} org:${org}` : query;
    const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}`;

    return this.network.get(apiUrl).pipe(
      Effect.flatMap((response): Effect.Effect<Repository[], NetworkError | UnknownError> => {
        if (response.status !== 200) {
          return Effect.fail(networkError(`GitHub search API error: ${response.status} ${response.statusText}`));
        }

        try {
          const data = JSON.parse(response.body);
          const repositories: Repository[] = data.items.map((item: any) => ({
            name: item.name,
            organization: item.owner.login,
            provider: this.provider,
            cloneUrl: item.clone_url,
          }));

          return Effect.succeed(repositories);
        } catch (error) {
          return Effect.fail(unknownError(`Failed to parse GitHub API response: ${error}`));
        }
      }),
    );
  }
}

// Effect Layer for dependency injection
export const GitHubProviderLayer = (defaultOrg: string) =>
  Layer.effect(
    RepoProviderService,
    Effect.gen(function* () {
      const network = yield* NetworkService;
      return new GitHubProvider(network, defaultOrg);
    }),
  );
