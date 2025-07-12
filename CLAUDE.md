# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🌍 Always-Apply Rules (Global Context)

@.cursor/rules/010-base.mdc
@.cursor/rules/020-effect.mdc
@.cursor/rules/030-naming-conventions.mdc
@.cursor/rules/040-return-types.mdc
@.cursor/rules/050-interface-extends.mdc
@.cursor/rules/070-readonly-properties.mdc
@.cursor/rules/080-optional-properties.mdc
@.cursor/rules/090-discriminated-unions.mdc
@.cursor/rules/100-enums.mdc
@.cursor/rules/110-default-exports.mdc
@.cursor/rules/120-any-inside-generic-functions.mdc
@.cursor/rules/130-no-unchecked-indexed-access.mdc
@.cursor/rules/140-import-type.mdc
@.cursor/rules/150-jsdoc-comments.mdc
@.cursor/rules/490-installing-libraries.mdc
@.cursor/rules/500-testing.mdc
@.cursor/rules/600-effect-ts-naming-conventions.mdc

## Project Notes

### Development Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint
bun run lint:fix

# Code formatting
bun run prettier
bun run prettier:fix

# Testing
bun run test
bun run test:bench

# Database migrations
bun run db:generate

# Run locally
bun run src/index.ts --help
```

### Architecture Overview

This is a CLI tool built with Effect-TS that provides directory navigation, repository management, and development environment setup. The architecture follows hexagonal architecture principles with dependency injection via Effect layers.

#### Core Architecture Patterns

**Dynamic Configuration Loading**: The application loads configuration at startup and uses those values to build all layers dynamically via `buildAppLiveLayer()`. This eliminates hardcoded values and enables runtime configuration.

**Effect-TS Patterns**:

- Uses `Effect.gen` with generators for sequential operations
- Implements proper resource management with `Effect.addFinalizer`
- Uses `BunRuntime.runMain` for the application entry point
- Follows the Effect-TS style guide for imports and code structure

**Domain-Driven Design**:

- **Domain layer** (`src/domain/`): Core business logic, ports (interfaces), and models
- **Infrastructure layer** (`src/infra/`): Concrete implementations of domain ports
- **Application layer** (`src/app/`): Commands and application services
- **Configuration layer** (`src/config/`): Configuration schema, loading, and application wiring

#### Key Components

**Command Structure**: Built using `@effect/cli` with subcommands for:

- `dev cd` - Directory navigation with fuzzy search
- `dev clone` - Repository cloning with provider detection
- `dev up` - Development tool installation via mise
- `dev status` - Environment health checking
- `dev run` - Task execution

**Database Layer**: Uses Drizzle ORM with SQLite for:

- Command execution tracking (`runs` table)
- Health check results (`tool_health_checks` table)
- XDG Base Directory compliant storage

**Health Check System**: Implements synchronous health monitoring with:

- On-demand health checks when `dev status` is called
- Database storage for historical tracking
- Tool status tracking (git, fzf, mise, gcloud, bun)

**Configuration Management**:

- Dynamic configuration loading from remote URLs
- Simplified dependency injection via Effect layers
- Support for mise configuration (global and per-repo)

#### File Structure Patterns

- **Commands**: `src/app/` - Command files with `-command.ts` suffix
- **Services**: `src/app/` - Service files with `-service.ts` suffix
- **Ports**: `src/domain/` - Interface files with `-port.ts` suffix
- **Infrastructure**: `src/infra/` - Implementation files with technology prefix and `-live.ts` suffix
- **Configuration**: `src/config/` - Contains `app-layer.ts` (composition root), `loader.ts`, and `schema.ts`

#### Key Dependencies

- **Effect-TS**: Core functional programming framework
- **@effect/cli**: Command-line interface framework
- **@effect/platform-bun**: Bun runtime integration
- **Drizzle ORM**: Database access layer
- **Zod**: Schema validation
- **Vitest**: Testing framework

#### Development Workflow

1. All changes should maintain the hexagonal architecture boundaries
2. New features should follow the Effect-TS patterns established
3. Database changes require running `bun run db:generate` for migrations
4. Health checks should be implemented for any new tools or dependencies
5. Commands should be added to the main command in `src/index.ts`

### Testing Strategy

Tests use Vitest with the following conventions:

- Test files are co-located with source files (e.g., `foo.ts` has `foo.test.ts`)
- No test globals - explicitly import from vitest
- Prefer real files over mocking filesystem operations
- Each test file has a top-level `describe()` matching the source file name
