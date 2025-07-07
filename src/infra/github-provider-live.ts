import { Effect, Layer } from "effect";

import { gitHubRepoToRepository, parseGitHubRepo, parseGitHubSearchResponse } from "../domain/api-schemas";
import { networkError, unknownError, type NetworkError, type UnknownError } from "../domain/errors";
import type { GitProvider, Repository } from "../domain/models";
import { NetworkPortTag, type NetworkPort } from "../domain/network-port";
import { RepoProviderPortTag, type RepoProviderPort } from "../domain/repo-provider-port";

// Factory function that creates GitHubProvider with dependencies
export const makeGitHubProvider = (network: NetworkPort, defaultOrg = "octocat"): RepoProviderPort => {
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
      Effect.flatMap((response): Effect.Effect<Repository, NetworkError | UnknownError> => {
        if (response.status === 404) {
          return Effect.fail(networkError(`Repository ${organization}/${name} not found`));
        }
        if (response.status !== 200) {
          return Effect.fail(networkError(`GitHub API error: ${response.status} ${response.statusText}`));
        }

        return Effect.try({
          try: () => {
            const data = JSON.parse(response.body);
            const parseResult = parseGitHubRepo(data);
            
            if (!parseResult.success) {
              throw new Error(parseResult.error);
            }
            
            return gitHubRepoToRepository(parseResult.data, provider as { name: "github"; baseUrl: string });
          },
          catch: (error) => unknownError(`Failed to parse GitHub repository: ${error}`),
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
            const parseResult = parseGitHubSearchResponse(data);
            
            if (!parseResult.success) {
              throw new Error(parseResult.error);
            }
            
            return parseResult.data.items.map((item) => gitHubRepoToRepository(item, provider as { name: "github"; baseUrl: string }));
          },
          catch: (error) => unknownError(`Failed to parse GitHub search response: ${error}`),
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
export const GitHubProviderLiveLayer = (defaultOrg: string) =>
  Layer.effect(
    RepoProviderPortTag,
    Effect.gen(function* () {
      const network = yield* NetworkPortTag;
      return makeGitHubProvider(network, defaultOrg);
    }),
  );
