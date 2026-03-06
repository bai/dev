import { Effect } from "effect";

import type { ShellService, SpawnResult } from "~/capabilities/system/shell-port";
import { shellExecutionError } from "~/core/errors";

export class ShellMock implements ShellService {
  public readonly execCalls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options?: { readonly cwd?: string };
  }> = [];

  public readonly execInteractiveCalls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options?: { readonly cwd?: string };
  }> = [];

  private readonly execResponses = new Map<string, SpawnResult>();
  private readonly interactiveResponses = new Map<string, number>();
  private readonly execFailures = new Set<string>();

  private key(command: string, args: readonly string[]): string {
    return `${command} ${args.join(" ")}`;
  }

  setExecResponse(command: string, args: readonly string[], response: SpawnResult): void {
    this.execResponses.set(this.key(command, args), response);
  }

  setExecFailure(command: string, args: readonly string[]): void {
    this.execFailures.add(this.key(command, args));
  }

  setExecInteractiveResponse(command: string, args: readonly string[], exitCode: number): void {
    this.interactiveResponses.set(this.key(command, args), exitCode);
  }

  exec(
    command: string,
    args: string[] = [],
    options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<SpawnResult, never> {
    this.execCalls.push({ command, args, options });
    const key = this.key(command, args);

    if (this.execFailures.has(key)) {
      return Effect.fail(shellExecutionError(command, args, "Command execution failed")) as never;
    }

    const response = this.execResponses.get(key);
    if (response) {
      return Effect.succeed(response);
    }

    return Effect.succeed({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  }

  execInteractive(
    command: string,
    args: string[] = [],
    options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<number, never> {
    this.execInteractiveCalls.push({ command, args, options });
    return Effect.succeed(this.interactiveResponses.get(this.key(command, args)) ?? 0);
  }

  setProcessCwd(_path: string): Effect.Effect<void> {
    return Effect.void;
  }
}
