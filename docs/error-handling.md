# Error-Handling Strategy for `dev` CLI (2024-06)

This document is the **single source of truth** for error handling in the `dev` CLI.  Implementations **must not** diverge from these guidelines.

---

## 1 Design Principles

1. **Throw, don't exit** – Any layer below `src/index.ts` throws typed errors; only the entry point converts them into exit codes.
2. **Single exit-point** – `src/index.ts` (via `handleFatal`) is the *only* place that calls `Bun.exit`.
3. **Lean hierarchy, rich context** – Four concrete error classes cover every case; additional details go into a typed context bag.
4. **Commander integration** – `program.exitOverride()` turns Commander failures into typed errors.
5. **Recoverability** – Transient failures expose a `recover()` hook.
6. **Structured logging** – The logger presents errors; the handler decides when to terminate.
7. **Fast, deterministic tests** – Vitest helpers execute each failing path once.

---

## 2 Exit Codes

```ts
// src/lib/exit-code.ts
export enum ExitCode {
  Success      = 0,
  Generic      = 1,
  BadInput     = 2,
  ExternalTool = 3,
  Config       = 4,
  FileSystem   = 5,
  Unexpected   = 99,
}
```

| Code | Class                      | Typical cause                    |
|-----:|----------------------------|----------------------------------|
| 0    | —                          | Success                          |
| 1    | `CLIError`                 | Generic failure                  |
| 2    | `UserInputError`           | Invalid args / flags / paths     |
| 3    | `ExternalToolError`        | `git`, `fzf`, `mise`, etc.       |
| 4    | `ConfigurationError`       | Invalid or missing config        |
| 5    | `FileSystemError`          | File / directory issues          |
| 99   | `UnexpectedError`          | Truly unexpected exceptions      |

---

## 3 Error Types

```ts
// src/lib/errors.ts
import { ExitCode } from './exit-code';

export interface ErrorContext {
  command?: string;
  cwd?: string;
  version?: string;
  sessionId?: string;
  extra?: Record<string, unknown>;   // ad-hoc data
}

export abstract class CLIError extends Error {
  abstract readonly exitCode: ExitCode;
  readonly timestamp = new Date().toISOString();

  constructor(
    message: string,
    public readonly context: ErrorContext = {},
    opts?: ErrorOptions
  ) {
    super(message, opts);
    this.name = new.target.name;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      exitCode: this.exitCode,
      context: this.context,
      timestamp: this.timestamp,
    } as const;
  }
}

// Four concrete classes – add more *only* when handling logic differs.
export class UserInputError     extends CLIError { readonly exitCode = ExitCode.BadInput; }
export class ExternalToolError  extends CLIError { readonly exitCode = ExitCode.ExternalTool; }
export class FileSystemError    extends CLIError { readonly exitCode = ExitCode.FileSystem; }
export class ConfigurationError extends CLIError { readonly exitCode = ExitCode.Config;     }

// Recoverable wrapper
export abstract class RecoverableError extends CLIError {
  abstract recover(): Promise<void> | void;
}

// Type guards
export const isCLIError         = (e: unknown): e is CLIError         => e instanceof CLIError;
export const isRecoverableError = (e: unknown): e is RecoverableError => e instanceof RecoverableError;
```

> **Note** – prefer attaching discriminators in `context.extra` over creating new subclasses.

---

## 4 Central Error Handler

```ts
// src/lib/handle-error.ts
import { ExitCode } from './exit-code';

export interface ErrorHandlerOptions {
  enableRecovery?: boolean;   // default: true
}

export async function handleFatal(
  err: unknown,
  log: Logger,
  { enableRecovery = true }: ErrorHandlerOptions = {}
): Promise<never> {
  if (enableRecovery && isRecoverableError(err)) {
    try {
      await err.recover();
      return; // recovery succeeded – caller continues
    } catch {/* fall-through */}
  }

  if (isCLIError(err)) {
    log.error(`❌ ${err.message}`);
    Bun.exit(err.exitCode);
  }

  log.error('💥 Unexpected error', err);
  Bun.exit(ExitCode.Unexpected);
}
```

`src/index.ts` **must** `await` this function:

```ts
main().catch(err => handleFatal(err, logger));
```

---

## 5 Optional Result Helpers

```ts
// src/lib/result.ts
import { ok, err, unwrap } from './result-core'; // lightweight primitives
import { ExternalToolError, FileSystemError } from './errors';

export const tryTool = <T>(fn: () => T, tool: string) =>
  tryCatch(fn, () => new ExternalToolError(`${tool} failed`, { extra: { tool } }));

export const tryFs = <T>(fn: () => T, path: string) =>
  tryCatch(fn, () => new FileSystemError('FS error', { extra: { path } }));

function tryCatch<T, E extends Error>(fn: () => T, map: (e: unknown) => E) {
  try { return ok(fn()); }
  catch (e) { return err(map(e)); }
}
```

Use `unwrap(result)` to surface failures as exceptions when appropriate.

---

## 6 Vitest Utilities

```ts
// tests/lib/test-utils.ts
import { expect } from 'vitest';
import { CLIError } from '~/lib/errors';

export const expectCLIError = async <T extends CLIError>(
  run: () => Promise<unknown>,
  ErrorClass: new (...args: any[]) => T,
  props?: Partial<T>
) => {
  try {
    await run();
    throw new Error('Expected error not thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorClass);
    if (props) {
      Object.entries(props).forEach(([k, v]) => expect((e as any)[k]).toEqual(v));
    }
  }
};
```

---

## 7 Authoritative File Map

| Concept             | Path                                   |
|---------------------|----------------------------------------|
| Exit codes          | `src/lib/exit-code.ts`                 |
| Error classes       | `src/lib/errors.ts`                    |
| Fatal error handler | `src/lib/handle-error.ts`              |
| Result helpers      | `src/lib/result.ts` (optional)         |
| Test helpers        | `tests/lib/test-utils.ts`              |

---

**Stick to these constructs.** Create new subclasses *only* when the handling logic itself changes; otherwise attach discriminators in `context.extra`.  Happy coding! 🎉
