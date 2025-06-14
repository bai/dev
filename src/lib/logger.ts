import type { Logger } from "~/lib/core/command-types";
import { isDebugMode } from "~/lib/is-debug-mode";

/**
 * Logger configuration
 */
interface LoggerConfig {
  debugEnabled?: boolean;
  prefix?: string;
}

/**
 * Internal logger state
 */
interface LoggerState {
  debugEnabled: boolean;
  prefix?: string;
}

/**
 * Create a logger implementation with given configuration
 */
function createLogger(config: LoggerConfig = {}): Logger {
  const state: LoggerState = {
    debugEnabled: config.debugEnabled ?? false,
    prefix: config.prefix,
  };

  const formatMessage = (message: string): string => {
    return state.prefix ? `[${state.prefix}] ${message}` : message;
  };

  const logger: Logger = {
    info(message: string, ...args: any[]): void {
      console.log(formatMessage(message), ...args);
    },

    warn(message: string, ...args: any[]): void {
      console.warn(formatMessage(message), ...args);
    },

    error(message: string, ...args: any[]): void {
      console.error(formatMessage(message), ...args);
    },

    debug(message: string, ...args: any[]): void {
      if (state.debugEnabled || isDebugMode()) {
        console.log(formatMessage(message), ...args);
      }
    },

    success(message: string, ...args: any[]): void {
      console.log(formatMessage(message), ...args);
    },

    child(prefix: string): Logger {
      const childPrefix = state.prefix ? `${state.prefix}:${prefix}` : prefix;
      return createLogger({
        debugEnabled: state.debugEnabled,
        prefix: childPrefix,
      });
    },
  };

  return logger;
}

/**
 * Default logger instance - import this directly to use logging
 */
export const logger = createLogger({ debugEnabled: false });
