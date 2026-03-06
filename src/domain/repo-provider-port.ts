import { Effect } from "effect";

import type { NetworkError, UnknownError } from "./errors";
import type { GitProvider, Repository } from "./models";

export interface RepoProvider {
  /**
   * Resolve a repository name to full repository details
   */
  resolveRepository(name: string, org?: string): Effect.Effect<Repository, NetworkError | UnknownError>;

  /**
   * Get the default organization for a provider
   */
  getDefaultOrg(): string;

  /**
   * Get the provider info
   */
  getProvider(): GitProvider;
}

export class RepoProviderTag extends Effect.Tag("RepoProvider")<RepoProviderTag, RepoProvider>() {}
