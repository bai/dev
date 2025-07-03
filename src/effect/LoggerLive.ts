import { Effect, Layer } from "effect";

import { LoggerService, type Logger } from "../domain/models";

// Helper function for formatting messages
const formatMessage = (prefix: string, icon: string, message: string): string => {
  const timestamp = new Date().toISOString();
  const prefixPart = prefix ? `[${prefix}] ` : "";
  return `${icon} ${timestamp} ${prefixPart}${message}`;
};

// Factory function to create Logger implementation
export const makeLoggerLive = (prefix = ""): Logger => ({
  info: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.sync(() => {
      console.log(formatMessage(prefix, "ℹ️", message), ...args);
    }),

  warn: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.sync(() => {
      console.warn(formatMessage(prefix, "⚠️", message), ...args);
    }),

  error: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.sync(() => {
      console.error(formatMessage(prefix, "❌", message), ...args);
    }),

  debug: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.sync(() => {
      if (process.env.DEBUG || process.env.DEV_DEBUG) {
        console.debug(formatMessage(prefix, "🐛", message), ...args);
      }
    }),

  success: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.sync(() => {
      console.log(formatMessage(prefix, "✅", message), ...args);
    }),

  child: (childPrefix: string): Logger => {
    const combinedPrefix = prefix ? `${prefix}:${childPrefix}` : childPrefix;
    return makeLoggerLive(combinedPrefix);
  },
});

// Default implementation with no prefix
export const LoggerLiveImpl: Logger = makeLoggerLive();

// Effect Layer for dependency injection
export const LoggerLiveLayer = Layer.succeed(LoggerService, LoggerLiveImpl);
