import { bench, describe } from "vitest";
import { Effect, Layer, Duration, runSync } from "effect";

import { DirectoryPortTag, type DirectoryPort } from "../domain/directory-port";
import { filter } from "../domain/matching";

describe("fuzzy matching performance", () => {
  // Generate test datasets once
  const smallDataset = Array.from({ length: 100 }, (_, i) => 
    `project-${i}/src/components/feature-${i % 10}`
  );
  
  const mediumDataset = Array.from({ length: 1000 }, (_, i) => 
    `project-${i}/src/components/feature-${i % 100}`
  );
  
  const largeDataset = Array.from({ length: 10000 }, (_, i) => 
    `project-${i}/src/components/feature-${i % 100}`
  );

  bench("filter - 100 items", () => {
    filter("feature-5", smallDataset);
  });

  bench("filter - 1,000 items", () => {
    filter("feature-50", mediumDataset);
  });

  bench("filter - 10,000 items", () => {
    filter("feature-500", largeDataset);
  });

  bench("filter - complex pattern on 1,000 items", () => {
    filter("project 500 components feature", mediumDataset);
  });

  bench("filter - no matches on 1,000 items", () => {
    filter("xyz123nonexistent", mediumDataset);
  });
});

describe("array operations performance", () => {
  // Test raw array operations without Effect wrapper
  const smallArray = Array.from({ length: 100 }, (_, i) => `/path-${i}`);
  const mediumArray = Array.from({ length: 1000 }, (_, i) => `/path-${i}`);
  const largeArray = Array.from({ length: 10000 }, (_, i) => `/path-${i}`);

  bench("array copy - 100 items", () => {
    const copy = [...smallArray];
    return copy;
  });

  bench("array copy - 1,000 items", () => {
    const copy = [...mediumArray];
    return copy;
  });

  bench("array copy - 10,000 items", () => {
    const copy = [...largeArray];
    return copy;
  });

  bench("array filter - 1,000 items", () => {
    mediumArray.filter(path => path.includes("5"));
  });

  bench("array map - 1,000 items", () => {
    mediumArray.map(path => path.toUpperCase());
  });
});

describe("string operations performance", () => {
  const shortStrings = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
  const longStrings = Array.from({ length: 1000 }, (_, i) => 
    `/very/long/path/project-${i}/src/components/Feature.tsx`
  );

  bench("string includes on short strings", () => {
    shortStrings.filter(s => s.includes("500"));
  });

  bench("string includes on long strings", () => {
    longStrings.filter(s => s.includes("components"));
  });

  bench("string startsWith", () => {
    shortStrings.filter(s => s.startsWith("item-5"));
  });

  bench("string toLowerCase", () => {
    shortStrings.map(s => s.toLowerCase());
  });
});

describe("fuzzy matching with different patterns", () => {
  const dataset = Array.from({ length: 1000 }, (_, i) => {
    const types = ['component', 'service', 'controller', 'module', 'util'];
    const features = ['auth', 'user', 'admin', 'dashboard', 'settings'];
    const type = types[i % types.length];
    const feature = features[Math.floor(i / 200)];
    return `src/${feature}/${type}-${i}.ts`;
  });

  bench("exact match pattern", () => {
    filter("component-500", dataset);
  });

  bench("partial match pattern", () => {
    filter("auth comp", dataset);
  });

  bench("fuzzy match pattern", () => {
    filter("ath cmpnt", dataset);
  });

  bench("multi-word pattern", () => {
    filter("user service controller", dataset);
  });
});

describe("large dataset edge cases", () => {
  // Test with very long strings
  const longStrings = Array.from({ length: 100 }, (_, i) => 
    `/very/long/path/that/goes/on/and/on/with/many/subdirectories/project-${i}/src/components/features/authentication/providers/oauth/google/GoogleOAuthProvider.tsx`
  );

  bench("filter - long path strings", () => {
    filter("google oauth provider", longStrings);
  });

  // Test with similar strings
  const similarStrings = Array.from({ length: 1000 }, (_, i) => 
    `project-awesome-${i % 10}/src/awesome-component-${i}.ts`
  );

  bench("filter - many similar strings", () => {
    filter("awesome-5", similarStrings);
  });
});