import { ExternalToolError, FileSystemError } from "./errors";

// Lightweight result primitives
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
};

// Helper functions
export const tryTool = <T>(fn: () => T, tool: string) =>
  tryCatch(fn, () => new ExternalToolError(`${tool} failed`, { extra: { tool } }));

export const tryFs = <T>(fn: () => T, path: string) =>
  tryCatch(fn, () => new FileSystemError("FS error", { extra: { path } }));

function tryCatch<T, E extends Error>(fn: () => T, map: (e: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    return err(map(e));
  }
}
