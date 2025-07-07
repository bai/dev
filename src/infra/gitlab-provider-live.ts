import { Effect, Layer } from "effect";

import { networkError, unknownError, type NetworkError, type UnknownError } from "../domain/errors";
import type { GitProvider, Repository } from "../domain/models";
import { NetworkPortTag, type NetworkPort } from "../domain/network-port";
import { RepoProviderPortTag, type RepoProviderPort } from "../domain/repo-provider-port";

// Factory function that creates GitLabProvider with dependencies
export const makeGitLabProvider = (network: NetworkPort, defaultOrg = "gitlab-org"): RepoProviderPort => {
  const provider: GitProvider = {
    name: "gitlab",
    baseUrl: "https://gitlab.com",
  };

  // Individual functions implementing the service methods
  const resolveRepository = (name: string, org?: string): Effect.Effect<Repository, NetworkError | UnknownError> => {
    const organization = org || defaultOrg;
    const cloneUrl = `${provider.baseUrl}/${organization}/${name}.git`;

    // Verify repository exists by checking the API
    // GitLab API v4 endpoint
    const apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${organization}/${name}`)}`;

    return network.get(apiUrl).pipe(
      Effect.flatMap((response) => {
        if (response.status === 404) {
          return Effect.fail(networkError(`Repository ${organization}/${name} not found`));
        }
        if (response.status !== 200) {
          return Effect.fail(networkError(`GitLab API error: ${response.status} ${response.statusText}`));
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
    // GitLab search API v4
    // If org is provided, we'll filter results by namespace
    const searchParams = new URLSearchParams({
      search: query,
      scope: "projects",
    });

    const apiUrl = `https://gitlab.com/api/v4/search?${searchParams.toString()}`;

    return network.get(apiUrl).pipe(
      Effect.flatMap((response): Effect.Effect<Repository[], NetworkError | UnknownError> => {
        if (response.status !== 200) {
          return Effect.fail(networkError(`GitLab search API error: ${response.status} ${response.statusText}`));
        }

        return Effect.try({
          try: () => {
            const data = JSON.parse(response.body);
            let repositories: Repository[] = data.map((item: any) => ({
              name: item.name,
              organization: item.namespace.full_path,
              provider,
              cloneUrl: item.http_url_to_repo,
            }));

            // Filter by organization if provided
            if (org) {
              repositories = repositories.filter((repo) => repo.organization.toLowerCase() === org.toLowerCase());
            }

            return repositories;
          },
          catch: (error) => unknownError(`Failed to parse GitLab API response: ${error}`),
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
export const GitLabProviderLiveLayer = (defaultOrg: string) =>
  Layer.effect(
    RepoProviderPortTag,
    Effect.gen(function* () {
      const network = yield* NetworkPortTag;
      return makeGitLabProvider(network, defaultOrg);
    }),
  );
