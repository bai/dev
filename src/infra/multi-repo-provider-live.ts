import { Effect, Layer } from "effect";

import type { GitProviderType } from "../domain/models";
import { NetworkTag, type Network } from "../domain/network-port";
import { RepoProviderTag, type RepoProvider } from "../domain/repo-provider-port";
import { makeGitHubProvider } from "./github-provider-live";
import { makeGitLabProvider } from "./gitlab-provider-live";

/**
 * Multi-provider that can select the appropriate provider based on organization
 */
export class MultiRepoProvider implements RepoProvider {
  private readonly githubProvider: RepoProvider;
  private readonly gitlabProvider: RepoProvider;

  constructor(
    network: Network,
    private readonly defaultOrg: string,
    private readonly defaultProvider: GitProviderType,
    private readonly orgToProvider: Record<string, GitProviderType>,
  ) {
    this.githubProvider = makeGitHubProvider(network, defaultOrg);
    this.gitlabProvider = makeGitLabProvider(network, defaultOrg);
  }

  /**
   * Get the default organization
   */
  getDefaultOrg(): string {
    return this.defaultOrg;
  }

  /**
   * Get the provider for the default org
   */
  getProvider() {
    const defaultOrgProvider = this.orgToProvider[this.defaultOrg] || this.defaultProvider;
    return defaultOrgProvider === "gitlab" ? this.gitlabProvider.getProvider() : this.githubProvider.getProvider();
  }

  /**
   * Resolve repository using the appropriate provider for the org
   */
  resolveRepository(name: string, org?: string) {
    const targetOrg = org || this.defaultOrg;
    const provider = this.selectProvider(targetOrg);
    return provider.resolveRepository(name, targetOrg);
  }

  /**
   * Select the appropriate provider based on organization
   */
  private selectProvider(org: string): RepoProvider {
    const providerType = this.orgToProvider[org] || this.defaultProvider;
    return providerType === "gitlab" ? this.gitlabProvider : this.githubProvider;
  }
}

/**
 * Factory function to create MultiRepoProvider
 */
export const makeMultiRepoProvider = (
  network: Network,
  defaultOrg: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
): RepoProvider => {
  return new MultiRepoProvider(network, defaultOrg, defaultProvider, orgToProvider);
};

/**
 * Layer that provides MultiRepoProvider
 */
export const MultiRepoProviderLiveLayer = (
  defaultOrg: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
) =>
  Layer.effect(
    RepoProviderTag,
    Effect.gen(function* () {
      const network = yield* NetworkTag;
      return makeMultiRepoProvider(network, defaultOrg, defaultProvider, orgToProvider);
    }),
  );
