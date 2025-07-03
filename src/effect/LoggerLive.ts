import { Clock, Effect, Layer } from "effect";

import { LoggerService, type Logger } from "../domain/models";

// Helper function for formatting messages using Effect's Clock
const formatMessage = (prefix: string, icon: string, message: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const timestamp = new Date(now).toISOString();
    const prefixPart = prefix ? `[${prefix}] ` : "";
    return `${icon} ${timestamp} ${prefixPart}${message}`;
  });

// Factory function to create Logger implementation
export const makeLoggerLive = (prefix = ""): Logger => ({
  info: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.gen(function* () {
      const formattedMessage = yield* formatMessage(prefix, "ℹ️", message);
      yield* Effect.sync(() => console.log(formattedMessage, ...args));
    }),

  warn: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.gen(function* () {
      const formattedMessage = yield* formatMessage(prefix, "⚠️", message);
      yield* Effect.sync(() => console.warn(formattedMessage, ...args));
    }),

  error: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.gen(function* () {
      const formattedMessage = yield* formatMessage(prefix, "❌", message);
      yield* Effect.sync(() => console.error(formattedMessage, ...args));
    }),

  debug: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (process.env.DEBUG || process.env.DEV_DEBUG) {
        const formattedMessage = yield* formatMessage(prefix, "🐛", message);
        yield* Effect.sync(() => console.debug(formattedMessage, ...args));
      }
    }),

  success: (message: string, ...args: any[]): Effect.Effect<void> =>
    Effect.gen(function* () {
      const formattedMessage = yield* formatMessage(prefix, "✅", message);
      yield* Effect.sync(() => console.log(formattedMessage, ...args));
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
