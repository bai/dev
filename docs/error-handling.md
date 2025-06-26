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

## 2  Error Classes & Exit Codes

```ts
// src/lib/errors.ts
export interface ErrorContext {
  command?: string;
  args?: Record<string, unknown>;
  cwd?: string;
  toolCommand?: string[];
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

| Code | Class                | Typical cause                        |
|-----:|----------------------|--------------------------------------|
|  0   | —                    | Success                              |
|  1   | `CLIError`           | Generic command failure              |
|  2   | `UserInputError`     | Invalid argument / flag / path       |
|  3   | `ExternalToolError`  | `git`, `fzf`, `mise`, etc.           |
|  4   | `ConfigurationError` | Invalid or missing configuration     |
|  5   | `FileSystemError`    | File/directory access issues         |
| 99   | `UnexpectedError`    | Uncaught, truly unexpected exceptions|

## 3  Central Error Handler

```ts
// src/lib/handle-error.ts
const errorCounts = new Map<string, number>();
const MAX_SAME_ERROR = 3;

export function handleFatal(err: unknown, log: Logger): never {
  const errorKey = err instanceof Error ? `${err.name}:${err.message}` : 'unknown';
  const count = errorCounts.get(errorKey) || 0;

  if (isCLIError(err)) {
    if (count < MAX_SAME_ERROR) {
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
    } else if (count === MAX_SAME_ERROR) {
      log.error(`❌ Suppressing further instances of: ${err.name}`);
      errorCounts.set(errorKey, count + 1);
    }

    Bun.exit(err.exitCode);
  }

  // Handle unexpected errors
  if (count < MAX_SAME_ERROR) {
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

// Example usage
export const tryParseConfig = (): Result<DevConfig, ConfigurationError> => {
  try {
    return ok(getDevConfig());
  } catch (error) {
    if (error instanceof CLIError) {
      return err(error as ConfigurationError);
    }
    return err(new ConfigurationError('Failed to parse config', undefined, { cause: error }));
  }
};
```

## 6  Migration Strategy

1. **Create error infrastructure** - implement `errors.ts`, `handle-error.ts`, and `result-types.ts`
2. **Update entry point** - implement centralized error handling with process event handlers
3. **Replace `process.exit` calls systematically**:
   - Command validation → `UserInputError` or `ValidationError`
   - Tool failures → `ExternalToolError`, `GitError`, `NetworkError`
   - File operations → `FileSystemError`
   - Config issues → `ConfigurationError`
   - Unknown errors → `UnexpectedError`
4. **Update command implementations** - use proper error throwing instead of exits
5. **Enhance tests** - assert on typed errors with context validation
6. **Add ESLint rule** - forbid `process.exit` outside `src/index.ts`

## 7  Coding Guidelines

- **Be specific with error types** - use `GitError` instead of generic `ExternalToolError`
- **Include rich context** - add relevant details via `ErrorContext`
- **Aggregate validation errors** - collect all issues before throwing `ValidationError`
- **Use Result types for expected failures** - operations that commonly fail gracefully
- **Provide actionable error messages** - tell users what went wrong and how to fix it
- **Never swallow errors** - re-throw with additional context if needed
- **Prefer early validation** - catch issues before expensive operations

## 8  Testing Patterns

```ts
// src/lib/test-utils.ts
export const expectError = <T extends CLIError>(
  ErrorClass: new (...args: any[]) => T,
  expectedMessage?: string | RegExp
) => ({
  async toThrow(promise: Promise<any>) {
    await expect(promise).rejects.toThrow(ErrorClass);
    if (expectedMessage) {
      await expect(promise).rejects.toThrow(expectedMessage);
    }
  }
});

// Usage examples
describe('config validation', () => {
  test('throws ValidationError for missing required fields', async () => {
    await expectError(ValidationError, /required field/).toThrow(
      validateConfig({})
    );
  });

  test('includes context in errors', async () => {
    try {
      await parseInvalidConfig();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.context).toMatchObject({
        configPath: expect.any(String)
      });
    }
  });
});

describe('result types', () => {
  test('handles success cases', () => {
    const result = tryParseConfig();
    if (result.ok) {
      expect(result.value).toHaveProperty('baseSearchDir');
    }
  });

  test('handles error cases gracefully', () => {
    const result = tryParseInvalidConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ConfigurationError);
    }
  });
});
```

## 9  Recovery Examples

```ts
// Network operations with fallback
export class NetworkError extends RecoverableError {
  readonly exitCode = 3;

  async recover() {
    logger.warn('Network unavailable, using cached data...');
    // Implement fallback logic
  }
}

// Usage in commands
async function updateCommand(context: CommandContext) {
  try {
    await fetchLatestData();
  } catch (error) {
    if (isRecoverableError(error)) {
      await error.recover();
      return; // Continue with fallback behavior
    }
    throw error; // Re-throw non-recoverable errors
  }
}
```

## 10  JSON Output Support

```ts
// In commands that support --json flag
if (context.flags.json) {
  try {
    const result = await executeOperation();
    console.log(JSON.stringify({ success: true, data: result }));
  } catch (error) {
    if (isCLIError(error)) {
      console.log(JSON.stringify({ success: false, error: error.toJSON() }));
      Bun.exit(error.exitCode);
    }
    throw error;
  }
}
```

## 11  Future Extensions

- **Contextual help suggestions** - recommend fixes based on error type and context
- **Error analytics** - track common error patterns for UX improvements
- **Retry mechanisms** - automatic retry for transient failures with exponential backoff
- **Error reporting** - optional telemetry for production deployments
- **Interactive error resolution** - prompt users for common fixes
