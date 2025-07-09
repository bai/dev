import { Effect, Layer } from "effect";

import type { NetworkError, UnknownError } from "../domain/errors";
import type { GitProvider, Repository } from "../domain/models";
import { NetworkTag, type Network } from "../domain/network-port";
import { RepoProviderTag, type RepoProvider } from "../domain/repo-provider-port";

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

    const repository: Repository = {
      name,
      organization,
      provider,
      cloneUrl,
    };

    return Effect.succeed(repository);
  };

  const getDefaultOrg = (): string => defaultOrg;

  const getProvider = (): GitProvider => provider;

  return {
    resolveRepository,
    getDefaultOrg,
    getProvider,
  };
};

// Effect Layer for dependency injection using factory function
export const GitHubProviderLiveLayer = (defaultOrg: string) =>
  Layer.effect(
    RepoProviderTag,
    Effect.gen(function* () {
      const network = yield* NetworkTag;
      return makeGitHubProvider(network, defaultOrg);
    }),
  );
