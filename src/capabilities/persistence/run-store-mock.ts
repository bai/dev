import { Effect } from "effect";

import type { RunStoreService } from "~/capabilities/persistence/run-store-port";
import type { CommandRun } from "~/core/models";

interface RunStoreMockOverrides {
  readonly record?: RunStoreService["record"];
  readonly complete?: RunStoreService["complete"];
  readonly prune?: RunStoreService["prune"];
  readonly getRecentRuns?: RunStoreService["getRecentRuns"];
  readonly completeIncompleteRuns?: RunStoreService["completeIncompleteRuns"];
}

interface RunStoreMockOptions {
  readonly runs?: readonly CommandRun[];
  readonly recordedRunId?: string;
  readonly overrides?: RunStoreMockOverrides;
}

export class RunStoreMock implements RunStoreService {
  public readonly recordCalls: Array<Omit<CommandRun, "id" | "durationMs">> = [];
  public readonly completeCalls: Array<{ readonly id: string; readonly exitCode: number; readonly finishedAt: Date }> = [];
  public readonly pruneCalls: number[] = [];
  public readonly getRecentRunsCalls: number[] = [];
  public completeIncompleteRunsCalls = 0;

  public runs: CommandRun[];
  public recordedRunId: string;

  private readonly overrides: RunStoreMockOverrides;

  constructor(options: RunStoreMockOptions = {}) {
    this.runs = [...(options.runs ?? [])];
    this.recordedRunId = options.recordedRunId ?? "run-id";
    this.overrides = options.overrides ?? {};
  }

  record(run: Omit<CommandRun, "id" | "durationMs">) {
    this.recordCalls.push(run);

    if (this.overrides.record) {
      return this.overrides.record(run);
    }

    return Effect.succeed(this.recordedRunId);
  }

  complete(id: string, exitCode: number, finishedAt: Date) {
    this.completeCalls.push({ id, exitCode, finishedAt });

    if (this.overrides.complete) {
      return this.overrides.complete(id, exitCode, finishedAt);
    }

    return Effect.void;
  }

  prune(keepDays: number) {
    this.pruneCalls.push(keepDays);

    if (this.overrides.prune) {
      return this.overrides.prune(keepDays);
    }

    return Effect.void;
  }

  getRecentRuns(limit: number) {
    this.getRecentRunsCalls.push(limit);

    if (this.overrides.getRecentRuns) {
      return this.overrides.getRecentRuns(limit);
    }

    return Effect.succeed([...this.runs]);
  }

  completeIncompleteRuns() {
    this.completeIncompleteRunsCalls += 1;

    if (this.overrides.completeIncompleteRuns) {
      return this.overrides.completeIncompleteRuns();
    }

    return Effect.void;
  }
}
