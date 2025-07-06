import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { FileSystemPortTag } from "../../domain/ports/file-system-port";
import { GitPortTag } from "../../domain/ports/git-port";
import { RepoProviderPortTag } from "../../domain/ports/repo-provider-port";
import { PathServiceTag } from "../../domain/services/path-service";
import { RepositoryServiceTag } from "../../domain/services/repository-service";
import { ShellIntegrationTag } from "../services/shell-integration";

// Define the repository argument as required
const repo = Args.text({ name: "repo" });

// Create the clone command using @effect/cli
export const cloneCommand = Command.make("clone", { repo }, ({ repo }) =>
  Effect.scoped(
    Effect.gen(function* () {
      // Add cleanup finalizer for failed clone operations
      yield* Effect.addFinalizer(() => Effect.logDebug("Clone command finalizer called - cleanup complete"));

      // Get services from Effect Context
      const git = yield* GitPortTag;
      const repoProvider = yield* RepoProviderPortTag;
      const fileSystem = yield* FileSystemPortTag;
      const pathService = yield* PathServiceTag;
      const repositoryService = yield* RepositoryServiceTag;
      const shellIntegration = yield* ShellIntegrationTag;

      if (!repo) {
        return yield* Effect.fail(unknownError("Repository name is required"));
      }

      // Parse org/repo or just repo
      const [orgOrRepo, repoName] = repo.includes("/") ? repo.split("/", 2) : [undefined, repo];

      const org = orgOrRepo;
      const repoNameFinal = repoName || orgOrRepo;

      if (!repoNameFinal) {
        return yield* Effect.fail(unknownError("Invalid repository name format"));
      }

      yield* Effect.logInfo(`Resolving repository: ${org ? `${org}/${repoNameFinal}` : repoNameFinal}`);

      // Resolve repository details
      const repository = yield* repoProvider.resolveRepository(repoNameFinal, org);

      // Use RepositoryService to determine the proper nested destination path
      const destinationPath = yield* repositoryService.parseRepoUrlToPath(repository.cloneUrl);

      // Calculate relative path from base directory for cd command
      const relativePath = destinationPath.replace(pathService.baseSearchDir + "/", "");

      // Check if destination already exists
      const exists = yield* fileSystem.exists(destinationPath);
      if (exists) {
        yield* Effect.logInfo(`Directory ${relativePath} already exists, changing to it...`);
        yield* shellIntegration.changeDirectory(relativePath);
        yield* Effect.logInfo(`Successfully changed to existing directory ${relativePath}`);
        return;
      }

      yield* Effect.logInfo(`Cloning ${repository.organization}/${repository.name} to ${relativePath}...`);

      // Clone the repository
      yield* git.cloneRepositoryToPath(repository, destinationPath);

      yield* Effect.logInfo(`Successfully cloned ${repository.organization}/${repository.name} to ${relativePath}`);

      // Change directory to the cloned repository
      yield* shellIntegration.changeDirectory(relativePath);
      yield* Effect.logInfo(`Changed to directory ${relativePath}`);
    }),
  ),
);
