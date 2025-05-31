import type { Logger } from "~/lib/core/command-types";

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private debugEnabled = false) {}

  info(message: string, ...args: any[]): void {
    console.log(`${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled || process.env.DEBUG) {
      console.log(`${message}`, ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    console.log(`${message}`, ...args);
  }

  /**
   * Enable or disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    return new PrefixedLogger(this, prefix);
  }
}

/**
 * Logger that adds a prefix to all messages
 */
class PrefixedLogger implements Logger {
  constructor(
    private parent: Logger,
    private prefix: string,
  ) {}

  info(message: string, ...args: any[]): void {
    this.parent.info(`[${this.prefix}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.parent.warn(`[${this.prefix}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.parent.error(`[${this.prefix}] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.parent.debug(`[${this.prefix}] ${message}`, ...args);
  }

  success(message: string, ...args: any[]): void {
    this.parent.success(`[${this.prefix}] ${message}`, ...args);
  }
}

/**
 * Create a logger instance
 */
export function createLogger(debugEnabled?: boolean): Logger {
  return new ConsoleLogger(debugEnabled);
}
