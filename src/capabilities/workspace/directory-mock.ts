import { Effect } from "effect";

import type { DirectoryService } from "~/capabilities/workspace/directory-port";

interface DirectoryMockOverrides {
  readonly ensureBaseDirectoryExists?: DirectoryService["ensureBaseDirectoryExists"];
  readonly findDirs?: DirectoryService["findDirs"];
}

export class DirectoryMock implements DirectoryService {
  public ensureBaseDirectoryExistsCalls = 0;
  public findDirsCalls = 0;
  public directories: string[];

  private readonly overrides: DirectoryMockOverrides;

  constructor(directories: readonly string[] = [], overrides: DirectoryMockOverrides = {}) {
    this.directories = [...directories];
    this.overrides = overrides;
  }

  ensureBaseDirectoryExists() {
    this.ensureBaseDirectoryExistsCalls += 1;

    if (this.overrides.ensureBaseDirectoryExists) {
      return this.overrides.ensureBaseDirectoryExists();
    }

    return Effect.void;
  }

  findDirs() {
    this.findDirsCalls += 1;

    if (this.overrides.findDirs) {
      return this.overrides.findDirs();
    }

    return Effect.succeed([...this.directories]);
  }
}
