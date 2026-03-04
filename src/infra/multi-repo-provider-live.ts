import { Layer } from "effect";

import type { GitProviderType } from "../domain/models";
import { resolveProviderForOrganization } from "../domain/org-provider-utils";
import { RepoProviderTag, type RepoProvider } from "../domain/repo-provider-port";
import { makeGitHubProvider } from "./github-provider-live";
import { makeGitLabProvider } from "./gitlab-provider-live";

/**
 * Factory function that creates a multi-provider that can select the appropriate provider based on organization
 */
export const makeMultiRepoProvider = (
  defaultOrg: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
): RepoProvider => {
  // Create provider instances using the factory functions
  const githubProvider = makeGitHubProvider(defaultOrg);
  const gitlabProvider = makeGitLabProvider(defaultOrg);

  const getProviderTypeForOrg = (org: string): GitProviderType =>
    resolveProviderForOrganization(org, defaultProvider, orgToProvider);

  /**
   * Select the appropriate provider based on organization
   */
  const selectProvider = (org: string): RepoProvider => {
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
) => Layer.succeed(RepoProviderTag, makeMultiRepoProvider(defaultOrg, defaultProvider, orgToProvider));
