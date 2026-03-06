import { Args, Command } from "@effect/cli";
import {
  ATTR_FILE_PATH,
  ATTR_VCS_OWNER_NAME,
  ATTR_VCS_REPOSITORY_NAME,
  ATTR_VCS_REPOSITORY_URL_FULL,
} from "@opentelemetry/semantic-conventions/incubating";
import { Effect } from "effect";

import { CommandRegistryTag, type RegisteredCommand } from "~/bootstrap/command-registry-port";
import { RepoProviderTag } from "~/capabilities/repositories/repo-provider-port";
import { isFullUrl, RepositoryServiceTag } from "~/capabilities/repositories/repository-service";
import { FileSystemTag } from "~/capabilities/system/file-system-port";
import { GitTag } from "~/capabilities/system/git-port";
import { ShellIntegrationTag } from "~/capabilities/workspace/shell-integration-service";
import { unknownError } from "~/core/errors";
import { WorkspacePathsTag } from "~/core/runtime/path-service";

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
      yield* Effect.annotateCurrentSpan(ATTR_VCS_REPOSITORY_NAME, repo);
      // Add cleanup finalizer for failed clone operations
      yield* Effect.addFinalizer(() => Effect.logDebug("Clone command finalizer called - cleanup complete"));

      // Get services from Effect Context
      const git = yield* GitTag;
      const repoProvider = yield* RepoProviderTag;
      const fileSystem = yield* FileSystemTag;
      const workspacePaths = yield* WorkspacePathsTag;
      const repositoryService = yield* RepositoryServiceTag;
      const shellIntegration = yield* ShellIntegrationTag;

      if (!repo) {
        return yield* unknownError("Repository name is required");
      }

      const repository = yield* isFullUrl(repo)
        ? Effect.gen(function* () {
            yield* Effect.logInfo(`Cloning from URL: ${repo}`);
            const resolved = yield* repositoryService.parseFullUrlToRepository(repo).pipe(Effect.withSpan("repository.parse_url"));
            yield* Effect.annotateCurrentSpan(ATTR_VCS_OWNER_NAME, resolved.organization);
            yield* Effect.annotateCurrentSpan(ATTR_VCS_REPOSITORY_NAME, resolved.name);
            return resolved;
          })
        : Effect.gen(function* () {
            const [orgOrRepo, repoName] = repo.includes("/") ? repo.split("/", 2) : [undefined, repo];

            const org = orgOrRepo;
            const repoNameFinal = repoName || orgOrRepo;

            if (!repoNameFinal) {
              return yield* unknownError("Invalid repository name format");
            }

            yield* Effect.logInfo(`Resolving repository: ${org ? `${org}/${repoNameFinal}` : repoNameFinal}`);

            yield* Effect.annotateCurrentSpan(ATTR_VCS_OWNER_NAME, org || "default");
            yield* Effect.annotateCurrentSpan(ATTR_VCS_REPOSITORY_NAME, repoNameFinal);
            return yield* repoProvider.resolveRepository(repoNameFinal, org).pipe(Effect.withSpan("repository.resolve"));
          });

      // Use RepositoryService to determine the proper nested destination path
      const destinationPath = yield* repositoryService
        .parseRepoUrlToPath(repository.cloneUrl)
        .pipe(Effect.withSpan("repository.parse_url"));

      // Calculate relative path from base directory for cd command
      const relativePath = destinationPath.replace(workspacePaths.baseSearchPath + "/", "");
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
      yield* Effect.annotateCurrentSpan(ATTR_VCS_REPOSITORY_URL_FULL, repository.cloneUrl);
      yield* Effect.annotateCurrentSpan(ATTR_FILE_PATH, destinationPath);
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
    command: cloneCommand as RegisteredCommand,
    displayHelp,
  });
});
