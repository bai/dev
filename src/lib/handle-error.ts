import type { Logger } from "./core/command-types";
import { isCLIError, isRecoverableError } from "./errors";
import { ExitCode } from "./exit-code";

export interface ErrorHandlerOptions {
  enableRecovery?: boolean; // default: true
}

export async function handleFatal(
  err: unknown,
  log: Logger,
  { enableRecovery = true }: ErrorHandlerOptions = {},
): Promise<never> {
  if (enableRecovery && isRecoverableError(err)) {
    try {
      await err.recover();
      // Recovery succeeded - we should not exit, but this function is meant to be fatal
      // This should not happen in practice, as recoverable errors should be handled elsewhere
    } catch {
      /* fall-through to error handling */
    }
  }

  if (isCLIError(err)) {
    log.error(`❌ ${err.message}`);
    process.exit(err.exitCode);
  }

  log.error("💥 Unexpected error", err);
  process.exit(ExitCode.Unexpected);
}
