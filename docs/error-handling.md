# Error Handling Strategy for `dev` CLI

This document describes the modern, typed error handling architecture for our Bun + TypeScript CLI.

## 1  Design Principles

1. **Throw, don't exit**
   Any layer below the entry-point expresses failure by *throwing an error*; it must **never** terminate the process directly.
2. **Single exit-point** (`src/index.ts`)
   Only the top-level file converts errors into exit codes via `Bun.exit`.
3. **Rich error hierarchy**
   Errors carry semantic meaning, exit codes, and structured context for debugging and user guidance.
4. **Commander integration**
   `program.exitOverride()` forces Commander to throw so we handle all errors centrally.
5. **Transparent logging**
   The logger presents errors; the error handler decides when to exit.
6. **Graceful degradation**
   Provide recovery mechanisms and meaningful fallbacks where possible.
7. **CLI-specific error types**
   Specialized error classes for common CLI operations like tool upgrades, directory navigation, and fuzzy search.

## 2  Error Classes & Exit Codes

```ts
// src/lib/errors.ts
export interface ErrorContext {
  command?: string;
  args?: Record<string, unknown>;
  cwd?: string;
  toolCommand?: string[];
  timestamp?: string;
  userId?: string;
  sessionId?: string;
  environment?: 'development' | 'production' | 'test';
  platform?: NodeJS.Platform;
  nodeVersion?: string;
  // For file operations
  fileOperationId?: string;
  // For network operations
  requestId?: string;
  retryAttempt?: number;
  // For tool operations
  currentVersion?: string;
  requiredVersion?: string;
  reason?: string;
  [key: string]: unknown;
}

export abstract class CLIError extends Error {
  abstract readonly exitCode: number;
  readonly timestamp = new Date().toISOString();

  constructor(
    message: string,
    public readonly context?: ErrorContext,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }

  // JSON serialization for programmatic output
  toJSON(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      exitCode: this.exitCode,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

export class UserInputError extends CLIError {
  readonly exitCode = 2;
  constructor(
    message: string,
    public readonly invalidInput?: string,
    context?: ErrorContext
  ) {
    super(message, context);
  }
}

export class ValidationError extends UserInputError {
  constructor(
    public readonly issues: Array<{ field: string; message: string }>,
    context?: ErrorContext
  ) {
    const message = `Validation failed:\n${issues.map(i => `  • ${i.field}: ${i.message}`).join('\n')}`;
    super(message, undefined, context);
  }
}

export class ExternalToolError extends CLIError {
  readonly exitCode = 3;
  constructor(
    message: string,
    public readonly tool: string,
    public readonly toolExitCode?: number,
    public readonly stderr?: string,
    context?: ErrorContext
  ) {
    super(message, context);
  }
}

export class GitError extends ExternalToolError {
  constructor(message: string, gitCommand: string[], exitCode?: number, stderr?: string) {
    super(`Git operation failed: ${message}`, 'git', exitCode, stderr, { toolCommand: gitCommand });
  }
}

export class NetworkError extends ExternalToolError {
  constructor(message: string, tool: string, cause?: Error) {
    super(`Network operation failed: ${message}`, tool, undefined, undefined, { cause });
  }
}

export class ToolUpgradeError extends ExternalToolError {
  constructor(
    tool: string,
    currentVersion?: string,
    requiredVersion?: string,
    context?: ErrorContext
  ) {
    super(`${tool} upgrade failed`, tool, undefined, undefined, {
      ...context,
      currentVersion,
      requiredVersion
    });
  }
}

export class DirectoryNavigationError extends CLIError {
  readonly exitCode = 5;
  constructor(
    targetPath: string,
    reason: 'not_found' | 'permission_denied' | 'not_directory',
    context?: ErrorContext
  ) {
    super(
      `Cannot navigate to directory: ${targetPath}`,
      { ...context, path: targetPath, operation: 'navigation', reason }
    );
  }
}

export class FuzzySearchError extends ExternalToolError {
  constructor(
    message: string,
    exitCode?: number,
    context?: ErrorContext
  ) {
    super(`Fuzzy search failed: ${message}`, 'fzf', exitCode, undefined, context);
  }
}

export class ConfigurationError extends CLIError {
  readonly exitCode = 4;
  constructor(message: string, public readonly configPath?: string, context?: ErrorContext) {
    super(message, context);
  }
}

export class FileSystemError extends CLIError {
  readonly exitCode = 5;
  constructor(
    message: string,
    public readonly path: string,
    public readonly operation: string,
    context?: ErrorContext
  ) {
    super(message, context);
  }
}

export abstract class RecoverableError extends CLIError {
  abstract recover(): Promise<void> | void;
}

export class NetworkErrorWithFallback extends RecoverableError {
  readonly exitCode = 3;

  constructor(
    message: string,
    private fallbackAction: () => Promise<void>,
    context?: ErrorContext
  ) {
    super(message, context);
  }

  async recover(): Promise<void> {
    logger.warn('⚠️  Network unavailable, using fallback strategy...');
    await this.fallbackAction();
  }
}

export class ToolMissingError extends RecoverableError {
  readonly exitCode = 3;

  constructor(
    public readonly toolName: string,
    public readonly installCommand: string,
    context?: ErrorContext
  ) {
    super(`Required tool '${toolName}' is not installed`, context);
  }

  async recover(): Promise<void> {
    logger.warn(`⚠️  Installing missing tool: ${this.toolName}`);
    logger.info(`💡 Run: ${this.installCommand}`);
    // Could implement auto-installation logic here
  }
}

export class UnexpectedError extends CLIError {
  readonly exitCode = 99;
}

// Type guards and utilities
export const isCLIError = (e: unknown): e is CLIError => e instanceof CLIError;
export const isRecoverableError = (e: unknown): e is RecoverableError => e instanceof RecoverableError;

export interface SerializedError {
  name: string;
  message: string;
  exitCode: number;
  context?: ErrorContext;
  timestamp: string;
}
```

Exit-code summary:

| Code | Class                         | Typical cause                        |
|-----:|-------------------------------|--------------------------------------|
|  0   | —                             | Success                              |
|  1   | `CLIError`                    | Generic command failure              |
|  2   | `UserInputError`              | Invalid argument / flag / path       |
|  3   | `ExternalToolError`           | `git`, `fzf`, `mise`, etc.           |
|  3   | `ToolUpgradeError`            | Tool upgrade failures                |
|  3   | `FuzzySearchError`            | fzf search failures                  |
|  3   | `NetworkErrorWithFallback`    | Network errors with recovery         |
|  3   | `ToolMissingError`            | Missing required tools               |
|  4   | `ConfigurationError`          | Invalid or missing configuration     |
|  5   | `FileSystemError`             | File/directory access issues         |
|  5   | `DirectoryNavigationError`    | CD navigation failures               |
| 99   | `UnexpectedError`             | Uncaught, truly unexpected exceptions|

## 3  Enhanced Central Error Handler

```ts
// src/lib/handle-error.ts
export interface ErrorHandlerOptions {
  maxSameError?: number;
  enableRecovery?: boolean;
  enableTelemetry?: boolean;
  suppressSpam?: boolean;
}

const errorCounts = new Map<string, number>();
const MAX_SAME_ERROR = 3;

export function handleFatal(
  err: unknown,
  log: Logger,
  options: ErrorHandlerOptions = {}
): never {
  const {
    maxSameError = MAX_SAME_ERROR,
    enableRecovery = true,
    suppressSpam = true
  } = options;

  // Enhanced error tracking with truncated messages to avoid memory issues
  const errorKey = err instanceof Error ?
    `${err.name}:${err.message.slice(0, 100)}` : 'unknown';
  const count = errorCounts.get(errorKey) || 0;

  // Try recovery first for recoverable errors
  if (enableRecovery && isRecoverableError(err)) {
    try {
      await err.recover();
      return; // Recovery successful, don't exit
    } catch (recoveryError) {
      log.error('❌ Recovery failed, proceeding with fatal error handling');
    }
  }

  if (isCLIError(err)) {
    if (count < maxSameError) {
      log.error(`❌ ${err.message}`);

      // Show context in debug mode
      if (err.context && isDebugMode()) {
        log.error('Context:', JSON.stringify(err.context, null, 2));
      }

      // Show stack trace in debug mode
      if (isDebugMode() && err.stack) {
        log.error(err.stack);
      }

      errorCounts.set(errorKey, count + 1);
    } else if (count === maxSameError && suppressSpam) {
      log.error(`❌ Suppressing further instances of: ${err.name}`);
      errorCounts.set(errorKey, count + 1);
    }

    Bun.exit(err.exitCode);
  }

  // Handle unexpected errors
  if (count < maxSameError) {
    log.error("💥 Unexpected error:", err);
    errorCounts.set(errorKey, count + 1);
  }

  Bun.exit(99);
}

export function handleWithRecovery(err: unknown, log: Logger): Promise<void> | void {
  if (isRecoverableError(err)) {
    log.warn(`⚠️  ${err.message} - attempting recovery...`);
    return err.recover();
  }

  handleFatal(err, log);
}
```

## 4  Entry Point Implementation

```ts
// src/index.ts
async function main() {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    handleFatal(new UnexpectedError('Unhandled promise rejection', { reason }), logger);
  });

  process.on('uncaughtException', (err) => {
    handleFatal(new UnexpectedError('Uncaught exception', { originalError: err.message }), logger);
  });

  // Setup and run CLI
  await ensureBaseDirectoryExists();
  await ensureDatabaseIsUpToDate();
  await recordCommandRun();
  await runPeriodicUpgradeCheck();
  await ensureMiseVersionOrUpgrade();

  if (process.argv.slice(2).length === 0) {
    process.argv.push("help");
  }

  const config = createConfig();
  const program = new Command();

  program
    .name("dev")
    .description("A CLI tool for quick directory navigation and environment management")
    .version(getCurrentGitCommitSha())
    .exitOverride((err) => {
      throw new UserInputError(err.message, err.message, { commanderError: err });
    });

  await autoDiscoverCommands(path.join(__dirname, "commands"));
  const allCommands = commandRegistry.getAll();
  loadAllCommands(allCommands, program, logger, config);

  await program.parseAsync(process.argv);
}

main().catch((err) => handleFatal(err, logger));
```

## 5  Result Types for Graceful Handling

```ts
// src/lib/result-types.ts
export type Result<T, E extends CLIError = CLIError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E extends CLIError>(error: E): Result<never, E> => ({ ok: false, error });

// Utility functions
export const unwrap = <T, E extends CLIError>(result: Result<T, E>): T => {
  if (result.ok) return result.value;
  throw result.error;
};

export const unwrapOr = <T, E extends CLIError>(result: Result<T, E>, defaultValue: T): T => {
  return result.ok ? result.value : defaultValue;
};

export const mapResult = <T, U, E extends CLIError>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> => {
  return result.ok ? ok(fn(result.value)) : result;
};

// CLI-specific result helpers
export const tryToolOperation = <T>(
  operation: () => T,
  toolName: string,
  context?: ErrorContext
): Result<T, ExternalToolError> => {
  try {
    return ok(operation());
  } catch (error) {
    if (error instanceof CLIError) {
      return err(error as ExternalToolError);
    }
    return err(new ExternalToolError(
      `Tool operation failed: ${error}`,
      toolName,
      undefined,
      undefined,
      context
    ));
  }
};

export const tryFileOperation = <T>(
  operation: () => T,
  path: string,
  operationType: string,
  context?: ErrorContext
): Result<T, FileSystemError> => {
  try {
    return ok(operation());
  } catch (error) {
    if (error instanceof CLIError) {
      return err(error as FileSystemError);
    }
    return err(new FileSystemError(
      `File operation failed: ${error}`,
      path,
      operationType,
      context
    ));
  }
};
```

## 6  Enhanced Testing Patterns

```ts
// src/lib/test-utils.ts
import { describe, expect, it, vi } from 'vitest';
import type { Command } from 'commander';
import type { CommandContext, Logger, ConfigManager } from '~/lib/core/command-types';

export const createTestLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  success: vi.fn(),
  child: vi.fn(() => createTestLogger())
});

export const createTestConfig = (): ConfigManager => ({
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  getAll: vi.fn(() => ({}))
});

export const createTestContext = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  args: {},
  options: {},
  command: {} as Command,
  logger: createTestLogger(),
  config: createTestConfig(),
  ...overrides
});

export const expectCLIError = async <T extends CLIError>(
  operation: () => Promise<any>,
  ErrorClass: new (...args: any[]) => T,
  expectedProps?: Partial<T>
) => {
  await expect(operation()).rejects.toThrow(ErrorClass);

  if (expectedProps) {
    try {
      await operation();
    } catch (error) {
      if (error instanceof ErrorClass) {
        Object.entries(expectedProps).forEach(([key, value]) => {
          expect((error as any)[key]).toEqual(value);
        });
      }
    }
  }
};

export const expectErrorWithContext = async (
  operation: () => Promise<any>,
  expectedContext: Partial<ErrorContext>
) => {
  try {
    await operation();
    throw new Error('Expected operation to throw');
  } catch (error) {
    if (error instanceof CLIError && error.context) {
      Object.entries(expectedContext).forEach(([key, value]) => {
        expect(error.context![key]).toEqual(value);
      });
    } else {
      throw new Error('Error does not have expected context');
    }
  }
};

// Usage examples
describe('error handling integration', () => {
  it('handles tool upgrade failures with proper context', async () => {
    await expectCLIError(
      () => ensureMiseVersionOrUpgrade(),
      ToolUpgradeError,
      { tool: 'mise', exitCode: 3 }
    );
  });

  it('handles directory navigation with detailed context', async () => {
    await expectErrorWithContext(
      () => handleCdToPath('/nonexistent/path'),
      {
        path: '/nonexistent/path',
        operation: 'navigation',
        reason: 'not_found'
      }
    );
  });

  it('provides recovery for network errors', async () => {
    const fallbackCalled = vi.fn();
    const networkError = new NetworkErrorWithFallback(
      'Connection failed',
      fallbackCalled
    );

    await networkError.recover();
    expect(fallbackCalled).toHaveBeenCalled();
  });
});
```

## 7  JSON Output Support

```ts
// src/lib/json-output.ts
export interface CLIResult<T = any> {
  success: boolean;
  data?: T;
  error?: SerializedError;
  metadata: {
    command: string;
    timestamp: string;
    duration: number;
    version: string;
    platform: string;
    nodeVersion: string;
  };
}

export function formatSuccessResult<T>(
  result: T,
  context: CommandContext,
  startTime: number
): CLIResult<T> {
  return {
    success: true,
    data: result,
    metadata: {
      command: context.command.name(),
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      version: getCurrentGitCommitSha(),
      platform: process.platform,
      nodeVersion: process.version
    }
  };
}

export function formatErrorResult(
  error: CLIError,
  context: CommandContext,
  startTime: number
): CLIResult {
  return {
    success: false,
    error: error.toJSON(),
    metadata: {
      command: context.command.name(),
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      version: getCurrentGitCommitSha(),
      platform: process.platform,
      nodeVersion: process.version
    }
  };
}

// Usage in commands that support --json flag
export function withJSONOutput<T>(
  operation: () => Promise<T>,
  context: CommandContext
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();

    try {
      const result = await operation();

      if (context.options.json) {
        console.log(JSON.stringify(formatSuccessResult(result, context, startTime), null, 2));
      }

      resolve();
    } catch (error) {
      if (context.options.json && isCLIError(error)) {
        console.log(JSON.stringify(formatErrorResult(error, context, startTime), null, 2));
        Bun.exit(error.exitCode);
      }

      reject(error);
    }
  });
}
```

## 8  Coding Guidelines

- **Use specific error types** - prefer `ToolUpgradeError` over generic `ExternalToolError`
- **Include rich context** - add all relevant details via `ErrorContext`
- **Aggregate validation errors** - collect all issues before throwing `ValidationError`
- **Use Result types for expected failures** - operations that commonly fail gracefully
- **Provide actionable error messages** - tell users what went wrong and how to fix it
- **Never swallow errors** - re-throw with additional context if needed
- **Prefer early validation** - catch issues before expensive operations
- **Implement recovery for transient failures** - network issues, missing tools, etc.
- **Use structured logging** - consistent error formatting across the CLI

## 9  Recovery Implementation Examples

```ts
// Network operations with intelligent fallback
export async function fetchWithFallback<T>(
  primaryFetch: () => Promise<T>,
  fallbackFetch: () => Promise<T>,
  context?: ErrorContext
): Promise<T> {
  try {
    return await primaryFetch();
  } catch (error) {
    const networkError = new NetworkErrorWithFallback(
      'Primary fetch failed, using fallback',
      fallbackFetch,
      context
    );

    await networkError.recover();
    return fallbackFetch();
  }
}

// Tool installation with auto-recovery
export async function ensureToolOrInstall(
  toolName: string,
  installCommand: string,
  validator: () => boolean
): Promise<void> {
  if (validator()) return;

  const toolError = new ToolMissingError(toolName, installCommand);
  await handleWithRecovery(toolError, logger);

  // Verify installation succeeded
  if (!validator()) {
    throw new ExternalToolError(
      `Failed to install ${toolName}`,
      toolName,
      1,
      undefined,
      { installCommand }
    );
  }
}
```

## 10  ESLint Configuration

```ts
// eslint.config.ts - Add this rule to prevent process.exit outside main entry point
export default [
  {
    rules: {
      'no-process-exit': ['error'],
    }
  },
  {
    files: ['src/index.ts'],
    rules: {
      'no-process-exit': 'off' // Allow only in main entry point
    }
  }
];
```

This error handling architecture provides a robust, type-safe foundation for the CLI with comprehensive error classification, recovery mechanisms, and excellent developer experience through detailed context and testing utilities.
