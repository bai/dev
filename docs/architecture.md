# System Architecture & Engineering Specification

## Table of Contents

1. Purpose & Overview
2. Technology Stack
3. Architectural Principles
4. Layer Structure & Directory Layout
5. Effect-TS Patterns & Functional Services
6. Error Handling Model
7. Ports & Adapters (Domain Interfaces)
8. Local Run Analytics
9. Configuration Handling
10. Command Catalogue
11. Shell Completions
12. Upgrade Sequence
13. Testing Strategy
14. Extending the System

---

## 1 · Purpose & Overview

`dev` is a **hexagonal**, **plugin-extensible** CLI that streamlines navigation, repo cloning, environment setup and diagnostics.  The design is deeply rooted in *functional programming* and *Effect-TS* best practices.  By treating *services as values* rather than classes, we keep the codebase declarative, composable and trivially testable.

### Key Benefits

* **Testability** – pure business logic isolated from side-effects
* **Maintainability** – strict separation of concerns & clear dependency flow
* **Flexibility** – adapters can be swapped without touching core logic
* **Type-Safety** – full TypeScript compilation with zero errors
* **Resource Safety** – Effect-TS manages lifecycles & interruptions automatically

---

## 2 · Technology Stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Runtime / Compiler | **Bun**                         |
| Language           | **TypeScript**                  |
| FP Runtime         | **Effect**                      |
| CLI Framework      | **@effect/cli**                 |
| Test Runner        | **Vitest**                      |
| Relational Store   | **SQLite** via **drizzle-orm**  |
| Git CLI            | `git`                           |

---

## 3 · Architectural Principles

### 3.1 Hexagonal / Ports & Adapters

The application follows the hexagonal architecture pattern, with clear separation between:

* **Domain layer** - pure business logic, domain models, and service interfaces (ports)
* **Infrastructure layer** - concrete implementations of domain services (adapters)
* **Application layer** - command handlers and service orchestration
* **CLI layer** - @effect/cli command definitions and argument parsing

### 3.2 Effect-TS CLI Architecture

Commands are defined using @effect/cli for idiomatic Effect-TS patterns:

```ts
import { Args, Command } from "@effect/cli";

const cloneCommand = Command.make(
  "clone",
  { repo: Args.text({ name: "repo" }) },
  ({ repo }) =>
    Effect.gen(function* () {
      // Command implementation using Effect generators
      const repoService = yield* RepositoryServiceTag;
      const repository = yield* repoService.resolveRepository(repo);
      // ... rest of implementation
    }),
);
```

This approach provides:

* **Composable commands** with declarative argument parsing
* **Type-safe arguments** with automatic validation
* **Resource management** with proper cleanup and interruption
* **Error handling** through Effect's error channel

### 3.3 Dependency Rule

*All* arrows point **inwards** – inner layers never import from outer ones.

```text
CLI  →  Application  →  Domain
Infra →  Domain
```

---

## 4 · Layer Structure & Directory Layout

```text
src/
├── bootstrap/     # ⚙️ Composition root and CLI routing
│   ├── wiring.ts
│   ├── cli-router.ts
│   ├── command-registry-port.ts
│   └── command-registry-live.ts
│
├── core/          # 🧱 Cross-cutting runtime, config, and observability
│   ├── errors.ts
│   ├── models.ts
│   ├── config/
│   │   ├── config-schema.ts
│   │   ├── config-loader-port.ts
│   │   ├── config-loader-live.ts
│   │   └── app-config-port.ts
│   ├── runtime/
│   │   ├── path-service.ts
│   │   ├── path-service-live.ts
│   │   ├── path-service-mock.ts
│   │   ├── runtime-context-port.ts
│   │   ├── runtime-context-live.ts
│   │   ├── version-port.ts
│   │   └── version-service.ts
│   └── observability/
│       ├── tracing-port.ts
│       ├── tracing-live.ts
│       ├── tracing-exporter-types.ts
│       ├── tracing-exporter-registry-live.ts
│       └── adapters/
│           └── axiom-tracing-exporter-live.ts
│
├── capabilities/  # 🔌 Reusable domain capabilities and adapters
│   ├── system/
│   ├── repositories/
│   │   └── adapters/
│   ├── workspace/
│   ├── services/
│   ├── tools/
│   │   └── adapters/
│   ├── persistence/
│   └── analytics/
│
├── features/      # 🔄 Vertical command slices
│   ├── cd/
│   ├── clone/
│   ├── run/
│   ├── services/
│   ├── status/
│   ├── sync/
│   ├── up/
│   └── upgrade/
│
└── index.ts       # 🚀 Entry point
```

### 4.1 Adapter Family Subdirectories

Single-adapter capabilities can stay flat inside their capability folder (for example `src/capabilities/persistence/database-live.ts` or `src/capabilities/system/shell-live.ts`). When a capability has **3+ implementations** or is designed for **plugin-like extensibility**, it gets an `adapters/` subdirectory (for example `src/capabilities/tools/adapters/` or `src/capabilities/repositories/adapters/`).

Each adapter-family subdirectory contains:

* Individual adapter files (`*-live.ts`)
* A shared types file (when needed, e.g. `tracing-exporter-types.ts`)
* A registry that composes the adapters (e.g. `tool-management-live.ts`, `tracing-exporter-registry-live.ts`)
* Co-located tests

### 4.2 Layer Isolation Rules

| Layer              | Can Import From                        | Must **NOT** Import From |
| ------------------ | -------------------------------------- | ------------------------ |
| **Core**           | Effect, external libs                  | Features                 |
| **Capabilities**   | Core, Effect, external libs            | Features                 |
| **Features**       | Core, Capabilities, Effect             | Bootstrap internals      |
| **Bootstrap/Root** | Every layer                            | —                        |

### 4.3 AI Agent Guardrails

Agents extending this CLI should follow these repo-specific rules:

* New commands go in `src/features/` and must be registered in `src/bootstrap/cli-router.ts`.
* New tool or repository integrations go in the `adapters/` subdirectory of the relevant capability.
* Never import `*-live.ts` files inside `features/` or `core/`. Only `src/bootstrap/wiring.ts` is allowed to wire live layers.
* Treat any existing exceptions as legacy. Do not repeat them in new code.

### 4.4 Layer Definitions

| Layer         | Services Included                                                      |
| ------------- | ---------------------------------------------------------------------- |
| **InfraLive** | FileSystem, RepoProvider, Mise, Shell, Keychain, Network, **RunStore** |
| **AppLive**   | Commands, Services **+ InfraLive**                                     |
| **CliLive**   | Console, Telemetry *(optional)* **+ AppLive**                          |

Tests compose only the layers they need (e.g. swap `FileSystemLive` for an in-memory fake).

---

## 5 · Effect-TS Patterns & Functional Services

Idiomatic Effect focuses on *values* – no classes, no `this`, no hidden state [[see todo-no-classes.md]].

### 5.1 Service Declaration

```ts
// src/capabilities/system/git-port.ts
export interface Git {
  clone: (repo: Repository, dest: string) => Effect.Effect<void, GitError>;
  currentCommitSha: (cwd?: string) => Effect.Effect<string, GitError>;
}

export class GitTag extends Effect.Tag("Git")<GitTag, Git>() {}
```

### 5.2 Functional Adapter (Factory)

```ts
// src/capabilities/system/git-live.ts
import { Effect, Layer } from "effect";
import { Git, GitTag } from "~/capabilities/system/git-port";
import { ShellTag } from "~/capabilities/system/shell-port";

const makeGitLive = (shell: Shell): Git => ({
  clone: (repo, dest) =>
    shell.exec("git", ["clone", repo.cloneUrl, dest]),

  currentCommitSha: (cwd) =>
    shell.exec("git", ["rev-parse", "HEAD"], { cwd }).pipe(
      Effect.map((r) => r.stdout.trim())
    ),
});

export const GitLiveLayer = Layer.effect(
  GitTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeGitLive(shell);
  })
);
```

No `class`, just a *factory* that returns a plain object implementing `Git`.

### 5.3 Composing Effects

```ts
// Example command (using @effect/cli)
export const cloneCommand = Command.make(
  "clone",
  { repo: Args.text({ name: "repo" }) },
  ({ repo }) =>
    Effect.gen(function* () {
      const git = yield* GitTag;
      const repository = parseRepository(repo);
      const dest = `${process.env.HOME}/src/${repository.fullName}`;
      yield* git.clone(repository, dest);
    }),
);
```

---

## 6 · Error Handling Model

```ts
export type DevError =
  | { _tag: "ConfigError";   reason: string }
  | { _tag: "GitError";      reason: string }
  | { _tag: "NetworkError";  reason: string }
  | { _tag: "AuthError";     reason: string }
  | { _tag: "ExternalToolError"; message: string; tool?: string; stderr?: string }
  | { _tag: "FileSystemError"; reason: string; path?: string }
  | { _tag: "StatusCheckError"; reason: string; failedComponents: string[] }
  | { _tag: "UnknownError";  reason: unknown };

export const exitCode = (e: DevError): number => ({
  ConfigError:      2,
  GitError:         3,
  NetworkError:     4,
  AuthError:        5,
  ExternalToolError: 6,
  FileSystemError:  7,
  StatusCheckError: 3,
  UnknownError:     1,
}[e._tag]);
```

*Never* use `throw`; propagate errors through the Effect error channel.

---

## 7 · Ports & Adapters (Domain Interfaces)

Each port is a pure TypeScript *interface* + an `Effect.Tag`.

```ts
// src/capabilities/system/file-system-port.ts
export interface FileSystem {
  exists: (path: string) => Effect.Effect<boolean, FileSystemError>;
  readFile: (path: string) => Effect.Effect<string, FileSystemError>;
  writeFile: (path: string, content: string) => Effect.Effect<void, FileSystemError>;
}

export class FileSystemTag extends Effect.Tag("FileSystem")<FileSystemTag, FileSystem>() {}
```

Adapters live in `src/core/` and `src/capabilities/` and are wired together from `src/bootstrap/wiring.ts` via **Effect Layers**.

---

## 8 · Local Run Analytics

Drizzle stores command runs in `~/.local/share/dev/dev.db` (following XDG Base Directory Specification).

```ts
import { sqliteTable, text, integer, sql } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id:          text().primaryKey(),
  cli_version: text().notNull(),
  command_name:text().notNull(),
  arguments:   text(),
  exit_code:   integer(),
  cwd:         text().notNull(),
  started_at:  integer({ mode: "timestamp" }).notNull(),
  finished_at: integer({ mode: "timestamp" }),
  duration_ms: integer().generatedAlwaysAs(() => sql`finished_at - started_at`),
});
```

A tiny adapter (`RunStoreLive`) inserts a row *before* command execution and finalises it on completion.

---

## 9 · Configuration Handling

`ConfigLoader` reads `~/.config/dev/config.json` (following XDG Base Directory Specification) and validates via a Zod schema (`configSchema`). The composition root performs this bootstrap step once, then re-exposes the loaded `Config` plus the derived host/workspace path services (`AppConfigTag`, `HostPathsTag`, `WorkspacePathsTag`) so config-aware adapters can depend on services instead of constructor arguments.

`ConfigLoaderTag` remains the port for reading, saving, and refreshing config from disk and remote sources after startup.

The `Config` type is inferred from the Zod schema, ensuring the type always matches what parsing actually produces (with defaults applied).

```ts
// src/core/config/config-schema.ts
export const configSchema = z.object({
  configUrl: z.url().default("https://..."),
  defaultOrg: z.string().default("acmesoftware"),
  defaultProvider: gitProviderSchema.optional().default("github"),
  baseSearchPath: z.string().optional().default("~/src"),
  logLevel: logLevelSchema.optional().default("info"),
  telemetry: telemetryConfigSchema, // discriminated union on "mode"
  orgToProvider: z.record(z.string(), gitProviderSchema).optional().default({}),
  miseGlobalConfig: miseConfigSchema.optional(),
  miseRepoConfig: miseConfigSchema.optional(),
  services: servicesConfigSchema,
});

export type Config = z.infer<typeof configSchema>;
```

Telemetry uses a Zod discriminated union on the `mode` field (`"disabled"`, `"console"`, or `"axiom"`), making invalid states unrepresentable at parse time:

```ts
const telemetryConfigSchema = z
  .discriminatedUnion("mode", [telemetryDisabledSchema, telemetryConsoleSchema, telemetryAxiomModeSchema])
  .default({ mode: "disabled" });
```

### 9.1 Example `config.json`

```jsonc
{
  "configUrl": "https://raw.githubusercontent.com/acme/dev-configs/main/org.json",
  "defaultOrg": "acme",
  "baseSearchPath": "~/src",
  "telemetry": { "mode": "disabled" }
}
```

*The loader validates this on startup; `dev upgrade` refreshes it from `configUrl` if the remote version differs.*

---

## 10 · Command Catalogue

| Command             | Synopsis                                 |
| ------------------- | ---------------------------------------- |
| **cd**              | `dev cd [name]`                          |
| **clone**           | `dev clone <repo>`                       |
| **up**              | `dev up`                                 |
| **run**             | `dev run <task>`                         |
| **services**        | `dev services <subcommand> [services...]` |
| **status**          | `dev status`                             |
| **sync**            | `dev sync`                               |
| **upgrade**         | `dev upgrade`                            |

---

## 11 · Upgrade Sequence

1. Self-update CLI repository if in git repo.
2. Ensure necessary directories exist.
3. Update shell integration.
4. Fetch remote `configUrl`, migrate & overwrite local.
5. Check and upgrade essential tools (bun, git, mise, fzf, gcloud).
6. Print success message and usage examples.

---

## 13 · Testing Strategy

### 13.1 Co-located Unit Tests

Place pure unit tests beside the code they test:

```text
src/features/clone/
  ├ clone-command.ts
  └ clone-command.test.ts
```

Use in-memory fakes to avoid I/O.

### 13.2 Integration Coverage

The repository keeps integration-style tests co-located under `src/` (e.g. command wiring tests, layer composition tests, adapter tests with temp files). End-to-end CLI smoke tests live in the top-level `tests/e2e/` directory.

---

## 14 · Extending the System

### Adding a New Command

1. **Define / reuse domain models & ports**.
2. **Implement functional adapter(s)** if new infrastructure is needed.
3. **Write the command** inside `src/features/<feature>/` using @effect/cli `Command.make` with Effect generators.
4. **Wire** the command by exporting `register<CommandName>Command` from `src/features/<feature>/*-command.ts` and adding it to `registerAllCommands` in `src/bootstrap/cli-router.ts`.
5. **Do not import live layers** into the feature. If the command needs a new adapter, add the port in `src/core/` or `src/capabilities/`, add the live implementation there, and wire it only from `src/bootstrap/wiring.ts`.

### Adding a New Infrastructure Adapter (Example: Redis Cache)

```ts
// 1. Extend error types
export interface CacheError extends DevError { _tag: "CacheError" }

// 2. Domain port
export interface Cache {
  get: (key: string) => Effect.Effect<string | null, CacheError>;
  set: (key: string, value: string, ttl?: number) => Effect.Effect<void, CacheError>;
}
export class CacheTag extends Effect.Tag("Cache")<CacheTag, Cache>() {}

// 3. Functional adapter factory
const makeRedisCache = (client: RedisClient): Cache => ({
  get: (k) => Effect.promise(() => client.get(k)),
  set: (k, v, ttl) => Effect.promise(() => client.set(k, v, "EX", ttl ?? 60)),
});

export const CacheLayer = Layer.effect(
  CacheTag,
  Effect.gen(function* () {
    const client = createRedisClient();
    return makeRedisCache(client);
  })
);
```

That's it — the system remains *pure*, *composable* and *idiomatically Effect-TS*.

### Adding a New Tool or Repository Integration

1. **Keep the port or registry at the capability root** (`src/capabilities/tools/` or `src/capabilities/repositories/`).
2. **Add the concrete integration** under the relevant `adapters/` subdirectory.
3. **Update the capability registry/live layer** in that capability.
4. **Wire the new live layer only from** `src/bootstrap/wiring.ts`.

### Adding a New Tracing Exporter

Tracing exporters follow a plugin-like pattern with compile-time completeness enforcement. The type derivation chain flows from the Zod schema:

```text
configSchema (Zod discriminated union on "mode")
  → Config (z.infer)
    → RemoteTelemetryConfig / RemoteTelemetryMode (Exclude local modes)
      → TracingExporterFactoryMap (mapped type: every remote mode must have a factory)
```

To add a new remote exporter (e.g. Honeycomb):

1. **Add the config variant** to the Zod discriminated union in `src/core/config/config-schema.ts`:

```ts
const telemetryHoneycombSchema = z.object({
  mode: z.literal("honeycomb"),
  honeycomb: z.object({
    endpoint: z.url(),
    apiKey: z.string().min(1),
    dataset: z.string().min(1),
  }),
});

// Add to the discriminated union members:
const telemetryConfigSchema = z
  .discriminatedUnion("mode", [
    telemetryDisabledSchema,
    telemetryConsoleSchema,
    telemetryAxiomModeSchema,
    telemetryHoneycombSchema,          // ← new
  ])
  .default({ mode: "disabled" });
```

At this point TypeScript will report an error on `src/core/observability/tracing-exporter-registry-live.ts` because `TracingExporterFactoryMap` requires every `RemoteTelemetryMode` to have a corresponding factory entry.

2. **Create the exporter adapter** at `src/core/observability/adapters/honeycomb-tracing-exporter-live.ts` implementing `TracingExporterFactory<"honeycomb">`.

3. **Register** the factory in `src/core/observability/tracing-exporter-registry-live.ts`:

```ts
export const tracingExporterFactories = {
  axiom: axiomTracingExporterFactory,
  honeycomb: honeycombTracingExporterFactory,  // ← new
} as const satisfies TracingExporterFactoryMap;
```

No changes to `tracing-live.ts` are needed — `createRemoteSpanProcessor` dispatches through the registry automatically.
