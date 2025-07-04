import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { GitService } from "../../domain/ports/Git";
import { RepoProviderService } from "../../domain/ports/RepoProvider";
import { PathServiceTag } from "../../domain/services/PathService";

export const cloneCommand: CliCommandSpec = {
  name: "clone",
  description: "Clone a repository to the base directory",
  help: `
Clone a repository to your base directory:

Usage:
  dev clone <repo>        # Clone a repository by name
  dev clone <org>/<repo>  # Clone from specific organization

Examples:
  dev clone myproject     # Clone using default org
  dev clone acme/myproject # Clone from acme organization
  `,

  arguments: [
    {
      name: "repo",
      description: "Repository name or org/repo",
      required: true,
    },
  ],

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.scoped(
      Effect.gen(function* () {
        // Add cleanup finalizer for failed clone operations
        yield* Effect.addFinalizer(() =>
          Effect.logDebug("Clone command finalizer called - cleanup complete"),
        );

        // Get services from Effect Context
        const git = yield* GitService;
        const repoProvider = yield* RepoProviderService;
        const fileSystem = yield* FileSystemService;
        const pathService = yield* PathServiceTag;

        const repoArg = context.args.repo;

        if (!repoArg) {
          return yield* Effect.fail(unknownError("Repository name is required"));
        }

        // Parse org/repo or just repo
        const [orgOrRepo, repoName] = repoArg.includes("/") ? repoArg.split("/", 2) : [undefined, repoArg];

        const org = orgOrRepo;
        const repo = repoName || orgOrRepo;

        yield* Effect.logInfo(`Resolving repository: ${org ? `${org}/${repo}` : repo}`);

        // Resolve repository details
        const repository = yield* repoProvider.resolveRepository(repo, org);

        // Determine destination path using PathService
        const baseDir = pathService.baseSearchDir;
        const destinationPath = `${baseDir}/${repository.name}`;

        // Check if destination already exists
        const exists = yield* fileSystem.exists(destinationPath);
        if (exists) {
          return yield* Effect.fail(unknownError(`Directory ${repository.name} already exists`));
        }

        yield* Effect.logInfo(`Cloning ${repository.organization}/${repository.name}...`);

        // Clone the repository
        yield* git.cloneRepositoryToPath(repository, destinationPath);

        yield* Effect.logInfo(`Successfully cloned ${repository.organization}/${repository.name} to ${repository.name}`);
      })
    );
  },
};
