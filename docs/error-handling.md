# Error Handling Strategy for `dev` CLI

This document describes how we handle errors in the Bun + TypeScript CLI and how we will migrate the existing code-base away from direct `process.exit` calls to a fully typed, test-friendly architecture.

## 1  Design Principles

1. **Throw, don't exit**
   Any layer below the entry-point expresses failure by *throwing an error*; it must **never** terminate the Node/Bun process directly.
2. **Single exit-point**   (`src/index.ts`)
   Only the top-level file converts an error into an exit code via `Bun.exit` / `process.exit`.
3. **Typed error hierarchy**
   Errors carry semantic meaning and a numeric `exitCode`.
4. **Commander integration**   `program.exitOverride()` forces Commander to throw so that we can handle all errors ourselves.
5. **Transparent logging**
   The logger decides *how* to present errors; the error handler decides *when* to exit.

## 2  Error Classes & Exit Codes

```ts
// src/lib/errors.ts
export abstract class CLIError extends Error { exitCode = 1; }
export class UserInputError extends CLIError { exitCode = 2; }
export class ExternalToolError extends CLIError { exitCode = 3; }
export class UnexpectedError  extends CLIError { exitCode = 99; }

export const isCLIError = (e: unknown): e is CLIError => e instanceof CLIError;
```

Exit-code summary

| Code | Class              | Typical cause                        |
|-----:|--------------------|--------------------------------------|
|  0   | —                  | Success                              |
|  1   | `CLIError`         | Generic command failure              |
|  2   | `UserInputError`   | Invalid argument / flag / path       |
|  3   | `ExternalToolError`| `git`, `fzf`, `mise`, etc.           |
| 99   | `UnexpectedError`  | Uncaught, truly unexpected exceptions|

## 3  Top-Level Error Handler

```ts
// src/lib/handle-error.ts
export function handleFatal(err: unknown, log: Logger): never {
  if (isCLIError(err)) {
    log.error(`❌ ${err.message}`);
    if (isDebugMode() && err.stack) log.error(err.stack);
    Bun.exit(err.exitCode);
  }
  log.error("💥 Unexpected error", err);
  Bun.exit(99);
}
```

`src/index.ts` becomes:

```ts
async function main() {
  // … existing startup
  const program = new Command();
  program.exitOverride((e) => {
    throw new UserInputError(e.message, { cause: e });
  });
  await program.parseAsync(process.argv);
}

main().catch((err) => handleFatal(err, logger));
```

## 4  Migration Checklist

1. **Infrastructure** – add `errors.ts` & `handle-error.ts`.
2. **Entrypoint refactor** – enforce single exit-point.
3. **Commander wiring** – `exitOverride` + `configureOutput`.
4. **Command loader** – re-throw errors instead of exiting.
5. **Remove scattered `process.exit`** – replace with throws:
   * Validation ➜ `UserInputError`
   * Tool failure ➜ `ExternalToolError`
   * Unknown ➜ `UnexpectedError`
6. **Success paths** – never call `exit(0)`; just return.
7. **Tests** – remove `process.exit` stubs; assert typed errors.
8. **ESLint rule** – forbid `process.exit` outside `src/index.ts`.
9. **Docs & README** – link to this file.

## 5  Coding Guidelines

* Throw early, throw typed. Include a helpful message and, where relevant, a `cause`.
* Prefer `invariant(condition, message, ErrorCtor)` helper over ad-hoc checks.
* Logger usage: let the central `handleFatal` decide final output; lower layers may still log contextual info via `logger.debug`.
* Never swallow errors—re-throw after adding context if necessary.

## 6  Testing Guidelines

* Unit tests should use `await expect(fn()).rejects.toThrow(UserInputError)` rather than inspecting exit codes.
* Integration tests may spawn the CLI as a subprocess and assert on exit code mapping.
* Avoid global state between tests; prefer isolated fixtures.

## 7  Roll-Out Strategy

1. Implement infrastructure on branch `error-handling-foundation`.
2. Migrate core + commands.
3. Migrate `lib/tools/*`.
4. Migrate helpers (`handle-cd-to-path`, etc.).
5. Add ESLint rule once **all** calls to `process.exit` are gone.
6. Announce the guideline: *"No direct process.exit outside src/index.ts."*

## 8  Future Extensions

* JSON error output with `--json` once logging layer is decoupled.
* Telemetry/analytics hooks can be added in `handleFatal`.
* Experimental "retry" mechanism for transient `ExternalToolError`s.
