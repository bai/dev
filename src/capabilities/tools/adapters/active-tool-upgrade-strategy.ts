import { Effect } from "effect";

import type { ShellService } from "~/capabilities/system/shell-port";

export type ActiveToolPackageManager = "brew" | "mise" | "unknown";

export interface ActiveToolUpgradeStrategy {
  readonly binaryPath: string | undefined;
  readonly packageManager: ActiveToolPackageManager;
  readonly managerDisplayName: string | undefined;
  readonly command: string | undefined;
  readonly args: readonly string[];
  readonly manualUpgradeHint: string;
}

interface ActiveToolUpgradeStrategyOptions {
  readonly toolId: string;
  readonly brewFormula: string;
  readonly miseTool: string;
}

const getBinaryPath = (shell: ShellService, toolId: string): Effect.Effect<string | undefined, never> =>
  shell.exec("which", [toolId]).pipe(
    Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
    Effect.orElseSucceed(() => undefined),
  );

const getHomebrewPrefix = (shell: ShellService): Effect.Effect<string | undefined, never> =>
  shell.exec("brew", ["--prefix"]).pipe(
    Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
    Effect.orElseSucceed(() => undefined),
  );

const isMiseManagedBinary = (binaryPath: string): boolean =>
  binaryPath.includes("/.local/share/mise/") || binaryPath.includes("/.mise/") || binaryPath.includes("/mise/shims/");

const isHomebrewManagedBinary = (binaryPath: string, homebrewPrefix: string | undefined): boolean =>
  Boolean(homebrewPrefix) && (binaryPath === homebrewPrefix || binaryPath.startsWith(`${homebrewPrefix}/`));

export const resolveActiveToolUpgradeStrategy = (
  shell: ShellService,
  options: ActiveToolUpgradeStrategyOptions,
): Effect.Effect<ActiveToolUpgradeStrategy, never> =>
  Effect.gen(function* () {
    const binaryPath = yield* getBinaryPath(shell, options.toolId);

    if (!binaryPath) {
      return {
        binaryPath: undefined,
        packageManager: "unknown",
        managerDisplayName: undefined,
        command: undefined,
        args: [],
        manualUpgradeHint: `Unable to find ${options.toolId} on PATH. Install it with Homebrew or mise.`,
      } satisfies ActiveToolUpgradeStrategy;
    }

    if (isMiseManagedBinary(binaryPath)) {
      return {
        binaryPath,
        packageManager: "mise",
        managerDisplayName: "mise",
        command: "mise",
        args: ["install", `${options.miseTool}@latest`],
        manualUpgradeHint: `Try manually installing ${options.toolId} via mise: mise install ${options.miseTool}@latest`,
      } satisfies ActiveToolUpgradeStrategy;
    }

    const homebrewPrefix = yield* getHomebrewPrefix(shell);
    if (isHomebrewManagedBinary(binaryPath, homebrewPrefix)) {
      return {
        binaryPath,
        packageManager: "brew",
        managerDisplayName: "Homebrew",
        command: "brew",
        args: ["upgrade", options.brewFormula],
        manualUpgradeHint: `Try manually upgrading ${options.toolId} via Homebrew: brew upgrade ${options.brewFormula}`,
      } satisfies ActiveToolUpgradeStrategy;
    }

    return {
      binaryPath,
      packageManager: "unknown",
      managerDisplayName: undefined,
      command: undefined,
      args: [],
      manualUpgradeHint: `Unable to determine how ${options.toolId} at ${binaryPath} is managed. Upgrade that binary with its package manager.`,
    } satisfies ActiveToolUpgradeStrategy;
  });
