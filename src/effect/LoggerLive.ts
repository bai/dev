import { Effect, Layer } from "effect";

import { LoggerService, type Logger } from "../domain/models";

export class LoggerLive implements Logger {
  constructor(private prefix = "") {}

  info(message: string, ...args: any[]): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(this.formatMessage("ℹ️", message), ...args);
    });
  }

  warn(message: string, ...args: any[]): Effect.Effect<void> {
    return Effect.sync(() => {
      console.warn(this.formatMessage("⚠️", message), ...args);
    });
  }

  error(message: string, ...args: any[]): Effect.Effect<void> {
    return Effect.sync(() => {
      console.error(this.formatMessage("❌", message), ...args);
    });
  }

  debug(message: string, ...args: any[]): Effect.Effect<void> {
    return Effect.sync(() => {
      if (process.env.DEBUG || process.env.DEV_DEBUG) {
        console.debug(this.formatMessage("🐛", message), ...args);
      }
    });
  }

  success(message: string, ...args: any[]): Effect.Effect<void> {
    return Effect.sync(() => {
      console.log(this.formatMessage("✅", message), ...args);
    });
  }

  child(prefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new LoggerLive(childPrefix);
  }

  private formatMessage(icon: string, message: string): string {
    const timestamp = new Date().toISOString();
    const prefixPart = this.prefix ? `[${this.prefix}] ` : "";
    return `${icon} ${timestamp} ${prefixPart}${message}`;
  }
}

// Effect Layer for dependency injection
export const LoggerLiveLayer = Layer.succeed(LoggerService, new LoggerLive());
