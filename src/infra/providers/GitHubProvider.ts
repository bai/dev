import { Effect, Layer } from "effect";

import { networkError, unknownError, type NetworkError, type UnknownError } from "../../domain/errors";
import type { GitProvider, Repository } from "../../domain/models";
import { NetworkService, type Network } from "../../domain/ports/Network";
import { RepoProviderService, type RepoProvider } from "../../domain/ports/RepoProvider";

// Factory function that creates GitHubProvider with dependencies
export const makeGitHubProvider = (network: Network, defaultOrg = "octocat"): RepoProvider => {
  const provider: GitProvider = {
    name: "github",
    baseUrl: "https://github.com",
  };

  // Individual functions implementing the service methods
  const resolveRepository = (name: string, org?: string): Effect.Effect<Repository, NetworkError | UnknownError> => {
    const organization = org || defaultOrg;
    const cloneUrl = `${provider.baseUrl}/${organization}/${name}.git`;

    // Verify repository exists by checking the API
    const apiUrl = `https://api.github.com/repos/${organization}/${name}`;

    return network.get(apiUrl).pipe(
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
          provider,
          cloneUrl,
        });
      }),
    );
  };

  const getDefaultOrg = (): string => defaultOrg;

  const getProvider = (): GitProvider => provider;

  const searchRepositories = (
    query: string,
    org?: string,
  ): Effect.Effect<Repository[], NetworkError | UnknownError> => {
    const searchQuery = org ? `${query} org:${org}` : query;
    const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}`;

    return network.get(apiUrl).pipe(
      Effect.flatMap((response): Effect.Effect<Repository[], NetworkError | UnknownError> => {
        if (response.status !== 200) {
          return Effect.fail(networkError(`GitHub search API error: ${response.status} ${response.statusText}`));
        }

        return Effect.try({
          try: () => {
            const data = JSON.parse(response.body);
            const repositories: Repository[] = data.items.map((item: any) => ({
              name: item.name,
              organization: item.owner.login,
              provider,
              cloneUrl: item.clone_url,
            }));
            return repositories;
          },
          catch: (error) => unknownError(`Failed to parse GitHub API response: ${error}`),
        });
      }),
    );
  };

  return {
    resolveRepository,
    getDefaultOrg,
    getProvider,
    searchRepositories,
  };
};

// Effect Layer for dependency injection using factory function
export const GitHubProviderLayer = (defaultOrg: string) =>
  Layer.effect(
    RepoProviderService,
    Effect.gen(function* () {
      const network = yield* NetworkService;
      return makeGitHubProvider(network, defaultOrg);
    }),
  );
