import path from "path";

import { Context, Effect, Layer } from "effect";

import { configError, type ConfigError } from "./errors";
import type { GitProviderType, Repository } from "./models";
import { resolveRepositoryInput } from "./org-provider-utils";
import { PathServiceTag, type PathService } from "./path-service";

/**
 * Repository service for handling repository URL parsing and expansion
 * This is domain logic for repository URL handling
 */
export interface RepositoryService {
  parseRepoUrlToPath(repoUrl: string): Effect.Effect<string, ConfigError>;
  parseFullUrlToRepository(repoUrl: string): Effect.Effect<Repository, ConfigError, never>;
  expandToFullGitUrl(
    repoInput: string,
    defaultOrg: string,
    orgToProvider?: Record<string, GitProviderType>,
    forceProvider?: "github" | "gitlab",
  ): Effect.Effect<string, never>;
}

interface ParsedRepositoryCoordinates {
  readonly domain: string;
  readonly orgName: string;
  readonly repoName: string;
}

const parseRepositoryCoordinatesFromUrl = (repoUrl: string): Effect.Effect<ParsedRepositoryCoordinates, ConfigError, never> =>
  Effect.gen(function* () {
    // Handle scp-style SSH URLs (git@github.com:org/repo.git)
    // Must not start with a protocol (ssh://, https://, etc)
    const scpMatch = repoUrl.match(/^([^@:/]+)@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (scpMatch && scpMatch[2] && scpMatch[3] && scpMatch[4]) {
      return {
        domain: scpMatch[2],
        orgName: scpMatch[3],
        repoName: scpMatch[4].replace(/\.git$/, ""),
      };
    }

    // Normalize URLs like git+ssh:// and ssh://
    const cleaned = repoUrl.replace(/^git\+/, "");

    const url = yield* Effect.try({
      try: () => new URL(cleaned),
      catch: (error: unknown) => configError(`Invalid repository URL: ${repoUrl} - ${String(error)}`),
    });

    // url.hostname should not include port, but use url.host and strip port to be safe
    const domain = url.hostname;
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      return {
        domain,
        orgName: pathParts[0],
        repoName: pathParts[1].replace(/\.git$/, ""),
      };
    }

    return yield* configError(`URL path does not contain organization and repository: ${repoUrl}`);
  });

/**
 * Checks if a string is a full URL (HTTP/HTTPS/SSH/git protocols)
 */
export const isFullUrl = (str: string): boolean =>
  str.startsWith("http://") ||
  str.startsWith("https://") ||
  str.startsWith("ssh://") ||
  str.startsWith("git://") ||
  str.startsWith("git+ssh://") ||
  str.match(/^[^@:/]+@[^:]+:/) !== null; // scp-style git@host:path

export const makeRepositoryService = (pathService: PathService): RepositoryService => {
  const parseRepoUrlToPath = (repoUrl: string): Effect.Effect<string, ConfigError> =>
    Effect.gen(function* () {
      const parsedRepository = yield* parseRepositoryCoordinatesFromUrl(repoUrl);
      return path.join(pathService.baseSearchPath, parsedRepository.domain, parsedRepository.orgName, parsedRepository.repoName);
    });

  const parseFullUrlToRepository = (repoUrl: string): Effect.Effect<Repository, ConfigError, never> =>
    Effect.gen(function* () {
      const parsedRepository = yield* parseRepositoryCoordinatesFromUrl(repoUrl);
      const providerName = parsedRepository.domain.includes("gitlab") ? "gitlab" : "github";

      return {
        name: parsedRepository.repoName,
        organization: parsedRepository.orgName,
        provider: {
          name: providerName,
          baseUrl: `https://${parsedRepository.domain}`,
        },
        cloneUrl: repoUrl,
      };
    });

  const expandToFullGitUrl = (
    repoInput: string,
    defaultOrg: string,
    orgToProvider?: Record<string, GitProviderType>,
    forceProvider?: "github" | "gitlab",
  ): Effect.Effect<string, never> =>
    Effect.sync(() => {
      // If it's already a full URL, return as-is
      if (isFullUrl(repoInput)) {
        return repoInput;
      }
      const resolved = resolveRepositoryInput(repoInput, defaultOrg, "github", orgToProvider ?? {}, forceProvider);

      // Construct the full URL
      const baseUrl = resolved.provider === "gitlab" ? "https://gitlab.com" : "https://github.com";
      return `${baseUrl}/${resolved.organization}/${resolved.repositoryName}`;
    });

  return {
    parseRepoUrlToPath,
    parseFullUrlToRepository,
    expandToFullGitUrl,
  };
};

// Service tag for Effect Context system
export class RepositoryServiceTag extends Context.Tag("RepositoryService")<RepositoryServiceTag, RepositoryService>() {}

// Layer that provides RepositoryService
export const RepositoryServiceLiveLayer = Layer.effect(
  RepositoryServiceTag,
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    return makeRepositoryService(pathService);
  }),
);
