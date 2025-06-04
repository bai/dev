# Dev CLI Architecture

This document describes architecture of the dev CLI.

## 🎯 Architecture Overview

The dev CLI is built using an **interface-based architecture** that prioritizes **composition over inheritance** and **dependency injection** for maximum testability, maintainability, and extensibility.

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Command       │    │   Command       │    │   Services      │
│   Registry      │────│   Loader        │────│   (Logger,      │
│                 │    │                 │    │    Config)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │ Auto-discovery        │ Commander.js          │ Dependency
         │                       │ Integration           │ Injection
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DevCommand    │    │   Pure Utility  │    │   CommandContext│
│   Interface     │    │   Functions     │    │   (Runtime)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🏗️ Core Components

### 1. DevCommand Interface

The foundation of our architecture is a pure interface that all commands must implement:

```typescript
interface DevCommand {
  name: string;                    // Command name
  description: string;             // Short description
  help?: string;                   // Detailed help text
  arguments?: CommandArgument[];   // Command arguments
  options?: CommandOption[];       // Command options/flags
  aliases?: string[];              // Command aliases
  hidden?: boolean;                // Hide from help
  exec(context: CommandContext): Promise<void> | void;
  validate?(context: CommandContext): boolean | Promise<boolean>;
  setup?(command: Command): void;
}
```

### 2. CommandContext (Dependency Injection)

Runtime context providing all dependencies through injection:

```typescript
interface CommandContext {
  args: Record<string, any>;       // Parsed arguments
  options: Record<string, any>;    // Parsed options
  command: Command;                // Commander.js instance
  logger: Logger;                  // Logger service
  config: ConfigManager;           // Configuration service
}
```

### 3. Pure Utility Functions

Instead of inherited methods, we use pure, testable functions:

```typescript
// Command creation utilities
export function arg(name: string, description: string, options?: {...}): CommandArgument;
export function option(flags: string, description: string, options?: {...}): CommandOption;

// Runtime utilities
export function getArg<T>(context: CommandContext, name: string, defaultValue?: T): T;
export function getOption<T>(context: CommandContext, name: string, defaultValue?: T): T;
export function validateArgs(context: CommandContext, requiredArgs: string[]): void;

// Command execution utilities
export function runCommand(command: string[], context: CommandContext, options?: {...}): void;
export function validateTool(toolName: string, context: CommandContext): void;
```

## ✨ Key Benefits

### 1. **Superior Testability**

- **Pure functions** are easy to test in isolation
- **Explicit dependencies** via context injection
- **No hidden global state** or side effects
- **Mockable services** through dependency injection

```typescript
// Easy to test with mocks
const mockLogger = { success: vi.fn() };
const context = { args: { name: "World" }, logger: mockLogger };
await helloCommand.exec(context);
expect(mockLogger.success).toHaveBeenCalledWith("Hello, World!");
```

### 2. **Composition Over Inheritance**

- **No tight coupling** to base classes
- **Mix and match utilities** as needed
- **More flexible command structure**
- **Easier to extend and modify**

### 3. **Dependency Injection**

- **Services injected** through context
- **Easy to mock** for testing
- **Clear separation** of concerns
- **Runtime flexibility**

### 4. **Type Safety**

- **Full TypeScript support** throughout
- **Strongly typed context** and interfaces
- **Compile-time validation**
- **Better IDE support and autocomplete**

### 5. **Functional Programming**

- **Pure functions** without side effects
- **Immutable data structures**
- **Predictable behavior**
- **Easy to reason about**

## 🚀 Command Implementation Patterns

### Simple Command

```typescript
// src/commands/hello.ts
import type { DevCommand } from "~/types/command";
import { arg, getArg } from "~/utils/command-utils";

export const helloCommand: DevCommand = {
  name: "hello",
  description: "Say hello to someone",

  arguments: [
    arg("name", "Name to greet", { required: true }),
  ],

  async exec(context) {
    const { logger } = context;
    const name = getArg(context, "name");

    logger.success(`Hello, ${name}!`);
  },
};
```

### Advanced Command with Validation

```typescript
// src/commands/deploy.ts
import type { DevCommand } from "~/types/command";
import { arg, getArg, hasOption, option, runCommand, validateChoice } from "~/utils/command-utils";

export const deployCommand: DevCommand = {
  name: "deploy",
  description: "Deploy application to specified environment",
  help: `
Deploy your application to different environments.

Examples:
  dev deploy staging           # Deploy to staging
  dev deploy production --dry-run  # Dry run production deploy
  `,

  arguments: [
    arg("environment", "Target environment", { required: true }),
  ],

  options: [
    option("--dry-run", "Perform a dry run without actual deployment"),
    option("-f, --force", "Force deployment even if checks fail"),
    option("--skip-tests", "Skip running tests before deployment"),
  ],

  async validate(context) {
    const { logger } = context;

    // Validate environment choice
    validateChoice(context, "environment", ["staging", "production"]);

    // Check if production deployment requires confirmation
    const env = getArg(context, "environment");
    const force = hasOption(context, "force");

    if (env === "production" && !force) {
      logger.warn("Production deployment requires --force flag");
      return false;
    }

    return true;
  },

  async exec(context) {
    const { logger, config } = context;

    const environment = getArg(context, "environment");
    const dryRun = hasOption(context, "dry-run");
    const skipTests = hasOption(context, "skip-tests");

    logger.info(`Deploying to ${environment}...`);

    if (!skipTests) {
      logger.info("Running tests...");
      runCommand(["npm", "test"], context);
    }

    if (dryRun) {
      logger.info("Dry run completed successfully");
    } else {
      const deployScript = config.get(`deploy.${environment}.script`, "./deploy.sh");
      runCommand([deployScript, environment], context, { inherit: true });
      logger.success(`Successfully deployed to ${environment}`);
    }
  },
};
```

## 🔄 Command Registration

### Auto-Discovery System

Commands are automatically discovered from the `src/commands/` directory:

```typescript
// Commands are found by these export patterns:
export const myCommand: DevCommand = { ... };           // Named export
export default { name: 'my-command', ... };             // Default export
```

### Manual Registration

```typescript
// For external plugins or custom commands
import { commandRegistry } from "~/core/command-registry";

import { myCustomCommand } from "./my-commands";

commandRegistry.register(myCustomCommand);
```

## 🔌 Services Architecture

### Logger Service

Provides structured, colorized logging throughout the application:

```typescript
// Commands receive logger through context
async exec(context) {
  const { logger } = context;

  logger.info('Informational message');
  logger.warn('Warning message');
  logger.error('Error message');
  logger.success('Success message');
  logger.debug('Debug message (only shown with DEBUG=true)');
}
```

### Configuration Service

Manages application configuration with defaults and runtime overrides:

```typescript
// Access configuration through context
async exec(context) {
  const { config } = context;

  const apiUrl = config.get('api.url', 'https://api.example.com');
  const timeout = config.get('api.timeout', 5000);

  // Set runtime configuration
  config.set('cache.lastRun', new Date().toISOString());
}
```

## 🧪 Testing Strategy

### Pure Function Testing

```typescript
// test/utils/command-utils.test.ts
import { describe, expect, it } from "vitest";

import { getArg, hasOption } from "~/utils/command-utils";

describe("Command Utils", () => {
  it("should get argument with default", () => {
    const context = {
      args: { name: "John" },
      options: {},
      // ... other context properties
    };

    expect(getArg(context, "name")).toBe("John");
    expect(getArg(context, "missing", "default")).toBe("default");
  });
});
```

### Command Testing

```typescript
// test/commands/hello.test.ts
import { describe, expect, it, vi } from "vitest";

import { helloCommand } from "~/commands/hello";

describe("Hello Command", () => {
  it("should greet user", async () => {
    const mockLogger = {
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const context = {
      args: { name: "World" },
      options: {},
      logger: mockLogger,
      config: {} as any,
      command: {} as any,
    };

    await helloCommand.exec(context);

    expect(mockLogger.success).toHaveBeenCalledWith("Hello, World!");
  });
});
```

## 🔄 Migration from Class-Based

### Before (Class-Based) ❌

```typescript
// Old inheritance-based approach
export default class MyCommand extends BaseCommand {
  name = "my-command";
  description = "My command";

  async exec(context: CommandContext): Promise<void> {
    const input = this.getArg(context, 0)!; // Hidden method
    const force = this.hasOption(context, "force");
    console.log(`Processing ${input}`); // Hardcoded console
  }
}
```

### After (Interface-Based) ✅

```typescript
// New composition-based approach
export const myCommand: DevCommand = {
  name: "my-command",
  description: "My command",

  arguments: [
    arg("input", "Input value", { required: true }),
  ],

  options: [
    option("-f, --force", "Force operation"),
  ],

  async exec(context) {
    const { logger } = context; // Injected dependency
    const input = getArg(context, "input"); // Pure function
    const force = hasOption(context, "force");

    logger.info(`Processing ${input}`); // Mockable logger
  },
};
```

## 🔮 Advanced Features

### Custom Validation

```typescript
export const advancedCommand: DevCommand = {
  // ... command definition

  async validate(context) {
    const { logger, config } = context;

    // Custom validation logic
    const apiKey = config.get("api.key");
    if (!apiKey) {
      logger.error("API key not configured");
      return false;
    }

    // Async validation
    try {
      await validateApiKey(apiKey);
      return true;
    } catch (error) {
      logger.error("Invalid API key");
      return false;
    }
  },
};
```

### External Plugin Support

```typescript
// ~/.dev/plugins/my-plugin.ts
import { commandRegistry } from "dev";
import { createCommand } from "dev/utils/command-utils";

const customCommand = createCommand({
  name: "custom",
  description: "My custom command",
  exec: (context) => {
    context.logger.success("Plugin command executed!");
  },
});

commandRegistry.register(customCommand);
```

## 🎯 Design Principles

1. **Composition over Inheritance** - No base class coupling, flexible composition
2. **Dependency Injection** - Services provided through context
3. **Pure Functions** - Predictable, side-effect free utilities
4. **Testability First** - Easy to mock and isolate components
5. **Type Safety** - Full TypeScript support throughout
6. **Functional Style** - Modern JavaScript best practices
7. **Plugin Friendly** - Easy external command registration
8. **Auto-Discovery** - Commands automatically registered from filesystem

## 🚀 Quick Start

1. **Test the example command:**

   ```bash
   bun run src/index.ts example "Hello World" --uppercase --count 3
   ```

2. **Create new commands in `src/commands/`**

3. **Commands are auto-discovered and registered automatically**

This interface-based architecture provides a **production-ready CLI framework** that prioritizes maintainability, testability, and extensibility while maintaining excellent developer experience and type safety throughout.
