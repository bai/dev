import type { Logger } from "~/types/command";

/**
 * Color codes for console output
 */
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private debugEnabled = false) {}

  info(message: string, ...args: any[]): void {
    console.log(`${colors.blue}ℹ${colors.reset} ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`${colors.yellow}⚠${colors.reset} ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`${colors.red}❌${colors.reset} ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled || process.env.DEBUG) {
      console.log(`${colors.gray}🔧${colors.reset} ${message}`, ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    console.log(`${colors.green}✅${colors.reset} ${message}`, ...args);
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
