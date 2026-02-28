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
| Relational Store   | **SQLite** via **drizzle-orm** |
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

```
CLI  →  Application  →  Domain
Infra →  Domain
```

---

## 4 · Layer Structure & Directory Layout

```text
src/
├── domain/        # 🏛️ Pure business logic (flat structure)
│   ├── models.ts
│   ├── errors.ts
│   ├── matching.ts
│   ├── drizzle-types.ts
│   ├── config-schema.ts    # Configuration schema and types
│   ├── config-loader-port.ts # Configuration loader interface
│   ├── *-port.ts      # Domain interfaces (e.g., git-port.ts, database-port.ts)
│   └── *-service.ts   # Domain services (e.g., repository-service.ts, health-check-service.ts)
│
├── app/           # 🔄 Use-cases (flat structure)
│   ├── *-command.ts   # Command implementations (e.g., clone-command.ts, cd-command.ts)
│   └── *-service.ts   # Application services (e.g., command-tracking-service.ts, version-service.ts)
│
├── infra/         # 🔌 Adapters (flat structure with -live suffix)
│   ├── config-loader-live.ts  # Configuration loader implementation
│   ├── database-live.ts
│   ├── run-store-live.ts
│   ├── directory-live.ts
│   ├── file-system-live.ts
│   ├── git-live.ts
│   ├── health-check-live.ts
│   ├── tool-health-registry-live.ts
│   ├── keychain-live.ts
│   ├── mise-live.ts
│   ├── network-live.ts
│   ├── github-provider-live.ts
│   ├── fzf-selector-live.ts
│   ├── shell-live.ts
│   ├── *-tools-live.ts  # Tool implementations (e.g., bun-tools-live.ts, git-tools-live.ts)
│   └── tool-management-live.ts
│
├── wiring.ts      # ⚙️ Composition root - configuration loading and layer composition
└── index.ts       # 🚀 Entry point with main command definition
```

### 4.1 Layer Isolation Rules

| Layer         | Can Import From                 | Must **NOT** Import From |
| ------------- | ------------------------------- | ------------------------ |
| **Domain**    | Effect, other domain modules    | App, Infra, CLI         |
| **App**       | Domain, Effect                  | Infra, CLI               |
| **Infra**     | Domain, Effect, external libs   | App, CLI                 |
| **Root**      | Every layer                     | —                        |

### 4.2 Layer Definitions

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
// src/domain/git-port.ts
export interface Git {
  clone: (repo: Repository, dest: string) => Effect.Effect<void, GitError>;
  currentCommitSha: (cwd?: string) => Effect.Effect<string, GitError>;
}

export const GitTag = Context.Tag<Git>("Git");
```

### 5.2 Functional Adapter (Factory)

```ts
// src/infra/git-live.ts
import { Effect, Layer } from "effect";
import { Git, GitTag } from "../domain/git-port";
import { ShellTag } from "../domain/shell-port";

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

Each port is a pure TypeScript *interface* + a Context Tag.

```ts
// src/domain/file-system-port.ts
export interface FileSystem {
  exists: (path: string) => Effect.Effect<boolean, FileSystemError>;
  readFile: (path: string) => Effect.Effect<string, FileSystemError>;
  writeFile: (path: string, content: string) => Effect.Effect<void, FileSystemError>;
}

export const FileSystemTag = Context.Tag<FileSystem>("FileSystem");
```

Adapters live in `src/infra/` (flat structure) and are wired in the composition root via **Effect Layers**.

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

`ConfigLoader` reads `~/.config/dev/config.json` (following XDG Base Directory Specification), applies migrations and validation, then provides the resulting object via a Context Tag so that any Effect can simply `yield* ConfigTag`.

```ts
export interface Config {
  configUrl: string;
  defaultOrg: string;
  paths: { base: string };
  telemetry?: { enabled: boolean };
  plugins?: { git?: readonly string[] };
}

export const ConfigTag = Context.Tag<Config>("Config");
```

### 9.1 Example `config.json`

```jsonc
{
  "configUrl": "https://raw.githubusercontent.com/acme/dev-configs/main/org.json",
  "defaultOrg": "acme",
  "paths": { "base": "~/src" },
  "telemetry": { "enabled": true },
  "plugins": {
    "git": []
  }
}
```

*The loader migrates and validates this on startup; `dev upgrade` refreshes it from `configUrl` if the remote version differs.*

---

## 10 · Command Catalogue

| Command             | Synopsis                                 |
| ------------------- | ---------------------------------------- |
| **cd**              | `dev cd [name]`                          |
| **clone**           | `dev clone <repo>`                       |
| **up**              | `dev up`                                 |
| **status**          | `dev status [--json]`                    |
| **run**             | `dev run <task>`                         |
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
src/app/
  ├ clone-command.ts
  └ clone-command.test.ts
```

Use in-memory fakes to avoid I/O.

### 13.2 Integration & E2E Suites

```
tests/
├─ integration/
└─ e2e/
```

Integration tests wire multiple layers together with real SQLite; E2E drives the compiled CLI in a temp directory.

---

## 14 · Extending the System

### Adding a New Command

1. **Define / reuse domain models & ports**.
2. **Implement functional adapter(s)** if new infrastructure is needed.
3. **Write the command** using @effect/cli Command.make with Effect generators.
4. **Wire** everything in `index.ts` by adding to the subcommands array.

### Adding a New Infrastructure Adapter (Example: Redis Cache)

```ts
// 1. Extend error types
export interface CacheError extends DevError { _tag: "CacheError" }

// 2. Domain port
export interface Cache {
  get: (key: string) => Effect.Effect<string | null, CacheError>;
  set: (key: string, value: string, ttl?: number) => Effect.Effect<void, CacheError>;
}
export const CacheTag = Context.Tag<Cache>("Cache");

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
