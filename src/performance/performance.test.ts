import { it } from "@effect/vitest";
import { Effect, Layer, Duration, Metric } from "effect";
import { describe, expect } from "vitest";

import { DirectoryPortTag, type DirectoryPort } from "../domain/directory-port";
import { filter } from "../domain/matching";
import { DatabaseLiveLayer } from "../infra/database-live";
import { DatabasePortTag } from "../domain/database-port";
import type { NewRun } from "../domain/models";

describe("performance", () => {
  describe("fuzzy matching performance", () => {
    it.effect("handles 10,000 items efficiently", () =>
      Effect.gen(function* () {
        // Generate a large dataset of directory names
        const directories: string[] = [];
        for (let i = 0; i < 10000; i++) {
          directories.push(`project-${i}/src/components/feature-${i % 100}`);
          if (i % 10 === 0) {
            directories.push(`test-framework-${i}/lib/utils/helper-${i % 50}`);
          }
        }

        const searchTerm = "test-framework-5000";
        
        // Measure the time it takes to filter
        const startTime = yield* Effect.sync(() => performance.now());
        const results = yield* Effect.sync(() => filter(searchTerm, directories));
        const endTime = yield* Effect.sync(() => performance.now());
        
        const duration = endTime - startTime;
        
        // Should complete within 100ms even with 10,000 items
        expect(duration).toBeLessThan(100);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]?.str).toContain("test-framework-5000");
        
        yield* Effect.logInfo(`Fuzzy matching 10,000 items took ${duration.toFixed(2)}ms`);
      })
    );

    it.effect("handles complex patterns efficiently", () =>
      Effect.gen(function* () {
        // Generate items with varying complexity
        const items: string[] = [];
        for (let i = 0; i < 5000; i++) {
          items.push(`/Users/dev/projects/my-awesome-project-${i}/src/components/features/authentication/login/LoginForm.tsx`);
          items.push(`/Users/dev/work/client-${i % 100}/backend/api/v2/endpoints/users/profile/settings/preferences.js`);
        }

        const searchTerm = "awesome project 2500 login form";
        
        const startTime = yield* Effect.sync(() => performance.now());
        const results = yield* Effect.sync(() => filter(searchTerm, items));
        const endTime = yield* Effect.sync(() => performance.now());
        
        const duration = endTime - startTime;
        
        // Should handle complex patterns within reasonable time
        expect(duration).toBeLessThan(150);
        expect(results.length).toBeGreaterThan(0);
        
        yield* Effect.logInfo(`Complex pattern matching took ${duration.toFixed(2)}ms`);
      })
    );

    it.effect("scales linearly with dataset size", () =>
      Effect.gen(function* () {
        const testSizes = [1000, 2000, 4000, 8000];
        const durations: number[] = [];
        
        for (const size of testSizes) {
          const items = Array.from({ length: size }, (_, i) => 
            `project-${i}/module-${i % 10}/component-${i % 100}`
          );
          
          const startTime = yield* Effect.sync(() => performance.now());
          yield* Effect.sync(() => filter("module-5", items));
          const endTime = yield* Effect.sync(() => performance.now());
          
          durations.push(endTime - startTime);
        }
        
        // Check that performance scales roughly linearly
        // The ratio between consecutive durations should be around 2
        for (let i = 1; i < durations.length; i++) {
          const ratio = durations[i] / durations[i - 1];
          expect(ratio).toBeGreaterThan(1.5);
          expect(ratio).toBeLessThan(3.0);
        }
        
        yield* Effect.logInfo(`Scaling test durations: ${durations.map(d => d.toFixed(2)).join(", ")}ms`);
      })
    );
  });

  describe("directory scanning performance", () => {
    // Mock directory service that simulates filesystem operations
    class MockLargeDirectoryService implements DirectoryPort {
      constructor(private readonly directoryCount: number) {}

      ensureBaseDirectoryExists(): Effect.Effect<void, never, never> {
        return Effect.succeed(undefined);
      }

      findDirs(): Effect.Effect<string[], never, never> {
        // Simulate filesystem delay
        return Effect.gen(function* () {
          yield* Effect.sleep(Duration.millis(10)); // Simulate I/O
          
          const dirs: string[] = [];
          for (let i = 0; i < this.directoryCount; i++) {
            dirs.push(`/home/user/dev/project-${i}`);
            if (i % 5 === 0) {
              dirs.push(`/home/user/dev/project-${i}/src`);
              dirs.push(`/home/user/dev/project-${i}/tests`);
            }
          }
          return dirs;
        }.bind(this));
      }
    }

    it.effect("scans large directory trees efficiently", () =>
      Effect.gen(function* () {
        const testLayer = Layer.succeed(
          DirectoryPortTag,
          new MockLargeDirectoryService(5000)
        );

        const directoryService = yield* DirectoryPortTag;
        
        const startTime = yield* Effect.sync(() => performance.now());
        const directories = yield* directoryService.findDirs();
        const endTime = yield* Effect.sync(() => performance.now());
        
        const duration = endTime - startTime;
        
        // Should complete within reasonable time even with many directories
        expect(duration).toBeLessThan(500);
        expect(directories.length).toBeGreaterThan(5000);
        
        yield* Effect.logInfo(`Scanning ${directories.length} directories took ${duration.toFixed(2)}ms`);
      }).pipe(
        Effect.provide(Layer.succeed(DirectoryPortTag, new MockLargeDirectoryService(5000)))
      )
    );
  });

  describe("database query performance", () => {
    it.effect("handles bulk inserts efficiently", () =>
      Effect.gen(function* () {
        const db = yield* DatabasePortTag;
        
        // Prepare bulk data
        const runs: NewRun[] = [];
        for (let i = 0; i < 1000; i++) {
          runs.push({
            commandType: "test",
            commandArgs: `test-${i}`,
            startTime: new Date(),
            endTime: new Date(),
            exitCode: 0,
            output: `Output for test ${i}`,
            workingDirectory: `/test/dir/${i}`,
          });
        }
        
        const startTime = yield* Effect.sync(() => performance.now());
        
        // Insert in batches
        const batchSize = 100;
        for (let i = 0; i < runs.length; i += batchSize) {
          const batch = runs.slice(i, i + batchSize);
          yield* Effect.forEach(batch, (run) => db.insertRun(run), {
            concurrency: 10
          });
        }
        
        const endTime = yield* Effect.sync(() => performance.now());
        const duration = endTime - startTime;
        
        // Should handle 1000 inserts within reasonable time
        expect(duration).toBeLessThan(2000);
        
        // Verify data was inserted
        const count = yield* db.getRecentRuns(1000);
        expect(count.length).toBeGreaterThanOrEqual(1000);
        
        yield* Effect.logInfo(`Bulk insert of 1000 records took ${duration.toFixed(2)}ms`);
      }).pipe(
        Effect.provide(DatabaseLiveLayer)
      )
    );

    it.effect("queries recent runs efficiently", () =>
      Effect.gen(function* () {
        const db = yield* DatabasePortTag;
        
        // First, insert some test data
        const testRuns = 500;
        for (let i = 0; i < testRuns; i++) {
          yield* db.insertRun({
            commandType: "query-test",
            commandArgs: `args-${i}`,
            startTime: new Date(Date.now() - i * 1000), // Stagger times
            endTime: new Date(),
            exitCode: 0,
            output: `Output ${i}`,
            workingDirectory: "/test",
          });
        }
        
        // Test query performance
        const startTime = yield* Effect.sync(() => performance.now());
        const recentRuns = yield* db.getRecentRuns(100);
        const endTime = yield* Effect.sync(() => performance.now());
        
        const duration = endTime - startTime;
        
        // Query should be fast
        expect(duration).toBeLessThan(50);
        expect(recentRuns.length).toBeLessThanOrEqual(100);
        
        yield* Effect.logInfo(`Querying recent runs took ${duration.toFixed(2)}ms`);
      }).pipe(
        Effect.provide(DatabaseLiveLayer)
      )
    );
  });

  describe("concurrent operation handling", () => {
    it.effect("handles concurrent directory operations", () =>
      Effect.gen(function* () {
        const testLayer = Layer.succeed(
          DirectoryPortTag,
          new MockLargeDirectoryService(1000)
        );

        const directoryService = yield* DirectoryPortTag;
        
        // Simulate concurrent directory scans
        const concurrentScans = 10;
        
        const startTime = yield* Effect.sync(() => performance.now());
        
        const results = yield* Effect.all(
          Array.from({ length: concurrentScans }, () => 
            directoryService.findDirs()
          ),
          { concurrency: "unbounded" }
        );
        
        const endTime = yield* Effect.sync(() => performance.now());
        const duration = endTime - startTime;
        
        // Concurrent operations should be faster than sequential
        const expectedSequentialTime = concurrentScans * 10; // 10ms per scan
        expect(duration).toBeLessThan(expectedSequentialTime * 0.5);
        
        // All operations should complete successfully
        expect(results.length).toBe(concurrentScans);
        results.forEach(dirs => {
          expect(dirs.length).toBeGreaterThan(1000);
        });
        
        yield* Effect.logInfo(`${concurrentScans} concurrent scans took ${duration.toFixed(2)}ms`);
      }).pipe(
        Effect.provide(Layer.succeed(DirectoryPortTag, new MockLargeDirectoryService(1000)))
      )
    );

    it.effect("handles concurrent database operations", () =>
      Effect.gen(function* () {
        const db = yield* DatabasePortTag;
        
        // Prepare concurrent operations
        const concurrentOps = 50;
        const operations = Array.from({ length: concurrentOps }, (_, i) => 
          db.insertRun({
            commandType: "concurrent-test",
            commandArgs: `op-${i}`,
            startTime: new Date(),
            endTime: new Date(),
            exitCode: 0,
            output: `Concurrent output ${i}`,
            workingDirectory: "/concurrent",
          })
        );
        
        const startTime = yield* Effect.sync(() => performance.now());
        
        // Execute all operations concurrently
        yield* Effect.all(operations, { concurrency: "unbounded" });
        
        const endTime = yield* Effect.sync(() => performance.now());
        const duration = endTime - startTime;
        
        // Verify all operations completed
        const results = yield* db.getRecentRuns(concurrentOps);
        const concurrentResults = results.filter(r => r.commandType === "concurrent-test");
        expect(concurrentResults.length).toBe(concurrentOps);
        
        yield* Effect.logInfo(`${concurrentOps} concurrent DB operations took ${duration.toFixed(2)}ms`);
      }).pipe(
        Effect.provide(DatabaseLiveLayer)
      )
    );

    it.effect("handles mixed concurrent operations", () =>
      Effect.gen(function* () {
        const directoryService = yield* DirectoryPortTag;
        const db = yield* DatabasePortTag;
        
        const startTime = yield* Effect.sync(() => performance.now());
        
        // Mix of different operation types
        const operations = [
          // Directory scans
          ...Array.from({ length: 5 }, () => directoryService.findDirs()),
          // Database writes
          ...Array.from({ length: 10 }, (_, i) => 
            db.insertRun({
              commandType: "mixed-test",
              commandArgs: `mixed-${i}`,
              startTime: new Date(),
              endTime: new Date(),
              exitCode: 0,
              output: `Mixed output ${i}`,
              workingDirectory: "/mixed",
            })
          ),
          // Fuzzy matching operations
          ...Array.from({ length: 5 }, () => 
            Effect.sync(() => {
              const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
              return filter("item-50", items);
            })
          ),
        ];
        
        const results = yield* Effect.all(operations, { concurrency: 10 });
        
        const endTime = yield* Effect.sync(() => performance.now());
        const duration = endTime - startTime;
        
        // All operations should complete
        expect(results.length).toBe(20);
        
        yield* Effect.logInfo(`Mixed concurrent operations took ${duration.toFixed(2)}ms`);
      }).pipe(
        Effect.provide(
          Layer.merge(
            Layer.succeed(DirectoryPortTag, new MockLargeDirectoryService(500)),
            DatabaseLiveLayer
          )
        )
      )
    );
  });
});