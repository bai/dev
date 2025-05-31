# Interface-Based CLI Architecture

This document describes the superior interface-based approach for the dev CLI, which provides better testability, maintainability, and extensibility compared to class-based inheritance patterns.

## 🎯 Architecture Overview

The interface-based CLI uses **composition over inheritance** and **dependency injection** for a cleaner, more flexible design:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Command       │    │   Command       │    │   Services      │
│   Registry      │────│   Loader        │────│   (Logger,      │
│                 │    │                 │    │    Config)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DevCommand    │    │   Commander.js  │    │   CommandContext│
│   Interface     │    │   Integration   │    │   (Runtime)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Core Components

### 1. DevCommand Interface

Pure interface that all commands must implement:

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

### 2. CommandContext

Runtime context with dependency injection:

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

Instead of inherited methods, use pure functions:

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

## 🚀 Creating Commands

### Simple Command

```typescript
// src/commands/hello.ts
import type { DevCommand } from '~/types/command';
import { arg, getArg } from '~/utils/command-utils';

export const helloCommand: DevCommand = {
  name: 'hello',
  description: 'Say hello to someone',

  arguments: [
    arg('name', 'Name to greet', { required: true }),
  ],

  async exec(context) {
    const { logger } = context;
    const name = getArg(context, 'name');

    logger.success(`Hello, ${name}!`);
  }
};
```

### Advanced Command with Validation

```typescript
// src/commands/deploy.ts
import type { DevCommand } from '~/types/command';
import {
  arg,
  option,
  getArg,
  hasOption,
  validateChoice,
  isGitRepository,
  runCommand
} from '~/utils/command-utils';

export const deployCommand: DevCommand = {
  name: 'deploy',
  description: 'Deploy application to specified environment',
  help: `
Deploy your application to different environments.

Examples:
  dev deploy staging           # Deploy to staging
  dev deploy production --dry-run  # Dry run production deploy
  `,

  arguments: [
    arg('environment', 'Target environment', { required: true }),
  ],

  options: [
    option('--dry-run', 'Perform a dry run without actual deployment'),
    option('-f, --force', 'Force deployment even if checks fail'),
    option('--skip-tests', 'Skip running tests before deployment'),
  ],

  async validate(context) {
    const { logger } = context;

    // Validate environment choice
    validateChoice(context, 'environment', ['staging', 'production']);

    // Check git repository
    if (!isGitRepository()) {
      logger.error('Must be run in a git repository');
      return false;
    }

    // Check if production deployment requires confirmation
    const env = getArg(context, 'environment');
    const force = hasOption(context, 'force');

    if (env === 'production' && !force) {
      logger.warn('Production deployment requires --force flag');
      return false;
    }

    return true;
  },

  async exec(context) {
    const { logger, config } = context;

    const environment = getArg(context, 'environment');
    const dryRun = hasOption(context, 'dry-run');
    const skipTests = hasOption(context, 'skip-tests');

    logger.info(`Deploying to ${environment}...`);

    if (!skipTests) {
      logger.info('Running tests...');
      runCommand(['npm', 'test'], context);
    }

    if (dryRun) {
      logger.info('Dry run completed successfully');
    } else {
      const deployScript = config.get(`deploy.${environment}.script`, './deploy.sh');
      runCommand([deployScript, environment], context, { inherit: true });
      logger.success(`Successfully deployed to ${environment}`);
    }
  }
};
```

## 🏗️ Command Registration

### Auto-Discovery

Commands are automatically discovered from `src/commands/`:

```typescript
// Commands are found by these export patterns:
export const myCommand: DevCommand = { ... };           // Named export
export default { name: 'my-command', ... };             // Default export
```

### Manual Registration

```typescript
// In your main file or plugin
import { commandRegistry } from '~/core/command-registry';
import { myCustomCommand } from './my-commands';

commandRegistry.register(myCustomCommand);
```

## 🔌 Services and Dependency Injection

### Logger Service

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

## 🧪 Testing

### Pure Function Testing

```typescript
// test/utils/command-utils.test.ts
import { describe, it, expect } from 'vitest';
import { getArg, hasOption } from '~/utils/command-utils';

describe('Command Utils', () => {
  it('should get argument with default', () => {
    const context = {
      args: { name: 'John' },
      options: {},
      // ... other context properties
    };

    expect(getArg(context, 'name')).toBe('John');
    expect(getArg(context, 'missing', 'default')).toBe('default');
  });
});
```

### Command Testing

```typescript
// test/commands/hello.test.ts
import { describe, it, expect, vi } from 'vitest';
import { helloCommand } from '~/commands/hello';

describe('Hello Command', () => {
  it('should greet user', async () => {
    const mockLogger = {
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const context = {
      args: { name: 'World' },
      options: {},
      logger: mockLogger,
      config: {} as any,
      command: {} as any,
    };

    await helloCommand.exec(context);

    expect(mockLogger.success).toHaveBeenCalledWith('Hello, World!');
  });
});
```

## 🔄 Migration from Class-Based

### Before (Class-Based)

```typescript
// Old approach
export default class MyCommand extends BaseCommand {
  name = 'my-command';
  description = 'My command';

  async exec(context: CommandContext): Promise<void> {
    const input = this.getArg(context, 0)!;
    const force = this.hasOption(context, 'force');
    console.log(`Processing ${input}`);
  }
}
```

### After (Interface-Based)

```typescript
// New approach
export const myCommand: DevCommand = {
  name: 'my-command',
  description: 'My command',

  arguments: [
    arg('input', 'Input value', { required: true }),
  ],

  options: [
    option('-f, --force', 'Force operation'),
  ],

  async exec(context) {
    const { logger } = context;
    const input = getArg(context, 'input');
    const force = hasOption(context, 'force');

    logger.info(`Processing ${input}`);
  }
};
```

## ✨ Benefits

### 1. **Better Testability**
- Pure functions are easy to test
- Explicit dependencies via context
- No hidden global state

### 2. **Composition Over Inheritance**
- Mix and match utilities as needed
- No tight coupling to base classes
- More flexible command structure

### 3. **Dependency Injection**
- Services injected through context
- Easy to mock for testing
- Clear separation of concerns

### 4. **Type Safety**
- Full TypeScript support
- Strongly typed context
- Compile-time validation

### 5. **Functional Programming**
- Pure functions
- Immutable data
- Predictable behavior

### 6. **Extensibility**
- Easy to add new utilities
- Plugin-friendly architecture
- External command registration

## 🔮 Advanced Usage

### Custom Validation

```typescript
export const advancedCommand: DevCommand = {
  // ... command definition

  async validate(context) {
    const { logger, config } = context;

    // Custom validation logic
    const apiKey = config.get('api.key');
    if (!apiKey) {
      logger.error('API key not configured');
      return false;
    }

    // Async validation
    try {
      await validateApiKey(apiKey);
      return true;
    } catch (error) {
      logger.error('Invalid API key');
      return false;
    }
  }
};
```

### Custom Setup

```typescript
export const specialCommand: DevCommand = {
  // ... command definition

  setup(command) {
    // Custom commander.js setup
    command.configureHelp({
      sortSubcommands: true,
      subcommandTerm: 'action'
    });
  }
};
```

### External Plugins

```typescript
// ~/.dev/plugins/my-plugin.ts
import { commandRegistry } from 'dev';
import { createCommand } from 'dev/utils/command-utils';

const customCommand = createCommand({
  name: 'custom',
  description: 'My custom command',
  exec: (context) => {
    context.logger.success('Plugin command executed!');
  }
});

commandRegistry.register(customCommand);
```

This interface-based approach provides a more maintainable, testable, and extensible CLI architecture while maintaining all the functionality of the class-based approach.
