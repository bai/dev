import path from "path";

import { Context, Effect, Layer } from "effect";

import { configError, type ConfigError } from "../errors";
import type { GitProviderType } from "../models";
import { PathServiceTag } from "./path-service";

/**
 * Repository service for handling repository URL parsing and expansion
 * This is domain logic for repository URL handling
 */
export interface RepositoryService {
  parseRepoUrlToPath(repoUrl: string): Effect.Effect<string, ConfigError, PathServiceTag>;
  expandToFullGitUrl(
    repoInput: string,
    defaultOrg: string,
    orgToProvider?: Record<string, GitProviderType>,
    forceProvider?: "github" | "gitlab",
  ): Effect.Effect<string, never>;
}

// Individual functions implementing the service methods
const parseRepoUrlToPath = (repoUrl: string): Effect.Effect<string, ConfigError, PathServiceTag> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    let orgName = "";
    let repoName = "";
    let domain = "";

    // Handle scp-style SSH URLs (git@github.com:org/repo.git)
    const scpMatch = repoUrl.match(/^([^@]+)@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (scpMatch && scpMatch[2] && scpMatch[3] && scpMatch[4]) {
      domain = scpMatch[2];
      orgName = scpMatch[3];
      repoName = scpMatch[4];
      return path.join(pathService.baseSearchDir, domain, orgName, repoName);
    }

    // Normalize URLs like git+ssh:// and ssh://
    const cleaned = repoUrl.replace(/^git\+/, "");

    const url = yield* Effect.tryPromise({
      try: () => Promise.resolve(new URL(cleaned)),
      catch: (error: any) => configError(`Invalid repository URL: ${repoUrl} - ${error.message}`),
    });

    domain = url.hostname;
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      orgName = pathParts[0];
      repoName = pathParts[1].replace(/\.git$/, "");
      return path.join(pathService.baseSearchDir, domain, orgName, repoName);
    }

    return yield* Effect.fail(configError(`URL path does not contain organization and repository: ${repoUrl}`));
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

    let orgName = defaultOrg;
    let repoName = repoInput;
    let provider = "github"; // default provider
    let isExplicitOrg = false;

    // Check if input has org/repo format
    if (repoInput.includes("/")) {
      const parts = repoInput.split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        orgName = parts[0];
        repoName = parts[1];
        isExplicitOrg = true;
      }
    }

    // Determine provider based on forced option, org mapping, or default
    const orgToProviderMap = orgToProvider || {};
    if (forceProvider) {
      provider = forceProvider;
    } else if (orgName in orgToProviderMap) {
      provider = orgToProviderMap[orgName] === "gitlab" ? "gitlab" : "github";
    } else if (!isExplicitOrg && defaultOrg in orgToProviderMap) {
      // Only use default org's provider if no explicit org was specified
      provider = orgToProviderMap[defaultOrg] === "gitlab" ? "gitlab" : "github";
    }

    // Construct the full URL
    const baseUrl = provider === "gitlab" ? "https://gitlab.com" : "https://github.com";
    return `${baseUrl}/${orgName}/${repoName}`;
  });

// Functional service implementation as plain object
export const RepositoryLive: RepositoryService = {
  parseRepoUrlToPath: parseRepoUrlToPath,
  expandToFullGitUrl: expandToFullGitUrl,
};

/**
 * Checks if a string is a full URL (HTTP/HTTPS/SSH)
 */
function isFullUrl(str: string): boolean {
  return (
    str.startsWith("http://") ||
    str.startsWith("https://") ||
    str.startsWith("ssh://") ||
    str.startsWith("git://") ||
    str.startsWith("git+ssh://") ||
    str.includes("@")
  );
}

// Service tag for Effect Context system
export class RepositoryServiceTag extends Context.Tag("RepositoryService")<RepositoryServiceTag, RepositoryService>() {}

// Layer that provides RepositoryService (no `new` keyword)
export const RepositoryLiveLayer = Layer.effect(RepositoryServiceTag, Effect.succeed(RepositoryLive));
