import { Effect } from "effect";

import type { NetworkError, UnknownError } from "~/core/errors";
import type { GitProvider, Repository } from "~/core/models";

export class RepoProvider extends Effect.Tag("RepoProvider")<
  RepoProvider,
  {
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
>() {}

export type RepoProviderService = (typeof RepoProvider)["Service"];
