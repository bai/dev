# Dev CLI – Comprehensive Architecture and Implementation Specification

## 1 · Purpose

The **Dev CLI** (invoked as `dev`) is a command-line tool that streamlines developer workflows such as quick directory navigation, smart repository cloning, development environment setup, authentication, and diagnostics. The goal is to provide a cohesive interface for these tasks while adhering to clean architecture principles (hexagonal architecture) and being easily extensible via plugins. Key design goals include:

* **Hexagonal Architecture & Testability:** Core logic is decoupled from infrastructure, enabling easy unit testing by swapping out adapters (e.g. file system or network) with in-memory fakes.
* **Effect-TS Integration:** Use the **Effect** functional runtime for robust effect management, dependency injection (via layers), structured error handling, and concurrency control.
* **Plugin Extensibility:** Allow adding new commands or behaviors through a plugin system (both local and remote plugins), without modifying the core code.
* **Telemetry & Analytics:** Track command usage and performance both locally (in a SQLite database) and optionally remotely (via OpenTelemetry spans), without compromising offline functionality.
* **Developer Experience:** Provide features like shell completions, interactive selections, and helpful error messages. Support structured logging for CI (machine-readable logs) and friendly logging for local interactive use.

Overall, `dev` CLI aims to be a **comprehensive developer tool manager**, improving productivity while being robust and maintainable.

## 2 · Technology Stack

The implementation will use modern, reliable technologies as summarized below:

| Concern                 | Technology                          | Version (Locked) |
| ----------------------- | ----------------------------------- | ---------------- |
| **Runtime / JS Engine** | **Bun** – fast JS runtime & toolkit | 1.2.17           |
| **Language**            | **TypeScript** (strict typing)      | 5.8.3            |
| **FP Effect System**    | **Effect-TS** (Effect)              | 3.16.11          |
| **Testing**             | **Vitest** (unit/integration tests) | 3.2.4            |
| **Database**            | **SQLite 3** via **Drizzle ORM**    | latest (2025)    |
| **Git Integration**     | System `git` CLI (>= 2.40)          | – (external)     |

Additional notes:

* **Bun** provides a fast runtime and bundler; we will use it for running and packaging the CLI.
* **Effect** (effect-ts) is used for managing effects, layers (for dependency injection), and providing a structured error channel (akin to how ZIO or similar FP libraries handle errors in a typed way).
* **Drizzle ORM** will be used for type-safe interaction with SQLite for local analytics.
* The system will also rely on external tools like `git`, and potentially `fzf` (for fuzzy finding) and **Mise** (for environment setup tasks), which are accessed via ports/adapters.

## 3 · Architectural Overview

The architecture follows a hexagonal (ports & adapters) style layered on top of the Effect runtime's dependency injection. The high-level flow and layering of the application are illustrated below:

```
bin/dev   →  CLI Front-End (Yargs Parser)   →   **CliLive** Layer (Console I/O, Telemetry)
                              │
                              ▼
                     App Commands (Pure Business Logic)   →   **AppLive** Layer (Config, Logger, Clock, etc.)
                              │
                              ▼
                      Domain Ports (Abstract Interfaces)
                              │
                              ▼
              Infra Adapters (FS, Git, Mise, Shell, DB, etc.)   →   **InfraLive** Layer (implementations)
```

Key architectural notes:

* **CLI Front-end:** The entry point (`bin/dev`) uses **Yargs** to parse command-line arguments and options. It then delegates to the appropriate command handler in the App layer. The CLI layer is kept minimal (parsing and help text only) and is not extensible via plugins (commands from plugins are loaded in App layer instead).
* **App Commands:** Each command (e.g. `cd`, `clone`, `up`, etc.) is implemented as a pure function (or Effect) that uses abstract **domain ports** for side-effects (like file system access, network calls, etc.). These command handlers produce an `Effect<never, DevError, void>` – meaning they either complete successfully or fail with a typed `DevError` (no unchecked exceptions).
* **Domain Ports:** These are TypeScript interfaces (or Effect service definitions) that define operations for various infrastructure needs (FileSystem, Git, Shell, Network, etc.). The domain logic (App commands) depends only on these interfaces, not on concrete implementations.
* **Infrastructure Adapters:** Concrete implementations of the ports (e.g., a FileSystem adapter that uses Node/Bun filesystem, a Git adapter that calls out to the `git` CLI, a Shell adapter to run shell commands, etc.). These are grouped in the **InfraLive** layer. By using Effect layers, we can easily swap these out (for example, use an in-memory file system in tests).
* **Dependency Injection via Layers:** We will compose the application using Effect's Layer system:

  * **InfraLive** provides all low-level services.
  * **AppLive** depends on InfraLive and adds higher-level services like Config, Logger, Clock, etc.
  * **CliLive** depends on AppLive and adds CLI-specific services like Console I/O (for printing to stdout/stderr, prompting user) and Telemetry (if enabled).
* **Resource Management:** Effect layers handle resource scoping and cleanup. For example, the database connection or any file handles can be managed as resources that live for the duration of the CLI invocation.
* **Cancellation:** Because commands run as Effects, they can be cancelable (for instance, if a user sends an interrupt signal, the Effect runtime can handle graceful cancellation if we wire it).

This architecture ensures that core logic can be tested without actual file or network access by substituting dummy implementations of the ports, and it promotes separation of concerns across the CLI, application logic, and infrastructure.

## 4 · Repository Layout

The repository will be organized to reflect the layered architecture and separation of concerns. Below is the proposed file/directory structure:

```
dev/                      # Root of the project
├─ bunfig.toml            # Bun configuration (e.g., for bundling)
├─ package.json           # Project metadata and scripts
├─ tsconfig.json          # TypeScript configuration
├─ bin/
│  └─ dev                 # Executable (shebang) that invokes dist/cli.js via Bun
├─ src/
│  ├─ index.ts            # Application entry-point (bootstraps CLI runtime)
│  ├─ cli/                # CLI Layer (argument parsing, CLI-specific logic)
│  │  ├─ parser/
│  │  │  ├─ yargs.ts      # Yargs command and option definitions
│  │  │  └─ types.ts      # Internal types for parsing (e.g., typed argv)
│  │  ├─ completions/     # Scripts or helpers for shell completions
│  │  └─ wiring.ts        # Constructs the CliLive layer (combines AppLive + console/telemetry)
│  ├─ app/                # Application Layer (command implementations)
│  │  ├─ commands/        # Individual command handlers (cd, clone, up, doctor, etc.)
│  │  └─ wiring.ts        # Constructs the AppLive layer (combines domain services, config, logger)
│  ├─ domain/             # Domain definitions (ports, models, errors)
│  │  ├─ ports/           # Abstract port interfaces (FileSystem, Git, Mise, RunStore, etc.)
│  │  │  ├─ FileSystem.ts
│  │  │  ├─ Git.ts
│  │  │  ├─ Mise.ts
│  │  │  ├─ Shell.ts
│  │  │  ├─ Keychain.ts
│  │  │  ├─ Network.ts
│  │  │  └─ RunStore.ts    # Interface for local run analytics storage
│  │  ├─ models.ts        # Domain models (e.g., types for configuration schema, plugin spec, etc.)
│  │  └─ errors.ts        # Definition of DevError union and exit codes
│  ├─ infra/              # Infrastructure adapters (implementations of ports)
│  │  ├─ fs/              # File system adapter (reading/writing files, scanning directories)
│  │  ├─ git/             # Git adapter (invoking git CLI commands)
│  │  ├─ mise/            # Mise adapter (invoking mise for tool setup and tasks)
│  │  ├─ providers/       # RepoProvider implementations (resolving repo URLs, default org, etc.)
│  │  ├─ shell/           # Shell adapter (spawning subprocesses, etc.)
│  │  ├─ keychain/        # Keychain adapter for storing credentials (if applicable)
│  │  ├─ network/         # Network adapter for HTTP requests (if needed, e.g., fetching remote config)
│  │  └─ db/              # Database adapter for RunStore
│  │      ├─ schema.ts       # Drizzle ORM schema definition for SQLite
│  │      ├─ RunStoreLive.ts # Implementation of RunStore port using SQLite (via Drizzle)
│  │      └─ migrations/     # (If needed) DB migration scripts or schema evolution files
│  ├─ config/             # Configuration management
│  │  ├─ schema.ts        # Config file TypeScript schema (for validation/type-safety)
│  │  ├─ loader.ts        # Logic to load, migrate, and validate config file
│  │  └─ migrations/      # Migration scripts for config (e.g., 1_to_2.ts, 2_to_3.ts)
│  ├─ effect/             # Additional Effect service implementations (e.g., LoggerLive, TelemetryLive)
│  └─ plugins/            # Plugin modules discovered at runtime (e.g., loaded from ~/.dev/plugins or node_modules)
├─ completions/           # Generated shell completion scripts for zsh/bash/fish
├─ scripts/               # Utility scripts for development
│  ├─ generate-completions.ts  # Script to generate shell completion files
│  └─ release.mjs             # Script to facilitate releases (maybe bundling, version bumping, etc.)
├─ tests/
│  ├─ unit/               # Unit tests for individual functions/ports
│  ├─ integration/        # Integration tests (multiple components interacting)
│  └─ e2e/                # End-to-end tests (if applicable, possibly using the CLI as a black box)
└─ .github/workflows/ci.yml  # CI pipeline definition (running tests, lint, etc.)
```

This layout ensures a clear separation of concerns:

* The `cli` directory handles only command-line parsing and user interaction concerns.
* The `app` directory holds the core logic of commands, independent of how input was provided.
* The `domain` defines abstract interfaces and domain-specific types, with no references to external libraries (making it easy to stub in tests).
* The `infra` directory contains all the code that talks to the outside world (filesystem, network, etc.).
* The `config` directory handles reading and writing the configuration file, including migrating older versions to the current schema.
* The `effect` directory might hold implementations of cross-cutting concerns like logging or telemetry as Effect services (which don't fit neatly into domain or infra).
* The `plugins` directory is where dynamically loaded plugins' code will be placed (for example, if a plugin is a npm package or a Git-cloned module, it might be loaded into here or referenced here at runtime).

## 5 · Layers and Dependency Injection

We will use Effect-TS **Layers** to wire up the application. Each layer provides certain services (port implementations or higher-level services) and can depend on lower layers. The primary layers and their contents are:

| Layer         | Services Provided (and Dependencies)                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **InfraLive** | **FileSystem**, **RepoProvider**, **Mise**, **Shell**, **Keychain**, **Network**, **RunStore** (and possibly others like **Git** if separate from RepoProvider). This layer includes all low-level adapters (e.g. actual filesystem access, calling `git` CLI, connecting to SQLite). It typically has no dependencies (base layer that directly uses Bun/Node APIs or system tools).    |
| **AppLive**   | **Config**, **Logger**, **Clock**, *and it includes InfraLive*. This layer provides higher-level services needed by the app logic, including loading the configuration file and providing a logger and time utilities. It composes on top of InfraLive to use those adapters. The App layer also could include any additional business logic services or helpers needed across commands. |
| **CliLive**   | **Console I/O**, **Telemetry** (optional), *and it includes AppLive*. This top layer handles user-facing I/O (e.g., printing to console, reading user input) and telemetry (if enabled). It depends on AppLive. The CLI layer is where we integrate with the actual terminal/console and any telemetry exporters.                                                                        |

All command implementations will ultimately rely on these layers being provided. In tests, we can construct a test layer that perhaps replaces some services (for example, a fake FileSystem that operates in-memory, or a fake Git that simulates repository cloning without hitting the network). The layering with Effect ensures that in production we use `CliLive`, while in tests we might use only `AppLive` with some test versions of Infra services.

**Important:** The CLI front-end (Yargs) is not itself part of the Effect system; it will parse arguments and then *invoke* the appropriate Effectful command. We will create a `CliLive` layer instance at startup (in `src/index.ts`) that includes everything needed, then for each command execution we run the corresponding Effect within that environment. This yields a very modular system:

* The Yargs parser figures out what command and options are requested.
* We translate that into calling, say, `CdCommand.run(options)` which returns an `Effect` representing that command's execution.
* We provide the `CliLive` layer to that Effect and run it. The Effect runtime will ensure all required services (FileSystem, Config, etc.) are available and handle errors appropriately.
* After execution, we shut down the Effect runtime, which will release resources (close DB connections, flush logs, etc., as defined by the layers).

## 6 · Domain Error Model

Error handling is critical for a good CLI experience. We define a unified **`DevError`** type for all expected error cases in domain logic. Each variant of `DevError` corresponds to a category of failure, and we assign a distinct exit code to each category for clarity when the process exits. The structure in TypeScript might look like:

```ts
// src/domain/errors.ts

export type DevError =
  | { _tag: "ConfigError";   reason: string }    // e.g., invalid config file, migration failed
  | { _tag: "GitError";      reason: string }    // e.g., git command failed
  | { _tag: "NetworkError";  reason: string }    // e.g., network request failed (for upgrade, config fetch, etc.)
  | { _tag: "AuthError";     reason: string }    // e.g., authentication issues
  | { _tag: "ShellError";    reason: string }    // e.g., a shell command or subprocess failed (aside from Git)
  | { _tag: "FsError";       reason: string }    // e.g., file not found, permission denied
  | { _tag: "UnknownError";  reason: unknown };  // catch-all for uncategorized errors

// A helper to map error type to a process exit code
export const exitCode = (e: DevError): number => {
  switch (e._tag) {
    case "ConfigError":   return 2;
    case "GitError":      return 3;
    case "NetworkError":  return 4;
    case "AuthError":     return 5;
    case "ShellError":    return 6;
    case "FsError":       return 7;
    case "UnknownError":  return 1;
  }
};
```

**Idiomatic Effect-TS Error Handling:** In Effect, errors are handled in the typed error channel of the Effect (similar to `Either` in functional programming). All our command Effects will return a `DevError` on failure. We will **avoid throwing exceptions**; instead, use `Effect.fail(DevError)` to fail an Effect with a structured error. If a lower-level library or call (e.g., file system, or a JSON parse) throws an exception, we catch it in the adapter and convert it to an appropriate `DevError` (or `UnknownError` if we truly don't have a category).

At the top-level (CLI entry), the error (if any) will be caught by the Effect runtime. We will map the `DevError` to an exit code via `exitCode()` and terminate the process with that code. This ensures a consistent mapping from error types to shell exit codes:

* `ConfigError` (exit 2) might indicate misconfiguration.
* `GitError` (exit 3) might indicate a failure in a Git operation.
* `NetworkError` (exit 4) indicates network issues (like cannot reach a server).
* `AuthError` (exit 5) indicates authentication/credentials problems.
* `ShellError` (exit 6) indicates a failure running a general shell command or tool.
* `FsError` (exit 7) indicates filesystem issues.
* `UnknownError` (exit 1) is a fallback for uncategorized errors (also used for programming errors/unexpected exceptions).

By using this model, we make it easy for scripts or CI pipelines to understand the failure reason from the exit code, and developers can catch specific error types in code if reusing the CLI logic programmatically.

## 7 · Local Run Analytics (Command Tracking)

To gain insight into usage patterns and assist with debugging, the CLI will keep a **local log of command executions** in a SQLite database. This is entirely local (does not require internet) and is stored in the user's home directory, separate from any telemetry that might be sent remotely. Key aspects of this feature:

* **Database and Schema:** We'll use SQLite (via Drizzle ORM) to store each command run. The database file will be located at `~/.dev/state/dev.db` (within the user's home directory, under a `.dev` directory). We will enable WAL (write-ahead logging) mode for safety and performance since writes are frequent but typically low volume.

* **Schema Definition:** Using Drizzle's typesafe schema definition, we define a `runs` table to record each invocation of the CLI. For example:

  ```ts
  // src/infra/db/schema.ts
  import { sqliteTable, text, integer, sql } from "drizzle-orm/sqlite-core";

  export const runs = sqliteTable("runs", {
    id:          text().primaryKey(),              // unique ID for the run (could be a UUID)
    cli_version: text().notNull(),                 // version of the CLI tool
    command_name: text().notNull(),                // e.g., "clone", "cd"
    arguments:   text(),                           // full arguments string or JSON of parsed args
    exit_code:   integer(),                        // process exit code for that run
    cwd:         text().notNull(),                 // current working directory from which dev was invoked
    started_at:  integer({ mode: "timestamp" }).notNull(),   // start time (unix epoch ms or ISO string)
    finished_at: integer({ mode: "timestamp" }),   // finish time
    duration_ms: integer().generatedAlwaysAs(() => sql`finished_at - started_at`), // auto-calculated duration
  });
  ```

  This captures the essential data for each run: what command was run, with what args, when it started and finished, how long it took, and what the outcome was.

* **Port & Adapter:** In the domain, we define a port `RunStore` with methods like:

  * `recordStart(runId, commandName, args, cwd, startedAt)` – to be called when a command is about to execute.
  * `recordFinish(runId, exitCode, finishedAt)` – to be called at the end of execution (success or failure).
  * `prune(maxRecordsOrAge)` – to periodically prune old entries to keep the database from growing indefinitely (for example, keep only the last N entries or last M days).

  The **RunStoreLive** adapter will implement these by performing inserts and updates on the SQLite database. The `id` could be a generated UUID for each run (to correlate start and finish records). Alternatively, since we are within one process run for each command execution (the CLI process handles one command at a time), we might insert a row at start and then update it upon completion.

* **Integration:** On every invocation of a command:

  * Just after parsing arguments (and before executing the command's main logic), we generate a `runId` and insert a new row in the `runs` table with `started_at`, `command_name`, etc., leaving `finished_at` and `exit_code` null for now.
  * After the command logic completes (either successfully or with an error), we update that row with the `finished_at` timestamp and the `exit_code` (0 for success or the error-based code).
  * We might perform a `prune` occasionally (for example, on startup or on exit) to delete old records. The strategy can be configurable (perhaps keep only last 1000 entries or entries < 30 days old).

* **Disable Analytics Option:** If the environment variable `DEV_CLI_STORE=0` is set, the RunStore should be replaced with a no-op implementation (i.e., nothing is recorded). This gives users an option to opt-out of local tracking if they desire.

This local run analytics database can be useful for troubleshooting (e.g., support teams could ask for this log to diagnose what commands the user ran and in what order) or for the user themselves to inspect their usage (though no direct command for that is proposed yet, it could be a future `dev history` command). It is kept entirely on the user's machine — **no automatic upload of this data will occur**.

### 7.1 · Implementation Notes for Drizzle

We will use **Drizzle ORM** to interact with SQLite. Drizzle will provide type-safe queries and schema migrations support if needed. The schema will be defined in code (as shown above) and we can leverage Drizzle's migration generation or run migrations manually if the schema evolves.

Because Bun has built-in SQLite support (via SQL.js or through its JavaScriptCore embedding), connecting to SQLite should be straightforward. We should ensure:

* The database file path is determined correctly (respect XDG\_DATA\_HOME or fallback to `~/.dev/state/` directory).
* On startup, if the `runs` table or database file doesn't exist, create it.
* Use a library or Bun's API to open the SQLite database in WAL mode for better concurrency handling (though concurrency is limited as typically one CLI process runs at a time, but WAL helps with reliability).
* We properly close the database connection when the process exits (this can be handled by an Effect layer finalizer in `RunStoreLive`).

### 7.2 · Telemetry vs. Local Store

It is worth noting that this local run store is **independent of any remote telemetry**. Even if telemetry is disabled, the local run log can still be recorded (unless the user opts-out via env var). This separation ensures that:

* The CLI provides value in offline or on-prem environments (local logging still works without internet).
* Users have a local audit trail of usage which is not automatically shared.
* The design allows remote telemetry to be an *additional* layer, not the only source of truth.

(Details about remote telemetry are discussed in section **13.2** on Telemetry.)

## 8 · Config File and Schema (v3)

The CLI uses a JSON configuration file to customize its behavior for an organization or user. This config file can be provided by the user or their company (often fetched from a URL during setup) and can be updated over time. The config file is versioned, allowing the CLI to migrate older configs to newer schema versions as the application evolves.

### 8.1 Config Schema

In version 3 of the config (current version), an example structure might look like this (in JSON with comments for explanation):

```jsonc
{
  "version": 3,
  "configUrl": "https://raw.githubusercontent.com/acme/dev-configs/main/org.json",
  "defaultOrg": "acme",
  "paths": {
    "base": "~/src"                  // Base directory for storing all cloned repositories
  },
  "telemetry": {
    "enabled": true                  // Whether to enable remote telemetry (OpenTelemetry spans)
  },
  "plugins": {
    "git": [
      "https://github.com/acme/dev-plugin-docker.git",
      "ssh://git@example.com/custom/dev-plugin-foo.git"
    ]
  }
}
```

Key fields:

* **version:** The schema version of the config file format. Used to determine if migrations are needed.
* **configUrl:** The URL where the canonical config can be fetched. This allows `dev upgrade` to retrieve updated configurations (for example, if the organization updates default settings or adds new plugins).
* **defaultOrg:** The default organization name to assume for certain commands (like `dev clone`) if not explicitly specified by the user. In this example, if the user runs `dev clone some-repo`, it will assume `acme/some-repo` on the default provider (e.g., GitHub).
* **paths.base:** The base directory under which all projects will be organized. Typically something like `~/src`. Under this base, the CLI may organize projects by provider and org (e.g., `~/src/github.com/acme/repo-name`). This path can include `~` which should be expanded to the user’s home directory.
* **telemetry.enabled:** Controls whether remote telemetry is on. If true, the CLI will initialize the telemetry service (sending traces to the telemetry backend). If false, no telemetry will be sent (though local logging still occurs).
* **plugins.git:** A list of Git repository URLs pointing to plugin modules. These will be automatically cloned or updated in the local plugin cache and loaded to extend the CLI (see section 9 on Plugins for details).

There may be additional fields (for example, maybe `providers` for custom provider domains, or tool-specific settings), but the above covers the primary ones.

### 8.2 Config Loading and Migration

The config file is expected to reside in the user's home directory (likely under `~/.dev/config.json` or similar). The process for loading the config is:

1. **Read:** On CLI startup, read the JSON config file from disk.
2. **Parse:** Parse it into an intermediate representation (e.g., as an unknown and then decode to the TypeScript `schema.ts` types).
3. **Migrate:** If the file's `version` is less than the current version (3), sequentially apply migration scripts:

   * For example, if a config of version 1 is detected, apply `1_to_2` migration (which is a function that takes the v1 object and returns a v2 object), then apply `2_to_3` migration on that result.
   * These migration scripts reside in `src/config/migrations/` and handle structural or value changes (for instance, maybe between v2 and v3 the field `defaultOrg` was introduced, or a field was renamed).
   * Each migration script should also bump the `version` number in the config object to the target.
4. **Validate:** Once we have a config object at the latest version, validate it against the schema (ensure required fields are present, types are correct, and possibly run additional logic checks, e.g., that `paths.base` is an absolute or `~`-based path, etc.). If validation fails, that is a `ConfigError`.
5. **Save (if migrated):** If any migration was applied or if the remote config was fetched/updated, save the new config back to disk (overwriting the old one), so that subsequent runs do not need to re-migrate. (We should be careful to handle errors in saving gracefully; ideally do a write to a temp file and then rename, to avoid corrupting the file.)
6. Provide the config as a service (`Config` in AppLive) that commands can use to read configuration values.

The initial config might be obtained by the installation script (as seen in the original README, where the setup script downloads a config). The CLI itself in `dev upgrade` will use `configUrl` to refresh the config:

* If `configUrl` is set, `dev upgrade` will fetch that URL (via Network port), get the JSON, and compare it to the current config. If differences are found or the version is newer, it will replace the local config (after migrating and validating).
* If `configUrl` is not set, `dev upgrade` might skip config update or just migrate local if needed.

We will support comments in the JSON (as shown with `.jsonc` above) for ease of writing, but the actual format on disk could be JSON5 or we simply strip comments out during reading.

### 8.3 Config Extensibility

The config is meant to allow organizational customization:

* The `plugins` section can be expanded in future to include other plugin sources (e.g., NPM packages or local paths).
* We could add fields for default providers (e.g., default provider could be "github.com", and maybe a mapping of short aliases to provider base URLs).
* Telemetry configuration could include more details (like an endpoint or sample rate) if needed later.
* If new commands need settings (for example, if we add a `dev something` that needs config), we can bump the version and include migration for those fields.

By isolating config loading logic, we ensure the rest of the app can just request the Config service and get a typed object with current settings.

## 9 · Plugins Architecture

One of the advanced features of the Dev CLI is the ability to extend it with **plugins**. Plugins allow third-party or organization-specific commands and services to be added without modifying the core CLI code. This makes the CLI adaptable to different workflows and future needs.

### 9.1 Plugin Module Contract

Plugins are essentially modules (compiled to JS) that export an **AppModule** object. We define an interface for what a plugin can provide:

```ts
// src/domain/models.ts (or a separate plugins contract file)
export interface AppModule {
  commands: CliCommandSpec[];                  // New CLI commands that this plugin provides
  layers?: Layer.Layer<any, never, any>;       // Additional Effect layer(s) to provide extra services
  hooks?: {
    onStart?: Effect.Effect<any, never, void>; // Optional hook to run when CLI starts
    // (Future) onExit, or other lifecycle hooks can be added as needed
  };
}
```

* **commands:** An array of command specifications. Each `CliCommandSpec` would define at least the name of the command, a description, options, and a reference to the handler function (Effect) that implements it. Essentially, this could be a structure similar to what we'd pass to Yargs to register a command, or a custom format that our CLI uses to wire commands. The plugin's commands will be merged into the main CLI's command registry at runtime.
* **layers:** A Layer or composition of Layers that the plugin provides. This is how a plugin can introduce new services or override existing ones. For example, a plugin might provide a new `RepoProviderLive` for a different git host, or a new service entirely. The core CLI will incorporate this layer when assembling the final runtime environment.
* **hooks:** Optional lifecycle hooks. Currently we envision an `onStart` hook that executes an Effect when the CLI starts (after core initialization). This could be used for things like printing a custom message, performing a check, or registering some telemetry. In the future, `onExit` or other hooks could be added.

A plugin module must export `default` which conforms to `AppModule`. If a plugin fails to load or does not conform, the CLI can log a warning but continue operating (the plugin will be skipped).

### 9.2 Plugin Discovery and Loading

The CLI will discover plugins from multiple sources:

1. **Local Plugins Folder:** A directory in the user's home (e.g., `~/.dev/plugins/`) can contain plugin packages. Each subfolder might be a plugin module (likely as a Node module with a package.json or an index.js). The CLI will scan this directory and attempt to load each.
2. **Node Modules:** Any installed npm packages following a naming convention, for example packages named `@*/dev-plugin-*` or `dev-plugin-*`, could be auto-loaded. This allows distributing plugins via npm. The CLI can use `import.meta.resolve` or a Node-like require.resolve in Bun to find these modules.
3. **Git URLs from Config:** As specified in `config.plugins.git`, the CLI supports specifying git repositories as plugins. For each URL in that list:

   * On `dev upgrade`: if the plugin is not already present in cache, clone it into the plugin cache directory. If it is present, perform a `git pull` or fetch to update it to the latest main/master (or possibly a specific tag/commit if specified).
   * The plugin cache directory could be `XDG_CACHE_HOME/dev/plugins/` or `~/.dev/plugins/` (if we treat that as cache). To avoid name collisions, we might hash the URL to a directory name or use a folder naming scheme (e.g., `~/.dev/plugins/github_com_acme_dev-plugin-foo`).
   * After updating/cloning, load the plugin module from that directory (e.g., require its `dist/index.js` or whichever entry point).
4. **Other sources (future):** We might later allow downloading plugin bundles or via a registry, but initially the above cover the main use cases.

**Loading Process:** During CLI startup (after core services are initialized, but before processing the specific command):

* Load each plugin sequentially.
* For each plugin module found:

  * Use dynamic `import()` to import it (Bun and Node support importing local files and maybe directly from a path).
  * Verify it has a default export matching `AppModule`.
  * If it has a Layer in `AppModule.layers`, combine that layer with the core AppLive layer (Layer merging in Effect can compose layers that provide additional services). If a plugin layer provides a service that core already has, it could override or extend it depending on how layers are merged (we need to design carefully to avoid conflicts).
  * Register any `commands` from the plugin with the CLI parser (Yargs). This likely means calling `yargs.command()` with the spec. We need to ensure naming conflicts are handled (if a plugin defines a command that core has, perhaps core wins or plugin overrides depending on design, but probably best to avoid conflict by convention).
  * Enqueue any `onStart` hooks to be executed (these can be collected and run as part of startup sequence).
* After all plugins loaded, run all collected `onStart` hooks (these are Effects, which we can run sequentially or in parallel within the Effect runtime context).

**Error Handling:** If a plugin fails to load (e.g., syntax error, or missing default export), the CLI should catch that error, log an informative message (but not crash), and continue without that plugin. This ensures a bad plugin doesn't take down the whole CLI. Possibly mark it as disabled for that run.

**Security Consideration:** Loading plugins, especially from remote git URLs, means running untrusted code. We may consider warnings or sandboxing in the future, but given this is a developer tool (and presumably plugins are vetted by the org or user), we will proceed with straightforward loading. We should clearly document this for users.

## 10 · Commands Overview

The Dev CLI provides a set of core commands to cover the key feature areas. Below is a summary of the primary commands, their purpose, and the main domain services they rely on:

| Command                        | Synopsis & Purpose                                                                                                                                                                                                                                                                                                                                                                                                   | Primary Services (Ports)                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **cd**                         | `dev cd [projectName]` – Change directory to a project. Without arguments, opens an interactive fuzzy finder to select a project directory under the base path. With a name, directly navigates to the best match.                                                                                                                                                                                                   | FileSystem, Shell                                                |
| **clone**                      | `dev clone <repo>` – Clone a repository (from GitHub/GitLab or other configured provider) into the appropriate directory under the base path. Supports shorthand (repo name uses default org), full `org/repo` notation, or full git URL.                                                                                                                                                                            | RepoProvider, Git, FileSystem                                    |
| **up**                         | `dev up` – Set up or update development environment tools (like languages, package managers, etc.) for the current project or system using **Mise** (a tool version manager and task runner). Installs missing tools or updates them as needed.                                                                                                                                                                      | Mise, Shell, FileSystem                                          |
| **auth**                       | `dev auth [service]` – Authenticate with developer services (GitHub, GitLab, Google Cloud, etc.). Without arguments, runs auth for all relevant services; with a specific service (e.g., `gcloud`), authenticate only that one. Stores tokens/credentials securely (possibly via Keychain).                                                                                                                          | Keychain, Network (for OAuth flows), Shell (maybe invoking CLIs) |
| **status** (alias: **doctor**) | `dev status [--json]` – Check the status and health of the development environment. Verifies things like required tools are installed, environment variables set, config is valid, current project state (e.g., git status clean), etc. Outputs a summary (and detailed JSON if `--json` flag is given) including any errors found. Exits with code 3 if any issues detected (so CI can catch environment problems). | Many (FileSystem, Git, Mise, Network, etc.)                      |
| **run**                        | `dev run <task> [-- <args>]` – Run a project-specific task using **Mise**. Essentially a wrapper to `mise run <task>` for the current project, ensuring the environment is set up. Additional `-- ...` arguments are passed through to the task.                                                                                                                                                                     | Mise, Shell                                                      |
| **upgrade**                    | `dev upgrade [--regenerate-completions]` – Upgrade the Dev CLI itself and related configurations. Downloads the latest CLI release or pulls updates, updates the config file from `configUrl`, updates plugins (git pull), and optionally regenerates shell completion scripts. After running, the CLI should be up-to-date (it might prompt the user to re-source their shell if needed).                           | Network, FileSystem, Config, PluginLoader                        |
| **help**                       | `dev help [command]` – Display detailed help text. This is largely handled by the CLI framework (Yargs) showing usage info and available commands.                                                                                                                                                                                                                                                                   | (Uses Yargs/Console)                                             |

Each command will be implemented as a function (or class with an `execute` method) under `src/app/commands/`. They interact with the domain ports to do their work. Below, we outline design considerations and behavior for each command in more detail:

### 10.1 `dev cd`

* **Purpose:** Quickly navigate to a project directory.
* **Behavior:**

  * If no `projectName` argument is provided, the CLI will list available projects under the base path (from config `paths.base`) and allow the user to interactively fuzzy-search them (likely using the `fzf` tool via a Shell command, or a built-in fuzzy search if we implement one). This gives a UI to pick the target directory.
  * If a `projectName` is provided, the CLI will attempt to directly find a matching project directory. For example, `dev cd myproject` should navigate to the directory under `~/src` (or configured base) that matches "myproject". If multiple matches exist or the name is ambiguous, it could prompt or fuzzy select among them.
  * The matching logic can search the directory tree one level deep (e.g., under `~/src/github.com/*/myproject`). Because projects are nested under provider and org, `cd` may need to scan through providers and orgs. Alternatively, maintain an index of known projects (perhaps cached from previous runs) to speed this up.
* **Implementation:** Uses **FileSystem** port to scan directories, and uses **Shell** port to handle integration with the user's shell. Notably, changing directory is a special case: a subprocess cannot change the parent shell's working directory. We will likely implement `dev cd` such that it prints the target directory path to stdout (or executes an `cd` in a subshell that the user's shell function can capture).

  * We expect the installation to include a shell function or alias that intercepts `dev cd` calls. For example, in `.zshrc`: a function like

    ```shell
    dev() {
      if [ "$1" = "cd" ]; then
        # Call the real dev CLI and capture output
        DIR=$(dev-cli cd $2)
        if [ -d "$DIR" ]; then cd "$DIR"; fi
      else
        dev-cli "$@"
      fi
    }
    ```

    This way, `dev cd` will effectively change directory in the user's shell by using the path returned by the CLI.
  * If no such function is set up (user didn't source the shell integration), `dev cd` will just output the directory path. The user can still use it by doing ``cd `dev cd project` `` manually.
* **Error cases:** If the base path does not exist or is not accessible, return a `FsError`. If no project is found matching the query, return a `ConfigError` or perhaps a specific `NotFound` error (could introduce a `UnknownProjectError` variant) – but in practice, it's more of a user input issue than an internal error. Perhaps just output "Project not found" and exit 1 (UnknownError).
* **Ports used:** `FileSystem` (to read directories), `Shell` (to possibly invoke `fzf` or other shell interactions). Optionally, if not using external `fzf`, we could implement a fuzzy search in pure JS, but leveraging `fzf` might be easier and faster if we assume it's installed (the status check will flag if `fzf` is missing).

### 10.2 `dev clone`

* **Purpose:** Clone a repository into the standardized local directory structure with minimal user input.
* **Behavior:**

  * The user can specify a repository in various shorthand forms:

    * Just the repo name (e.g., `dev clone myrepo`): This will use the `defaultOrg` from config (e.g., "acme") and a default provider (likely GitHub by default, unless configured otherwise) to construct the full repository URL. For instance, it assumes `github.com/acme/myrepo.git` (or corresponding Git URL).
    * Org and repo (`dev clone myorg/myrepo`): This will use the default provider (e.g., github.com) but override the organization to "myorg".
    * Full URL (`dev clone https://github.com/otherorg/otherrepo.git` or `git@gitlab.com:org/repo.git`): In this case, the CLI will parse the URL to identify provider (GitHub vs GitLab vs others), organization, and repo name.
    * Flags `--github`, `--gitlab`, etc.: We will allow explicit provider flags in case the same org/repo name exists on multiple providers or to override default. For example, `dev clone --gitlab myrepo` would clone from GitLab's default org (or default org might be provider-specific).
  * The clone command uses the **RepoProvider** port to resolve the input into a concrete Git URL. RepoProvider service encapsulates logic for:

    * Knowing the base URLs or patterns for different git hosting providers (GitHub, GitLab, possibly Bitbucket or others).
    * Possibly knowing authentication if needed (could use stored tokens for private repos).
    * It might also determine the target directory path under `paths.base`. For example, given provider "github.com", org "acme", repo "myrepo", and base `~/src`, the target directory should be `~/src/github.com/acme/myrepo`.
  * Once the RepoProvider yields a full clone URL and target path, the **Git** port is used to execute the actual clone operation. This likely calls out to the `git` CLI (e.g., `git clone <repoUrl> <targetPath>`). We should ensure to create intermediate directories as needed (if `~/src/github.com/acme` doesn't exist, create it).
  * After cloning, possibly perform post-clone tasks:

    * Optionally, check out specific default branch if needed (git usually does that automatically to default branch).
    * Maybe run `dev up` automatically inside that repo? (Not in spec, but sometimes tools do that. We might leave that to user to run `dev up` if needed.)
* **Directory Structure:** The expected structure for cloned repos will be nested as: `<base>/<provider>/<org>/<repo>`. For example:

  ```
  ~/src/
  ├── github.com/
  │   ├── acme/
  │   │   ├── project1/   (cloned repo)
  │   │   └── project2/
  │   └── otherorg/
  │       └── projX/
  └── gitlab.com/
      └── acme/
          └── project3/
  ```

  The CLI should ensure this structure. The base directory and provider subdirectories might be created if not present.
* **Error cases:** If the target directory already exists and is non-empty, return a `FsError` (or better, prompt or error that the repo folder already exists to avoid overwriting). If `git` is not available or the clone fails (network error, auth error, repo not found), capture that and return a `GitError` (with the git stderr message if possible). If an unsupported provider is requested, return a `ConfigError` indicating unknown provider.
* **Ports used:** `RepoProvider` (to parse input and give URL/path), `FileSystem` (to create directories), `Git` (to perform the clone, possibly we treat Git as a separate port or just use Shell to call git), `Network`/`Auth` indirectly if credentials needed (though likely git CLI will handle auth prompts, unless we preconfigure credentials via environment or config).

### 10.3 `dev up`

* **Purpose:** Set up or update the development environment (especially language runtimes and tools) for the current project or globally, using **Mise** (mise-en-place).
* **Behavior:**

  * Typically run inside a project repository directory. It will invoke `mise` to ensure all tools specified in the project's `.mise.toml` (or global defaults) are installed and up-to-date.
  * If run outside a project, it might use a global mise config or simply ensure base dependencies (like ensuring mise itself is installed, etc.).
  * The command may call out to `mise` CLI: e.g., `mise install` or `mise setup` depending on how mise works (from the references, mise has commands to ensure tool versions).
  * After running, the environment (like Node, Go, etc.) required by the project should be ready to use.
* **Error cases:** If mise is not installed on the system, this is an error. The `dev status` command will likely flag if mise is missing. Possibly `dev up` could even attempt to install mise if not present (for example, via Homebrew or a script), but that might need user permission. Initially, we can require that mise is installed as part of installation.

  * If a particular tool installation fails (e.g., network error while downloading a runtime), it should return a `NetworkError` or `ShellError` with info.
* **Ports used:** `Mise` port to interface with the mise CLI or library. Possibly implemented via Shell (spawning `mise` process) or if mise provides a JS API (less likely, but mostly it's a CLI tool).

  * Also FileSystem if we need to check for config files, etc.
  * Logger could be used to print progress of installations.

### 10.4 `dev auth`

* **Purpose:** Streamline authentication with various developer services (GitHub, GitLab, Google Cloud, etc.) by providing a one-stop command.
* **Behavior:**

  * Without arguments, it should initiate authentication for all configured services. For example, if the config or environment indicates that the user uses GitHub, GitLab, and Google Cloud, it will ensure the user is logged in to each:

    * GitHub: possibly by checking if a GitHub CLI (`gh`) is available and logged in, or by opening a browser for OAuth and storing a token.
    * GitLab: similarly, maybe via GitLab's CLI or API token.
    * GCloud: invoke `gcloud auth login` if `gcloud` CLI is present.
  * With a specific service name (like `dev auth gcloud`), only perform that service's authentication.
  * The command should store credentials securely. Likely use the **Keychain** port which on macOS might integrate with Keychain Access, on Linux could use something like libsecret or gnome keyring (if available), or fallback to storing tokens in `~/.dev/credentials.json` encrypted or something if no secure store is available.
  * The Network port might be used if performing OAuth flows manually (e.g., starting a local server to catch OAuth redirect). Alternatively, rely on existing CLIs (`gh auth login`, `gcloud auth login`).
* **Error cases:** If a service is unknown, return a `ConfigError` (the user asked to auth an unknown service). If an authentication fails (network issues, wrong credentials, user closed the browser, etc.), return `AuthError` with details.
* **Ports used:** `Keychain` (to get/store tokens), `Network` (for HTTP requests if needed for OAuth), `Shell` (to possibly invoke other CLI commands like `gh` or `gcloud`), and maybe `Config` (to know which services to auth or endpoints to use).

### 10.5 `dev status` / `dev doctor`

* **Purpose:** Provide a comprehensive diagnostics report of the development environment and project state, so the user can identify any issues in setup.
* **Behavior:**

  * Checks a variety of things and prints a report. Likely sections of the report include:

    * **Base Path**: Verify that the base path (e.g. `~/src`) exists and is accessible. If not, that's an issue (maybe the user hasn't created it or mounted it).
    * **Required Tools**: Check that key external tools are installed and on PATH: e.g. `git`, `bun` (if needed separately), `fzf` (for interactive search), `mise`, `gh` (GitHub CLI, if needed for auth), etc. For each, print the version or mark as missing.
    * **Optional Tools**: Check presence of optional but commonly used tools: e.g. `gcloud` CLI if Google Cloud is relevant, Docker if needed for some dev workflows, etc. These could be configured in the config file for what to check.
    * **Project-specific checks**: If the current working directory is inside a known project (e.g., a git repository under the base path):

      * Check Git status: are there uncommitted changes? Is the repo on a certain branch? (Could be just informational or warn if there are uncommitted changes).
      * Check for presence of a `.mise.toml` and whether running `mise doctor` yields any issues (if mise has a doctor command).
      * Check for configuration files (like if the project expects certain environment variables or config files present; this would be highly specific, possibly skip unless config defines something).
    * **CLI installation**: Verify that the CLI itself is up-to-date. Possibly check the latest version from a source (though that overlaps with `dev upgrade`). At least show the current version of the CLI and where it's installed.
    * **Config**: Validate that the config file is loaded and at current version. If not, mention it or auto-migrate. If any recommended config fields are missing or deprecated fields present, warn the user.
    * **Plugins**: Check if plugins are loaded successfully. If some failed, list them.
    * **Shell Integration**: Check if shell completions are installed or if the `dev` function for `cd` is set up (if we can detect that via an env var or some marker).
    * **Summary**: Provide a pass/fail count of checks, and perhaps exit with a non-zero code if any essential checks failed. The spec suggests exit code 3 if any error item, which aligns with an environment issue (distinct from other exit codes).
  * The command likely prints a human-readable multi-line report by default. If `--json` flag is provided, output the data as JSON for machine consumption (which could be useful in CI to parse the environment state).
* **Error cases:** `dev status` itself shouldn't "error out" on the first issue; it should collect all issues and then report. However, if something prevents checks (like config file totally unreadable), it could report that as part of the output and possibly exit with a code indicating failures. The exit code will be 0 if all checks passed, or 3 if one or more checks failed (distinct from 1 which is unknown error, or others).
* **Ports used:** This command touches many:

  * `FileSystem` (check files and directories),
  * `Shell` (to run external commands like checking tool versions, maybe `git status`, `mise doctor`),
  * `Git` (to inspect git status via an API or via shell commands),
  * `Config` (to verify config data),
  * `Network` (maybe to check internet connectivity or reachability of something),
  * `Logger` (to accumulate messages internally),
  * Possibly `Mise` port for checks,
  * `Keychain`/`Auth` to see if credentials exist (e.g., check if user is logged into GitHub by seeing if a token is present).

  This command may need careful structuring to not be too monolithic. It might be broken into sub-checks each returning an error or success, then aggregate.

### 10.6 `dev run`

* **Purpose:** Run project-specific tasks or commands defined by the user’s environment, using Mise as the backend.
* **Behavior:**

  * Essentially forwards the call to `mise run <task> ...`. If a project has tasks defined (e.g., in `.mise.toml` or similar), this allows user to invoke them through `dev`.
  * For example, `dev run build --watch` would call `mise run build -- --watch` (the `--` might delineate additional args passed to the task).
  * If run outside a project or if no such task exists, it should error out or inform the user.
  * This is mostly a convenience to not call mise directly, and also to ensure the environment is loaded (perhaps `dev run` could implicitly ensure `dev up` has been called or do so if needed).
* **Error cases:** If mise is not installed or not configured, throw `ShellError` or `ConfigError`. If the task name is not found, output an error (maybe as `UnknownError` since it's user input issue).
* **Ports used:** `Mise` (to run tasks), `Shell` (if `mise run` is executed as a subprocess), possibly `FileSystem` (to ensure we are in a directory with a mise config).

### 10.7 `dev upgrade`

* **Purpose:** Update the CLI and its related configurations to the latest version.

* **Behavior:** The upgrade process involves multiple sequential steps:

  1. **Self-Update:** Download the latest version of the Dev CLI binary or script. Since this CLI is distributed via Bun (which can compile to a single binary), the upgrade might fetch an updated binary from a known URL or perform a `bun install` from a git repo. Implementation options:

     * If releases are published (e.g., on GitHub or a CDN), `dev upgrade` can fetch the appropriate file (based on OS/arch) and replace the current `~/.dev/bin/dev` (for example). It might need to run with privileges if the install location is privileged, but since we install in home, it's fine.
     * Alternatively, if the CLI was installed via git clone, `dev upgrade` might do a `git pull origin main` in `~/.dev` and then re-run `bun install && bun build` to update. However, the spec explicitly mentions "Download latest binary" which implies a pre-built artifact approach.
  2. **Config Update:** Fetch the remote config file from `configUrl` (if defined). Compare it to the local config:

     * If the fetched config JSON is different (or its version is newer), apply migrations to ensure it matches our latest schema, then save it to the config file location (overwriting the old).
     * If it's the same, do nothing. Possibly output "Config is up to date".
  3. **Plugins Update:** For each Git plugin URL in config:

     * If the plugin is not present, clone it to the plugin directory (as described in Plugins section).
     * If it is already present, `git fetch` or `git pull` to get the latest changes.
     * Possibly, if plugins are versioned or use tags, handle that (initially assume main branch latest).
  4. **Shell Completions:** If `--regenerate-completions` flag is passed (or always, depending on design), regenerate shell completion scripts:

     * Run the script at `scripts/generate-completions.ts` which uses Yargs to produce completion scripts for bash, zsh, fish.
     * Output those to `completions/` directory (or directly to the shell specific locations if we integrate with user shell config).
     * If the user has completions set up via the installed path, this ensures new commands or options are included.
  5. **Report:** Print the updated version of the CLI and any notable changes. For example, if new config was applied or plugins updated, inform the user. Possibly prompt if further action needed (like re-sourcing shell if completions updated).
  6. The CLI may then exit, or if run inside an old version to update, it might exec the new binary. Likely simpler: instruct user to restart the terminal or just continue using normally (the next invocation will use the new version).

* **Rollback Plan:** In case the upgrade fails partway (network issues, etc.), the CLI should handle errors gracefully:

  * If the binary download fails, leave the current version intact and error out with `NetworkError`.
  * If config fetch fails, warn but keep old config (maybe treat it as non-fatal unless the user specifically wanted it).
  * If plugin update fails for one plugin, warn about that plugin but continue with others.
  * The upgrade process should not leave the CLI in a broken state. Possibly perform downloads to temporary files and only replace originals on success.

* **Ports used:** `Network` (to download binary and fetch config), `FileSystem` (to write files, move binaries), `Git` (to update plugins), `Config` (to load and save config), `Shell` (maybe to run any script needed for installation).

* **Security:** Ensure the sources for binary and config are trusted (hardcoded official URLs or config-specified URLs that the user provided).

### 10.8 `dev help`

* **Purpose:** Display usage information.
* **Behavior:** Relies on Yargs built-in help generation. `dev help` or any unrecognized command will show the list of commands, global options, and if `help [command]` then details of that command’s options.
* **Implementation:** Minimal, mostly configured via Yargs `.help()` and `.epilogue()` etc. We can customize examples in the help output. No complex logic needed in our code beyond making sure all commands are registered with descriptions.
* **Note:** Ensure that plugin commands also get included in help. We might need to call something like `yargs.command(pluginCommandSpec)` for each plugin command so that Yargs knows about them for help and completion.

## 11 · Shell Completions

To enhance usability, the CLI will provide shell completion scripts for popular shells (Zsh, Bash, Fish):

* We will have a script (`scripts/generate-completions.ts`) that uses Yargs's completion generation or a library to produce completion scripts. This script will output files in the `completions/` directory for each shell.
* The completions script can be run as part of release or upgrade. Indeed, the `dev upgrade --regenerate-completions` option triggers this script to refresh the completions in case new commands or options were added.
* For installation, the `setup.sh` script (as mentioned in the README) likely takes care of installing these completions:

  * For Zsh: copying or appending to `~/.oh-my-zsh/completions` or appropriate `$fpath`.
  * For Bash: maybe adding an entry in `.bashrc` using `complete -C` or sourcing the file.
  * Alternatively, the CLI could provide a command `dev completion <shell>` that prints the completion script to stdout, so user can do `dev completion zsh > /usr/local/share/zsh/site-functions/_dev`.
* We should ensure the completion scripts cover not just core commands but also plugin-provided commands. By generating after plugins load (if generation is dynamic), or perhaps the completion generation script also scans the plugins directory or uses the running CLI to enumerate commands (for instance, we can have `dev --generate-completions` internally load everything then output).
* If we opt for static pre-generated completions in the repo for distribution, we must update them on each release (automate via CI using the script).
* Documentation should instruct users to install the completions. If the installer script is used, it likely automates it. Otherwise, we provide instructions like `eval "$(dev completion zsh)"` as a quick fix.

## 12 · `dev upgrade` Sequence (Recap)

Bringing together the steps for the `upgrade` command execution in order:

1. **Download Latest CLI:** Determine the latest version available (could be hard-coded to check GitHub releases or an API). Download the new version of the CLI. This could be a binary file if available. If using Bun, possibly the binary is the Bun runtime bundled with the app. Alternatively, if the CLI is distributed via npm or git, this step might perform a `git pull` and re-build. The preferred approach is a self-contained binary for simplicity.
2. **Install/Replace:** If a new binary was downloaded, replace the current `dev` binary/script with it. Perhaps keep a backup of the old one in case.
3. **Fetch Remote Config:** If `configUrl` is set in local config, perform HTTP GET to that URL. On success, compare with current config content:

   * If changed or newer, run migration on it (if version differs or if any structural changes needed), then save it to the config file location.
   * If there's an error fetching, log a warning (NetworkError) but continue.
4. **Update Plugins:** For each Git plugin URL in config:

   * If plugin directory exists, go into it and `git pull` to update to latest.
   * If it does not exist, `git clone` it into the plugins directory.
   * (If any of these fail, mark that plugin as unable to update; notify user at end.)
5. **Regenerate Completions:** If the `--regenerate-completions` flag is present (or we decide to always do it on upgrade):

   * Run the internal script to generate fresh completion files for each shell.
   * Install them to the appropriate location if possible (this might require knowing where to put them; perhaps we only output to the `completions/` folder and inform the user if manual steps are needed).
6. **Finish:** Print out a summary:

   * New version installed (e.g., "Dev CLI upgraded to vX.Y.Z").
   * If config was updated (maybe list any significant changes or just say "Config updated from source").
   * If any plugins updated or if any failed.
   * If completions updated (maybe remind the user to reload their shell if needed).
   * If nothing was updated (already latest), inform the user as well.
7. **Exit:** Possibly with a special code if something failed (but since upgrade is a multi-step, we might still exit 0 if the main binary updated successfully even if a plugin failed, or vice versa, depending on severity). A safe approach: if the CLI binary update itself failed, exit non-zero (NetworkError). If config or plugin update failed, maybe still exit 0 but with warnings (since those aren't critical to tool functionality, except maybe config). Or use a combination of exit codes or messaging.

This sequence ensures the user always has the latest CLI and configuration as defined by their org, without needing to manually re-run installation steps.

## 13 · Observability: Logging and Telemetry

To ensure the CLI is maintainable and issues can be diagnosed, we will implement robust observability features, including structured logging and optional remote telemetry. These are designed such that the CLI can operate fully offline and degrade gracefully if telemetry is disabled or network is unavailable.

### 13.1 Logging

Logging will be implemented via a **Logger** service (provided in the AppLive layer) to allow uniform logging across the application without tying directly to `console.log`. This logger will support different output formats appropriate to the context (interactive use vs CI or automated use).

* **Human-Friendly Logs:** By default, when a user runs the CLI in a terminal, logs and messages should be formatted for readability:

  * Use colors and text formatting (if the terminal supports it) to highlight warnings, errors, or important info.
  * Print user-facing messages in a clear, concise way.
  * Avoid dumping huge objects; format them nicely if needed.
  * Possibly use spinner or progress indicators for long operations (like `dev up` installing many tools) – these would be part of the Console I/O in CliLive, not exactly the logger, but related to user feedback.
* **Structured Logs (CI Mode):** In continuous integration or automated environments, it's often useful to have machine-readable logs (e.g., JSON). We will detect such scenarios or allow an option for it:

  * If an environment variable `DEV_CLI_LOG_JSON=true` or a flag `--json-logs` is set, or if we detect `CI=true` in env, the Logger should switch to JSON output mode.
  * In JSON mode, each log entry (info, warning, error) is output as a JSON object in a single line (to make parsing easy). For example:

    ```json
    {"level":"ERROR", "ts": 162763... , "message": "Failed to clone repo", "error": "AuthError: token expired"}
    ```

    Could include timestamp, level, and structured fields (maybe error type, etc.).
  * This structured output would allow a CI pipeline to parse and generate alerts or simply log it in a more structured logging system.
* **Levels:** Define log levels (DEBUG, INFO, WARN, ERROR). The default verbosity can be INFO for normal use. A global flag `--verbose` or env could set DEBUG level (for troubleshooting deeper issues, showing e.g. the exact Git commands run, etc.).
* **Implementation:** The LoggerLive service will likely provide methods like `Logger.log(level, message, meta?)`. Inside, it will check the configured mode (human vs JSON) and output appropriately to stdout or stderr.

  * For human mode, could use a library like chalk for colors, or Bun's console which may support some styling.
  * For JSON mode, just `console.log(JSON.stringify(obj))`.
  * We integrate Logger with Effect's logging if available. (Effect-TS might have its own logging layer, but we can adapt or use it directly.)
* **Usage in code:** Instead of using `console.*`, command code will use Logger (accessible via Effect environment). For example: `Effect.logInfo("Cloning repository...")` if integrated with Effect's logger or using our own. We ensure that these calls respect the log level and format settings.
* **Errors and Stack Traces:** For errors, especially unexpected ones, in dev mode (verbose) we might output stack traces. In normal mode, we may just output the error message and a suggestion. Because we handle errors via DevError, we usually won't have raw stack traces for expected errors. If an UnknownError occurs (likely a bug), in verbose mode, print the stack for debugging; in normal mode, a short "An unexpected error occurred, run with --verbose for details or report this issue."

By providing these logging modes, we cater to both human users and automated systems. This dual logging strategy ensures that in CI, logs can be parsed (for example, to automatically create annotations or to feed into a log aggregator), while locally the user isn't overwhelmed with JSON and can easily read what's happening.

### 13.2 Remote Telemetry (OpenTelemetry Integration)

In addition to local analytics, the CLI will include optional support for remote telemetry using the OpenTelemetry standard for traces and metrics. This will allow the team to collect anonymized usage data and performance metrics in a centralized system (e.g., Datadog), which can help in understanding usage patterns and diagnosing issues in the field. **This telemetry will be strictly opt-in (enabled via config or env)** to respect users who cannot or do not want to send data.

* **Integration with Effect:** We will leverage the **@effect/opentelemetry** integration. Effect-TS can propagate OpenTelemetry contexts and spans behind the scenes. We plan to instrument each command execution as a trace with spans for critical sub-operations.

  * For example, when a command starts, we create a root span named like `DevCLI.<CommandName>`. We attach attributes such as the CLI version, command name, maybe an anonymized user or machine ID (if we have one, could generate a random ID on first run and store in config or state).
  * As the command runs, certain operations can be child spans: e.g., a span for "CloneRepo" that tracks the duration of the `git clone` subprocess, or a span for "MiseInstall" in `dev up` to time how long environment setup took, etc.
  * If a command fails with an error, we mark the span as errored and record the error type as an attribute (e.g., `error.type=GitError` and `error.message=<reason>`).
  * When the command finishes, the span is ended. The Effect OpenTelemetry layer will handle exporting that trace to the configured OpenTelemetry exporter.
* **Datadog Export:** The likely backend is Datadog, which supports OpenTelemetry ingest. We can configure the exporter to send data to Datadog’s OTLP endpoint or via the Datadog agent:

  * If a Datadog agent is running locally (listening on localhost), we send spans there.
  * Otherwise, use an HTTP exporter to Datadog’s API with an API key if available.
  * These details (like endpoint and API keys) might be configured via environment variables or a separate config section (not in the spec example, but could be added as needed).
* **Performance:** Telemetry should not slow down the CLI noticeably:

  * Exporting spans can be done asynchronously. The Effect telemetry layer likely batches and sends after the command completes or in background. We might also use a fire-and-forget approach on process exit (with a short timeout to send data).
  * If the CLI is offline (no internet), the telemetry exporter should drop data or queue for later. We might not implement a complex queue; simpler is that if it can't reach the endpoint, it fails silently or logs a debug message. The CLI should **never hang** waiting on telemetry network calls. We'll set timeouts if needed on those exports.
* **Opt-In Controls:** Telemetry will only run if enabled:

  * The config file `telemetry.enabled: true` is the primary toggle. If it's false, we do not initialize the OpenTelemetry layer at all.
  * We could also allow an environment override `DEV_CLI_TELEMETRY=0` to force disable (for privacy or troubleshooting).
  * If enabled, we might print a brief message on first run like "Telemetry enabled: sending usage data to improve the tool. You can opt out via config." to be transparent.
* **Metrics and Logs:** In addition to traces (spans), OpenTelemetry could also send metrics or logs. At this stage, traces (with span durations and statuses) give us a lot of info. If needed, we could add metrics like "command.count by type" or "error.count by type", but those can also be derived from spans in Datadog by querying span data. We'll primarily focus on trace spans for each command execution.
* **Data Collected:** We will ensure no sensitive information is sent in telemetry:

  * Command names and high-level success/failure and performance are sent. Arguments might contain names of projects or repos; we should avoid sending actual repo names if sensitive. We can choose to not include arguments or to sanitize them (e.g., just note if certain flags were used).
  * Personal data like usernames, file paths, etc., should not be sent. For example, the `cwd` path can be sanitized to just indicate if it’s within base path or not, or not sent at all.
  * We will document what we collect for transparency.

Implementing telemetry via the Effect OpenTelemetry integration will involve creating a Telemetry layer (in CliLive) which likely wraps the OpenTelemetry Node SDK. We will:

* Initialize an OpenTelemetry SDK with appropriate exporters (Datadog).
* Use `Layer.fromEffect(Telemetry)` to make it available. The Effect library may automatically create spans for each Effect.run if configured, or we may manually instrument important sections.
* Ensure to shut down the telemetry SDK on process exit (to flush data).

By having telemetry, the development team can observe how often commands are used, how long they take, and where errors might be occurring in aggregate, which is invaluable for directing future improvements. However, the CLI must be fully functional offline, so telemetry failures must not affect command execution (failures should be caught and ignored, maybe logged in debug mode).

## 14 · Implementation Plan & Task Breakdown

Implementing this CLI will be a significant project. Below is a breakdown of tasks and milestones in a logical order to guide development. The implementation can be done incrementally, and we can prioritize core functionality first (navigation, cloning, etc.) and add advanced features (plugins, telemetry) later if needed.

1. **Project Setup:**

   * Initialize the repository with Bun (bun create, etc.), set up TypeScript, and ensure the basic structure (folders as per layout) is in place.
   * Create `bin/dev` entry file (with a shebang) that simply imports the compiled CLI JS (or uses Bun to run TS directly in dev mode).
   * Set up basic scaffolding in `src/index.ts` to initialize the Effect runtime and call a placeholder CLI handler.
   * Add basic scripts in package.json for building, linting, testing (Vitest).
   * Lock the versions of dependencies as specified (perhaps using `bun.lockb`).

2. **Domain Model & Ports:**

   * Define the `DevError` union and `exitCode` mapping (as in section 6). Include any additional error tags you think might be needed as development proceeds.
   * Define interfaces for all domain ports in `src/domain/ports/`. For each port, sketch out the methods needed:

     * FileSystem: e.g. `readFile`, `writeFile`, `exists`, `listDir`, etc.
     * Git (or RepoProvider combined): e.g. `clone(repoUrl, targetPath)`, possibly `checkRepoStatus(path)` if used in status.
     * RepoProvider: e.g. `resolveRepo(input: string, flags: {github?:boolean,...}): { provider, org, name, url }`.
     * Mise: e.g. methods to run install or tasks, or just one method `runMise(args: string[])`.
     * Shell: e.g. `exec(command: string, args: string[], options?): Promise<{ stdout, stderr, exitCode }>` for general command execution, and perhaps specialized for interactive usage (like `fzf`).
     * Keychain: e.g. `getSecret(service: string): string | null`, `setSecret(service: string, value: string)`.
     * Network: e.g. basic HTTP GET/POST functionality.
     * RunStore: as discussed (`recordStart`, `recordFinish`, `prune`).
   * Domain models: define any common types, e.g. a type for config object (matching schema), perhaps types for status check results, etc.

3. **Effect Layer Setup:**

   * Using Effect-TS, define the Layer implementations:

     * **InfraLive**: Provide implementations for each port using Bun/Node APIs or libraries. For now, stub them or create skeletons. For example, FileSystemLive can wrap Bun.fileSystem or Node fs calls; ShellLive can use Bun.spawn or a polyfill for child\_process, etc.
     * **AppLive**: Compose InfraLive. Also, implement Config service: a function to get config values (after loading, which we'll do later), Logger service (we can start with a simple console logger).
     * **CliLive**: Compose AppLive and add Console (which might just wrap process.stdin/stdout or use prompts for interactive input), Telemetry (for now, perhaps a no-op that we fill in later).
   * Ensure that we can build a complete Layer stack and access each service. Write a small test or demo where an Effect accesses FileSystem or Logger to ensure layering is correct.

4. **CLI Argument Parsing (Yargs) Setup:**

   * Install Yargs and set up the base CLI structure in `cli/parser/yargs.ts`. Define placeholders for commands (just the names and descriptions for now, with handlers pointing to dummy functions or to call into Effect).
   * Make sure global options like --help, --json (for status), --verbose are configured.
   * Ensure that running `dev --help` shows something.
   * This step is mainly scaffolding; actual command logic comes later.

5. **Config File Loader Implementation:**

   * Implement `config/loader.ts` to actually load the config:

     * Determine path (e.g., `~/.dev/config.json` - you might parse `~` to home directory).
     * Read file (if not present, treat as error or create a default one if we decide to have defaults).
     * Validate JSON (catch JSON parse errors and throw `ConfigError` if so).
     * If version < current (3), sequentially apply migrations. Write simple migration functions for a couple of dummy versions for testing.
     * Validate the final object against the schema (could use a library like Zod or custom checks).
     * Provide the Config object via a service (could be as simple as storing it in an Effect.Ref or Layer managed service).
   * Write unit tests for config loading with various scenarios (no file, older version file, invalid JSON).

6. **Logger Service Implementation:**

   * Implement `LoggerLive` in `src/effect/` (or similar) to output logs according to section 13.1:

     * Use an environment variable or config setting to decide on structured JSON vs human-readable.
     * Possibly use Effect's built-in logging if it exists (Effect-TS might have `Effect.logInfo` etc., which requires enabling a logger layer).
     * If implementing manually: create functions `info(msg)`, `warn(msg)`, `error(msg, errorObj?)` and have them format output.
   * Integrate Logger with AppLive layer so that commands can call a logging function.
   * Test by calling logger from a dummy command in both modes (set env CI=true and ensure JSON output).
   * Ensure that logs go to stderr or stdout appropriately (generally, informational logs to stdout, errors to stderr).

7. **Implement RunStore (Local Analytics):**

   * Set up Drizzle ORM with SQLite:

     * Add Drizzle dependencies and Bun's sqlite adapter if needed.
     * Define the schema as per 7.1 in `infra/db/schema.ts`.
     * Initialize the database in `RunStoreLive.ts`: open connection (possibly using Drizzle's connector for better typing).
     * Implement `recordStart` (insert with started\_at etc.), `recordFinish` (update the row with given id), and `prune` (delete rows based on some criteria).
   * Consider using an incremental id or uuid. We can use a simple approach: use a random UUID string for each run as `id`.
   * Add logic to InfraLive layer to either provide a real RunStore (opening the DB) or a no-op if `DEV_CLI_STORE=0`.
   * Test: call recordStart and recordFinish in a controlled scenario to see data in DB (maybe writing an integration test to ensure a row is created and updated).
   * Make sure to close DB on program exit (Effect scope finalizer).

8. **Core Command Implementations:**

   * Now implement each command one by one in `src/app/commands/`:

     * **cd:** Use FileSystem to list directories under base path. If argument is provided, perform a search (maybe case-insensitive contains match) across orgs and providers. If exactly one match, output it; if multiple or none, handle accordingly (multiple: could list or fuzzy select, none: error message).

       * If no arg, perform fuzzy search interactively. Possibly call Shell to run `fzf` with the list of directories. This might involve preparing a list of "provider/org/repo" strings for fzf to choose from, and then constructing full path.
       * Return the chosen path as output (which, because of our shell function, will lead to actual directory change).
     * **clone:** Implement using RepoProvider and Git:

       * Parse arguments to determine target repo. Perhaps implement RepoProvider with knowledge of common patterns.
       * Ensure target directory path (create if needed).
       * Use Shell or Git port to execute `git clone`.
       * Possibly output a success message with path.
     * **up:** Check that we are either in a git repo or have a global toolset. Execute `mise` commands accordingly.

       * Possibly run `mise install` or `mise setup` through Shell.
       * Parse output to detect errors or success.
       * Output summary (e.g., "All tools up to date" or what was installed).
     * **auth:** Possibly the most interactive:

       * For now, implement a stub that maybe says "Not implemented" or only supports a trivial case, unless we know specific flows.
       * For GitHub, if `gh` CLI is available, we can call `gh auth login` via Shell.
       * For gcloud, call `gcloud auth login`.
       * For GitLab, if there's a CLI or use personal access token via web.
       * This might require guiding user through prompts.
       * At least store a flag that they authenticated (or check via Keychain if token exists).
     * **status:** Implement a series of checks (possibly modularize each check into a small function returning an object or so).

       * Gather results, format them for console or JSON.
       * Use exit code 3 if any check failed.
       * It's okay to start with fewer checks and add more as we integrate other pieces (like once Auth is implemented, we can check auth status).
     * **run:** Simply ensure we have `args` for mise and then Shell out to `mise run ...`.

       * Possibly check if inside a repo with a `.mise.toml` and warn if not.
       * Stream output from the underlying task to the console.
     * **upgrade:** This one is complex – implement step by step:

       * Determine how to get the latest binary. For initial version, maybe skip actual binary replacement (if running from source). If we do have a release distribution, integrate that (maybe later).
       * Implement fetching remote config: use Network port to GET configUrl.
       * For plugin updates: use Git port or Shell (invoke git commands in plugin dirs).
       * Completions: call our generation script (which we can invoke via Bun within the running process or spawn a separate process).
       * As we implement, test each sub-step in isolation.
       * Make sure it's idempotent and robust.
     * **help:** mostly handled by Yargs, just ensure the command descriptions and usage examples are set.

   Each command should utilize the Logger for any messages, not print directly, and should convert any failures into a `DevError` (likely by using `Effect.tryCatch` or `Effect.fail` with appropriate error on exceptions).

9. **Wire Commands to CLI (Yargs integration):**

   * In `cli/parser/yargs.ts`, replace dummy handlers with calls into the actual command implementations:

     * Because our commands are Effects, we might create a small utility: e.g. `runCommand(effect: Effect<DevError, void>)` that:

       * Obtains a RunStore instance to do recordStart.
       * Runs the effect and catches any failure.
       * On success or failure, calls recordFinish, logs if needed, and then exits with appropriate code.
     * The Yargs handler for each command can call something like:

       ```ts
       handler: async (argv) => {
         const effect = CdCommand.run(argv.name);
         await runEffect(effect);
       }
       ```

       Where `runEffect` sets up the environment (layer) and executes the effect. We might use `Effect.runPromise(effect.provideLayer(CliLive))` if effect-ts allows, to run it to completion in a Node/Bun environment.
     * Ensure to handle asynchronous nature properly (Yargs can handle promise returns).
   * Pass parsed arguments to the command Effect as needed.
   * Also ensure global options (like --verbose or --json for status) are captured and influence behavior (e.g., setting Logger level or telling status command to output JSON).
   * Test by running a couple of commands manually to see if wiring works.

10. **Plugin System Implementation:**

    * Implement scanning of plugin locations:

      * Check `~/.dev/plugins` directory: list subdirectories.
      * Check `node_modules` for packages matching pattern.
      * Use config for git plugins: ensure they are cloned (this likely was done in upgrade, so at runtime we assume they are present up-to-date).
    * For each discovered plugin path, do a dynamic import (Bun supports import of local files via file URL or just path).
    * Validate the loaded module has `default` of shape `AppModule`.
    * Merge plugin's layer if present:

      * We might have to compose multiple plugin layers together and then with AppLive. Effect-TS Layer can combine layers using `Layer.and` or similar. If multiple plugins provide layers, we do something like `const PluginsLayer = Layer.all(plugin1.layers, plugin2.layers, ...)`.
      * Then do `CliLive = Layer.use(AppLive)['+++'](PluginsLayer)['+++'](CliSpecificLayer)` – actual syntax might differ but essentially layering them.
      * Be careful about service identifiers: if two plugins provide the same service, we need to decide how to handle that (maybe last one wins or error).
    * Register plugin commands with Yargs:

      * Each `CliCommandSpec` might include name, description, builder, etc. We can call `yargs.command(spec)` to add it.
      * Alternatively, if the plugin commands are already effect objects, we still need to expose them to Yargs for parsing.
    * Execute plugin hooks:

      * If any onStart hooks exist, run them after setting up layers and before processing the actual command. Perhaps in `src/index.ts` after loading plugins, do `Effect.runPromise(Effect.all(onStartEffects).provideSomeLayer(AppLive+plugins))` to execute them (non-critical if they fail – log and continue).
    * Test with a dummy plugin (maybe create a small test plugin in tests/ that adds a command, and simulate loading it).

11. **Testing:**

    * Write **unit tests** for core logic:

      * For each command, using dummy port implementations, test that given certain inputs it produces expected outputs or effects.
      * Example: test `clone` with a fake RepoProvider that returns a known URL and a fake Git that pretends to succeed, ensure the directory creation was requested.
      * Test `cd` logic for matching project names.
      * Test config loader with various version inputs.
      * Test RunStore: that after a simulated command run, recordFinish updates the entry.
    * Write **integration tests**:

      * Possibly using the real file system but an isolated temp directory for base path.
      * Test end-to-end flows, like clone then cd then up.
      * Use `bun run` or spawn the CLI in a subprocess to simulate actual usage if needed (for e2e).
    * Ensure tests can swap out layers: e.g., use `TestFileSystem` that uses a temporary directory rather than real home directory.
    * Aim for good coverage, especially for error conditions (simulate git failure, network down, etc., using the fake adapters).
    * The test for `status` might be complex; perhaps just test that it catches known issues (like if we simulate missing tools).
    * Use Vitest for running tests, and maybe set up GitHub CI (the provided `.github/workflows/ci.yml`) to run them on pushes.

12. **Documentation & Examples:**

    * Although not code, update the README or docs with any new details (the original readme likely needs updating to match any new behavior).
    * Ensure usage examples are accurate, and document how to configure telemetry, etc., clearly so users know how to opt out or in.
    * Provide guidance for plugin development (like the shape of AppModule).

13. **Performance considerations:**

    * Evaluate the startup time of the CLI (Bun is fast, but loading a bunch of modules can add overhead). Possibly use Bun's bundling to have a single file distribution to improve startup.
    * Ensure that if many plugins are present, loading them isn't too slow (maybe lazy load heavy stuff only when needed).
    * For `dev cd` fuzzy search, if a user has hundreds of projects, ensure listing and fzf is efficient (fzf itself can handle a lot, but building the list might need to avoid scanning too deep).

14. **Finalize Telemetry Integration:**

    * Once everything else is stable, integrate the OpenTelemetry:

      * Add `@effect/opentelemetry` package.
      * Initialize in CliLive if telemetry.enabled.
      * Configure the exporter for Datadog: typically set environment variables like `OTEL_EXPORTER_OTLP_ENDPOINT` or use Datadog's default (if agent, default is [http://localhost:4318](http://localhost:4318)).
      * Test telemetry in a controlled environment (maybe by running a local OpenTelemetry Collector and verifying spans are received).
      * Ensure no crash if network is off (simulate by pointing endpoint to nowhere).
    * Possibly wrap each command's effect with `Effect.span("commandName")` provided by effect-ts to automatically create spans. The OpenTelemetry layer might allow capturing all `Effect.log` as logs in traces as well.
    * Provide a mechanism to disable it at runtime easily (we have the config flag and can also check an env var for emergency off).

15. **Release Packaging:**

    * Determine how to package for users. Possibly use Bun's single-file bundling or Bun's native binary. Test `bun bunfig.toml` if included to produce an executable.
    * Ensure upgrade mechanism is compatible with how we distribute (maybe prepare a URL pattern for downloading binaries by version).
    * Write or update the `scripts/release.mjs` to automate version bumps, tagging, building binaries, etc.

16. **Deploy and Monitor:**

    * After release, monitor telemetry (if enabled) and user feedback to catch issues.
    * Plan incremental improvements or fixes as needed (since now we have a robust upgrade path, deploying updates is easier).
