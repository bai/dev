import { bench, describe } from "vitest";

import { filter } from "./matching";

describe("fuzzy matching performance", () => {
  // Small dataset - typical for interactive use
  const smallDataset = Array.from({ length: 10 }, (_, i) => `project-${i}/src/components`);

  // Medium dataset - realistic workspace
  const mediumDataset = Array.from({ length: 100 }, (_, i) => `~/dev/github.com/org-${i % 10}/project-${i}`);

  // Large dataset - stress test
  const largeDataset = Array.from({ length: 1000 }, (_, i) => {
    const providers = ["github.com", "gitlab.com", "bitbucket.org"];
    const orgs = ["company", "personal", "opensource"];
    const types = ["frontend", "backend", "fullstack", "mobile"];
    return `~/dev/${providers[i % 3]}/${orgs[Math.floor(i / 100) % 3]}/${types[i % 4]}-project-${i}`;
  });

  bench("filter 10 items - exact match", () => {
    filter("project-5", smallDataset);
  });

  bench("filter 100 items - exact match", () => {
    filter("project-50", mediumDataset);
  });

  bench("filter 100 items - fuzzy match", () => {
    filter("proj 25", mediumDataset);
  });

  bench("filter 1000 items - exact match", () => {
    filter("frontend-project-500", largeDataset);
  });

  bench("filter 1000 items - fuzzy match", () => {
    filter("github company front", largeDataset);
  });

  bench("filter 1000 items - typo tolerance", () => {
    filter("gitub compny frntend", largeDataset);
  });
});
