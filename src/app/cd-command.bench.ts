import { bench, describe } from "vitest";

import { filter } from "../domain/matching";

describe("cd command - directory search performance", () => {
  // Simulate realistic directory structures
  const homeWorkspace = [
    "~/dev/github.com/myorg/frontend-app",
    "~/dev/github.com/myorg/backend-api",
    "~/dev/github.com/myorg/shared-lib",
    "~/dev/github.com/myorg/docs-site",
    "~/dev/github.com/otherorg/cool-project",
    "~/dev/gitlab.com/company/internal-tool",
    "~/dev/gitlab.com/company/data-pipeline",
  ];

  const mediumWorkspace = Array.from({ length: 50 }, (_, i) => {
    const orgs = ["facebook", "google", "microsoft", "netflix", "uber"];
    const projects = ["react", "angular", "vue", "svelte", "solid"];
    const org = orgs[i % orgs.length];
    const project = projects[Math.floor(i / 10) % projects.length];
    return `~/dev/github.com/${org}/${project}-${i}`;
  });

  const largeWorkspace = Array.from({ length: 500 }, (_, i) => {
    const providers = ["github.com", "gitlab.com", "bitbucket.org"];
    const orgs = ["mycompany", "opensource", "personal", "work", "experiments"];
    const types = ["frontend", "backend", "fullstack", "mobile", "devops"];
    const provider = providers[i % providers.length];
    const org = orgs[Math.floor(i / 100) % orgs.length];
    const type = types[Math.floor(i / 20) % types.length];
    return `~/dev/${provider}/${org}/${type}-project-${i}`;
  });

  bench("search 'frontend' in 7 dirs", () => {
    filter("frontend", homeWorkspace);
  });

  bench("search 'react' in 50 dirs", () => {
    filter("react", mediumWorkspace);
  });

  bench("search 'backend' in 500 dirs", () => {
    filter("backend", largeWorkspace);
  });

  bench("fuzzy search 'gith myc front' in 500 dirs", () => {
    filter("gith myc front", largeWorkspace);
  });

  bench("common typo 'fronted' in 500 dirs", () => {
    filter("fronted", largeWorkspace);
  });

  bench("acronym search 'maf' (main-app-frontend) in mixed dirs", () => {
    const mixedDirs = [
      ...homeWorkspace,
      "~/dev/github.com/company/main-app-frontend",
      "~/dev/github.com/company/main-app-backend",
      "~/dev/github.com/company/main-app-mobile",
    ];
    filter("maf", mixedDirs);
  });

  // Extra large dataset - real stress test
  const extraLargeWorkspace = Array.from({ length: 5000 }, (_, i) => {
    const providers = ["github.com", "gitlab.com", "bitbucket.org", "git.internal.company.com"];
    const orgs = ["mycompany", "opensource", "personal", "work", "experiments", "archived", "forks", "mirrors"];
    const types = ["frontend", "backend", "fullstack", "mobile", "devops", "data", "ml", "infrastructure"];
    const projects = ["app", "service", "lib", "tool", "sdk", "api", "ui", "core"];
    const provider = providers[i % providers.length];
    const org = orgs[Math.floor(i / 500) % orgs.length];
    const type = types[Math.floor(i / 50) % types.length];
    const project = projects[Math.floor(i / 10) % projects.length];
    return `~/dev/${provider}/${org}/${type}-${project}-${i}`;
  });

  bench("search 'backend' in 5000 dirs", () => {
    filter("backend", extraLargeWorkspace);
  });

  bench("fuzzy search 'gitlab arch infra' in 5000 dirs", () => {
    filter("gitlab arch infra", extraLargeWorkspace);
  });

  bench("exact match in 5000 dirs", () => {
    filter("git.internal.company.com/archived/ml-api-2500", extraLargeWorkspace);
  });
});
