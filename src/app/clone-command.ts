import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag } from "../domain/command-registry-port";
import { unknownError } from "../domain/errors";
import { FileSystemTag } from "../domain/file-system-port";
import { GitTag } from "../domain/git-port";
import type { GitProvider, Repository } from "../domain/models";
import { PathServiceTag } from "../domain/path-service";
import { RepoProviderTag } from "../domain/repo-provider-port";
import { RepositoryServiceTag } from "../domain/repository-service";
import { ShellIntegrationTag } from "./shell-integration-service";

/**
 * Checks if a string is a full URL (HTTP/HTTPS/SSH/git protocols)
 */
const isFullUrl = (str: string): boolean =>
  str.startsWith("http://") ||
  str.startsWith("https://") ||
  str.startsWith("ssh://") ||
  str.startsWith("git://") ||
  str.startsWith("git+ssh://") ||
  str.match(/^[^@:/]+@[^:]+:/) !== null; // scp-style git@host:path

/**
 * Parse a full URL into a Repository object
 */
const parseFullUrlToRepository = (url: string): Effect.Effect<Repository, never, never> =>
  Effect.sync(() => {
    // Handle scp-style SSH URLs (git@github.com:org/repo.git)
    const scpMatch = url.match(/^([^@:/]+)@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (scpMatch && scpMatch[2] && scpMatch[3] && scpMatch[4]) {
      const domain = scpMatch[2];
      const orgName = scpMatch[3];
      const repoName = scpMatch[4].replace(/\.git$/, "");
      const providerName = domain.includes("gitlab") ? "gitlab" : "github";
      const provider: GitProvider = {
        name: providerName,
        baseUrl: `https://${domain}`,
      };
      return {
        name: repoName,
        organization: orgName,
        provider,
        cloneUrl: url,
      };
    }

    // Handle standard URLs (https://, git://, ssh://, etc.)
    const cleaned = url.replace(/^git\+/, "");
    const parsed = new URL(cleaned);
    const domain = parsed.hostname;
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    const orgName = pathParts[0] || "";
    const repoName = (pathParts[1] || "").replace(/\.git$/, "");
    const providerName = domain.includes("gitlab") ? "gitlab" : "github";
    const provider: GitProvider = {
      name: providerName,
      baseUrl: `https://${domain}`,
    };

    return {
      name: repoName,
      organization: orgName,
      provider,
      cloneUrl: url,
    };
  });

// Define the repository argument as required
const repo = Args.text({ name: "repo" });

/**
 * Display help for the clone command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Clone repositories from various providers (GitHub, GitLab, etc.)\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev clone <repo>\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev clone user/repo        # Clone from GitHub");
    yield* Effect.logInfo("  dev clone repo-name        # Clone from configured default provider");
    yield* Effect.logInfo("  dev clone https://...      # Clone from full URL\n");

    yield* Effect.logInfo("ARGUMENTS");
    yield* Effect.logInfo("  repo                      # Required repository identifier\n");
  });

// Create the clone command using @effect/cli
export const cloneCommand = Command.make("clone", { repo }, ({ repo }) =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("vcs.repository.name", repo);
      // Add cleanup finalizer for failed clone operations
      yield* Effect.addFinalizer(() => Effect.logDebug("Clone command finalizer called - cleanup complete"));

      // Get services from Effect Context
      const git = yield* GitTag;
      const repoProvider = yield* RepoProviderTag;
      const fileSystem = yield* FileSystemTag;
      const pathService = yield* PathServiceTag;
      const repositoryService = yield* RepositoryServiceTag;
      const shellIntegration = yield* ShellIntegrationTag;

      if (!repo) {
        return yield* Effect.fail(unknownError("Repository name is required"));
      }

      // Check if input is a full URL - if so, parse it directly
      let repository;
      if (isFullUrl(repo)) {
        yield* Effect.logInfo(`Cloning from URL: ${repo}`);
        repository = yield* parseFullUrlToRepository(repo).pipe(Effect.withSpan("repository.parse_url"));
        yield* Effect.annotateCurrentSpan("vcs.repository.owner", repository.organization);
        yield* Effect.annotateCurrentSpan("vcs.repository.name", repository.name);
      } else {
        // Parse org/repo or just repo
        const [orgOrRepo, repoName] = repo.includes("/") ? repo.split("/", 2) : [undefined, repo];

        const org = orgOrRepo;
        const repoNameFinal = repoName || orgOrRepo;

        if (!repoNameFinal) {
          return yield* Effect.fail(unknownError("Invalid repository name format"));
        }

        yield* Effect.logInfo(`Resolving repository: ${org ? `${org}/${repoNameFinal}` : repoNameFinal}`);

        // Resolve repository details
        yield* Effect.annotateCurrentSpan("vcs.repository.owner", org || "default");
        yield* Effect.annotateCurrentSpan("vcs.repository.name", repoNameFinal);
        repository = yield* repoProvider
          .resolveRepository(repoNameFinal, org)
          .pipe(Effect.withSpan("repository.resolve"));
      }

      // Use RepositoryService to determine the proper nested destination path
      const destinationPath = yield* repositoryService
        .parseRepoUrlToPath(repository.cloneUrl)
        .pipe(Effect.withSpan("repository.parse_url"));

      // Calculate relative path from base directory for cd command
      const relativePath = destinationPath.replace(pathService.baseSearchPath + "/", "");
      yield* Effect.annotateCurrentSpan("file.path.relative", relativePath);

      // Check if destination already exists
      const exists = yield* fileSystem.exists(destinationPath).pipe(Effect.withSpan("filesystem.check_exists"));
      if (exists) {
        yield* Effect.logInfo(`Directory ${relativePath} already exists, changing to it...`);
        yield* shellIntegration.changeDirectory(relativePath).pipe(Effect.withSpan("directory.change"));
        yield* Effect.logInfo(`Successfully changed to existing directory ${relativePath}`);
        return;
      }

      yield* Effect.logInfo(`Cloning ${repository.organization}/${repository.name} to ${relativePath}...`);

      // Clone the repository
      yield* Effect.annotateCurrentSpan("vcs.repository.url", repository.cloneUrl);
      yield* Effect.annotateCurrentSpan("file.path", destinationPath);
      yield* git.cloneRepositoryToPath(repository, destinationPath).pipe(Effect.withSpan("git.clone"));

      yield* Effect.logInfo(`Successfully cloned ${repository.organization}/${repository.name} to ${relativePath}`);

      // Change directory to the cloned repository
      yield* shellIntegration.changeDirectory(relativePath).pipe(Effect.withSpan("directory.change"));
      yield* Effect.logInfo(`Changed to directory ${relativePath}`);
    }).pipe(Effect.withSpan("clone.execute")),
  ),
);

/**
 * Register the clone command with the command registry
 */
export const registerCloneCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "clone",
    command: cloneCommand as Command.Command<string, never, any, any>,
    displayHelp,
  });
});
