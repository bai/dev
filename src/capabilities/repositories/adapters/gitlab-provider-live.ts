import { Effect } from "effect";

import type { RepoProviderService } from "~/capabilities/repositories/repo-provider-port";
import type { NetworkError, UnknownError } from "~/core/errors";
import type { GitProvider, Repository } from "~/core/models";

// Factory function that creates GitLabProvider with dependencies
export const makeGitLabProvider = (defaultOrg = "gitlab-org"): RepoProviderService => {
  const provider: GitProvider = {
    name: "gitlab",
    baseUrl: "https://gitlab.com",
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
