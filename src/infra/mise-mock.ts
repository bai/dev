import { Effect } from "effect";

import { shellExecutionError } from "../domain/errors";
import type { Mise, MiseInfo } from "../domain/mise-port";

interface MiseMockOverrides {
  readonly checkInstallation?: Mise["checkInstallation"];
  readonly install?: Mise["install"];
  readonly installTools?: Mise["installTools"];
  readonly runTask?: Mise["runTask"];
  readonly getTasks?: Mise["getTasks"];
  readonly setupGlobalConfig?: Mise["setupGlobalConfig"];
}

interface MiseMockOptions {
  readonly installed?: boolean;
  readonly info?: MiseInfo;
  readonly tasks?: readonly string[];
  readonly overrides?: MiseMockOverrides;
}

export class MiseMock implements Mise {
  public checkInstallationCalls = 0;
  public installCalls = 0;
  public readonly installToolsCalls: Array<string | undefined> = [];
  public readonly runTaskCalls: Array<{
    readonly taskName: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
  }> = [];
  public readonly getTasksCalls: Array<string | undefined> = [];
  public setupGlobalConfigCalls = 0;

  public installed: boolean;
  public info: MiseInfo;
  public tasks: string[];

  private readonly overrides: MiseMockOverrides;

  constructor(options: MiseMockOptions = {}) {
    this.installed = options.installed ?? true;
    this.info = options.info ?? {
      version: "2026.1.0",
      runtimeVersions: {},
    };
    this.tasks = [...(options.tasks ?? [])];
    this.overrides = options.overrides ?? {};
  }

  checkInstallation() {
    this.checkInstallationCalls += 1;

    if (this.overrides.checkInstallation) {
      return this.overrides.checkInstallation();
    }

    if (!this.installed) {
      return Effect.fail(shellExecutionError("mise", ["--version"], "not installed"));
    }

    return Effect.succeed(this.info);
  }

  install() {
    this.installCalls += 1;

    if (this.overrides.install) {
      return this.overrides.install();
    }

    return Effect.void;
  }

  installTools(cwd?: string) {
    this.installToolsCalls.push(cwd);

    if (this.overrides.installTools) {
      return this.overrides.installTools(cwd);
    }

    return Effect.void;
  }

  runTask(taskName: string, args?: readonly string[], cwd?: string) {
    this.runTaskCalls.push({ taskName, args, cwd });

    if (this.overrides.runTask) {
      return this.overrides.runTask(taskName, args, cwd);
    }

    return Effect.void;
  }

  getTasks(cwd?: string) {
    this.getTasksCalls.push(cwd);

    if (this.overrides.getTasks) {
      return this.overrides.getTasks(cwd);
    }

    return Effect.succeed([...this.tasks]);
  }

  setupGlobalConfig() {
    this.setupGlobalConfigCalls += 1;

    if (this.overrides.setupGlobalConfig) {
      return this.overrides.setupGlobalConfig();
    }

    return Effect.void;
  }
}
