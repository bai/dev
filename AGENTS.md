# AGENTS.md

CLI tool built with Effect-TS that provides directory navigation, repository management, and development environment setup.

## Essential Directives

- **ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.**
- **Prefer automation**: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.
- **Package Manager**: Bun
- **Commands**:
  - `bun run typecheck`
  - `bun run lint` / `bun run lint:fix`
  - `bun run format` / `bun run format:fix`
  - `bun run test` / `bun run test:bench`
  - `bun run db:generate` (for migrations)
  - `bun run src/index.ts --help`

## Architecture & Structure

This CLI tool follows hexagonal architecture principles with dependency injection via Effect layers.

### Core Architecture Patterns

**Two-Stage Dynamic Wiring**:

1. **Stage 1**: Load configuration via `loadConfiguration()` (self-contained with bootstrap dependencies)
2. **Stage 2**: Build dynamic layers using runtime configuration values via `buildAppLayer()`

**Effect-TS Patterns**:

- Uses `Effect.gen` with generators for sequential operations
- Implements proper resource management with `Effect.addFinalizer`
- Uses `BunRuntime.runMain` for the application entry point

**Domain-Driven Design**:

- **Domain layer** (`src/domain/`): Core business logic, ports (interfaces), and models
- **Infrastructure layer** (`src/infra/`): Concrete implementations of domain ports
- **Application layer** (`src/app/`): Commands and application services
- **Composition root** (`src/wiring.ts`): Dynamic configuration loading and layer building

### Key Components

- **Command Structure**: Built using `@effect/cli`. Added to the main command in `src/index.ts`.
- **Health Check System**: Implements synchronous health monitoring (on-demand via `dev status`), stores results in DB, tracks tools (git, fzf, mise, gcloud, bun).
- **Configuration Management**: Dynamic configuration loading from remote URLs, support for mise configuration (global and per-repo).

### File Structure Patterns

- **Commands**: `src/app/*-command.ts`
- **Services**: `src/app/*-service.ts`
- **Ports**: `src/domain/*-port.ts`
- **Infrastructure**: `src/infra/*-live.ts`
- **Wiring**: `src/wiring.ts`

### Development Workflow

1. All changes should maintain the hexagonal architecture boundaries
2. New features should follow the Effect-TS patterns established
3. Database changes require running `bun run db:generate` for migrations
4. Health checks should be implemented for any new tools or dependencies
5. Commands should be added to the main command in `src/index.ts`

## Style Guide

### General Principles

- Avoid `try`/`catch` where possible (use Effect-TS error handling).
- Avoid using the `any` type.
- Use Bun APIs when possible, like `Bun.file()`.
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity.
- Prefer functional array methods (`flatMap`, `filter`, `map`) over `for` loops; use type guards on filter to maintain type inference downstream.

### Naming

Use descriptive, intent-revealing names for variables and functions. Prefer clarity over brevity.

```ts
// Good
function prepareJournal(dir: string) {}

// Bad
function journal(dir: string) {}
```

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json();

// Bad
const journalPath = path.join(dir, "journal.json");
const journal = await Bun.file(journalPath).json();
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a;
obj.b;

// Bad
const { a, b } = obj;
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2;

// Bad
let foo;
if (condition) foo = 1;
else foo = 2;
```

### Control Flow

Prefer early returns to reduce nesting, but use `else` when it clarifies the logic, especially in complex `Effect.gen` generators where branching is necessary.

```ts
// Good
function foo() {
  if (condition) return 1;
  return 2;
}

// Acceptable (when branching clarifies intent)
function process() {
  if (condition) {
    // block
  } else {
    // block
  }
}
```

## Database Conventions

### Database Layer

Uses Drizzle ORM with SQLite for:

- Command execution tracking (`runs` table)
- Health check results (`tool_health_checks` table)
- XDG Base Directory compliant storage

### Schema Definitions

Use `snake_case` for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
});

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
});
```

## Testing Strategy

Tests use Vitest with the following conventions:

- Test files are co-located with source files (e.g., `foo.ts` has `foo.test.ts`)
- No test globals - explicitly import from `vitest`
- Prefer real files over mocking filesystem operations
- Each test file has a top-level `describe()` matching the source file name
- **Hexagonal Architecture Testing**:
  - For pure **Domain** logic, use focused unit tests with fakes/test doubles for infrastructure ports (e.g., passing an in-memory SQLite implementation or a mock service).
  - Use integration/E2E tests when testing the **Infrastructure** or wiring.
