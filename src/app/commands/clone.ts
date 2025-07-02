import { unknownError } from "../../domain/errors";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Git } from "../../domain/ports/Git";
import type { RepoProvider } from "../../domain/ports/RepoProvider";

interface CloneContext extends CommandContext {
  git: Git;
  repoProvider: RepoProvider;
  fileSystem: FileSystem;
  baseDir: string;
}

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

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as CloneContext;
    const repoArg = ctx.args.repo;

    if (!repoArg) {
      throw unknownError("Repository name is required");
    }

    // Parse org/repo or just repo
    const [orgOrRepo, repoName] = repoArg.includes("/") ? repoArg.split("/", 2) : [undefined, repoArg];

    const org = orgOrRepo;
    const repo = repoName || orgOrRepo;

    ctx.logger.info(`Resolving repository: ${org ? `${org}/${repo}` : repo}`);

    // Resolve repository details
    const repository = await ctx.repoProvider.resolveRepository(repo, org);

    if (typeof repository === "object" && "_tag" in repository) {
      ctx.logger.error(`Failed to resolve repository: ${repository.reason}`);
      throw repository;
    }

    // Determine destination path
    const baseDir = ctx.fileSystem.resolvePath(ctx.baseDir);
    const destinationPath = `${baseDir}/${repository.name}`;

    // Check if destination already exists
    if (await ctx.fileSystem.exists(destinationPath)) {
      ctx.logger.error(`Directory ${repository.name} already exists`);
      throw unknownError(`Directory ${repository.name} already exists`);
    }

    ctx.logger.info(`Cloning ${repository.organization}/${repository.name}...`);

    // Clone the repository
    const cloneResult = await ctx.git.clone(repository, destinationPath);

    if (typeof cloneResult === "object" && "_tag" in cloneResult) {
      ctx.logger.error(`Failed to clone repository: ${cloneResult.reason}`);
      throw cloneResult;
    }

    ctx.logger.success(`Successfully cloned ${repository.organization}/${repository.name} to ${repository.name}`);
  },
};
