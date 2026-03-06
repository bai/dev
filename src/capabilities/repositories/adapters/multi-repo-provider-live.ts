import { Effect, Layer } from "effect";

import { makeGitHubProvider } from "~/capabilities/repositories/adapters/github-provider-live";
import { makeGitLabProvider } from "~/capabilities/repositories/adapters/gitlab-provider-live";
import { resolveProviderForOrganization } from "~/capabilities/repositories/org-provider-utils";
import { RepoProvider, type RepoProviderService } from "~/capabilities/repositories/repo-provider-port";
import { AppConfig } from "~/core/config/app-config-port";
import type { GitProviderType } from "~/core/models";

/**
 * Factory function that creates a multi-provider that can select the appropriate provider based on organization
 */
export const makeMultiRepoProvider = (
  defaultOrg: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
): RepoProviderService => {
  // Create provider instances using the factory functions
  const githubProvider = makeGitHubProvider(defaultOrg);
  const gitlabProvider = makeGitLabProvider(defaultOrg);

  const getProviderTypeForOrg = (org: string): GitProviderType => resolveProviderForOrganization(org, defaultProvider, orgToProvider);

  /**
   * Select the appropriate provider based on organization
   */
  const selectProvider = (org: string): RepoProviderService => {
    const providerType = getProviderTypeForOrg(org);
    return providerType === "gitlab" ? gitlabProvider : githubProvider;
  };

  /**
   * Get the default organization
   */
  const getDefaultOrg = (): string => defaultOrg;

  /**
   * Get the provider for the default org
   */
  const getProvider = () => {
    const defaultOrgProvider = getProviderTypeForOrg(defaultOrg);
    return defaultOrgProvider === "gitlab" ? gitlabProvider.getProvider() : githubProvider.getProvider();
  };

  /**
   * Resolve repository using the appropriate provider for the org
   */
  const resolveRepository = (name: string, org?: string) => {
    const targetOrg = org ?? defaultOrg;
    const provider = selectProvider(targetOrg);
    return provider.resolveRepository(name, targetOrg);
  };

  return {
    getDefaultOrg,
    getProvider,
    resolveRepository,
  };
};

/**
 * Layer that provides MultiRepoProvider
 */
export const MultiRepoProviderLiveLayer = (
  defaultOrg: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
) => Layer.succeed(RepoProvider, makeMultiRepoProvider(defaultOrg, defaultProvider, orgToProvider));

export const RepoProviderLiveLayer = Layer.effect(
  RepoProvider,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    return makeMultiRepoProvider(config.defaultOrg, config.defaultProvider, config.orgToProvider);
  }),
);
