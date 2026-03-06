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
2. **Stage 2**: Build dynamic layers in `src/bootstrap/wiring.ts` using the loaded configuration services

**Effect-TS Patterns**:

- Uses `Effect.gen` with generators for sequential operations
- Implements proper resource management with `Effect.addFinalizer`
- Uses `BunRuntime.runMain` for the application entry point

**Repository Structure**:

- **Bootstrap** (`src/bootstrap/`): CLI routing and composition root
- **Core** (`src/core/`): Cross-cutting config, runtime, models, errors, and observability
- **Capabilities** (`src/capabilities/`): Reusable subsystems and their ports/adapters
- **Features** (`src/features/`): Vertical command slices
- **Composition root** (`src/bootstrap/wiring.ts`): The only place that wires live layers together

### Key Components

- **Command Structure**: Built using `@effect/cli`. Commands live in `src/features/` and are registered in `src/bootstrap/cli-router.ts`.
- **Health Check System**: Implements synchronous health monitoring (on-demand via `dev status`), stores results in DB, tracks tools (git, fzf, mise, gcloud, bun).
- **Configuration Management**: Dynamic configuration loading from remote URLs, support for mise configuration (global and per-repo).

### File Structure Patterns

- **Commands**: `src/features/<feature>/*-command.ts`
- **Feature Services**: `src/features/<feature>/*-service.ts`
- **Ports**: `src/core/**/*-port.ts` and `src/capabilities/**/*-port.ts`
- **Adapters**: `src/core/**/*-live.ts` and `src/capabilities/**/*-live.ts`
- **Adapter Families**: `src/core/**/adapters/` and `src/capabilities/**/adapters/`
- **CLI Routing**: `src/bootstrap/cli-router.ts`
- **Wiring**: `src/bootstrap/wiring.ts`

### Agent Guardrails

- New commands go in `src/features/` and must be registered in `src/bootstrap/cli-router.ts`.
- New tool or repository integrations go in the `adapters/` subdirectory of the relevant capability.
- Never import `*-live.ts` files inside `features/` or `core/`. Only `src/bootstrap/wiring.ts` is allowed to wire live layers.
- Treat any existing exceptions as legacy and do not copy the pattern into new code.

### Development Workflow

1. All changes should maintain the hexagonal architecture boundaries
2. New features should follow the Effect-TS patterns established
3. Database changes require running `bun run db:generate` for migrations
4. Health checks should be implemented for any new tools or dependencies
5. New commands should be added under `src/features/` and registered in `src/bootstrap/cli-router.ts`

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
