import { Effect } from "effect";
import { bench, describe } from "vitest";

import { makeRepositoryService } from "~/capabilities/repositories/repository-service";
import type { GitProviderType } from "~/core/models";
import { makeWorkspacePathsMock } from "~/core/runtime/path-service-mock";

describe("repository URL parsing performance", () => {
  const repositoryService = makeRepositoryService(makeWorkspacePathsMock("/home/user/dev"));

  bench("parse SSH URL", () => {
    const effect = repositoryService.parseRepoUrlToPath("git@github.com:facebook/react.git");
    Effect.runSync(effect);
  });

  bench("parse HTTPS URL", () => {
    const effect = repositoryService.parseRepoUrlToPath("https://github.com/microsoft/vscode.git");
    Effect.runSync(effect);
  });

  bench("parse SSH URL with port", () => {
    const effect = repositoryService.parseRepoUrlToPath("ssh://git@gitlab.com:2222/company/project.git");
    Effect.runSync(effect);
  });

  bench("expand simple repo name", () => {
    const effect = repositoryService.expandToFullGitUrl("myrepo", "myorg");
    Effect.runSync(effect);
  });

  bench("expand org/repo format", () => {
    const effect = repositoryService.expandToFullGitUrl("facebook/react", "defaultorg");
    Effect.runSync(effect);
  });

  bench("expand with provider mapping", () => {
    const orgMapping: Record<string, GitProviderType> = {
      "gitlab-org": "gitlab",
      "github-org": "github",
    };
    const effect = repositoryService.expandToFullGitUrl("gitlab-org/project", "defaultorg", orgMapping);
    Effect.runSync(effect);
  });
});
