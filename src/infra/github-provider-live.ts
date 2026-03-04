import { Effect } from "effect";

import type { NetworkError, UnknownError } from "../domain/errors";
import type { GitProvider, Repository } from "../domain/models";
import type { RepoProvider } from "../domain/repo-provider-port";

// Factory function that creates GitHubProvider with dependencies
export const makeGitHubProvider = (defaultOrg = "octocat"): RepoProvider => {
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
