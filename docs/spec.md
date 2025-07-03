# `dev` CLI – Engineering Implementation Specification

## 1 · Purpose

`dev` is a CLI that streamlines navigation, repo cloning, environment setup and diagnostics while remaining **hexagonal**, **test-friendly** and **plugin-extensible**.

## 2 · Technology Stack

| Concern            | Choice                           | Locked Version  |
| ------------------ | -------------------------------- | --------------- |
| Runtime / Compiler | **Bun**                          | 1.2.17          |
| Language           | **TypeScript**                   | 5.8.3           |
| FP Runtime         | **Effect**                       | 3.16.11         |
| Test Runner        | **Vitest**                       | 3.2.4           |
| Relational Store   | **SQLite 3** via **drizzle-orm** | latest          |
| Git CLI            | `git` ≥ 2.40                     | —               |

## 3 · Architectural Overview

```
bin/dev  →  CLI Front-end (Yargs)    →  CliLive Layer
                         │
                         ▼
                App Commands (pure Effects)  →  AppLive Layer
                         │
                         ▼
                 Domain Ports (abstract)
                         │
                         ▼
         Infra Adapters (FS, Git, Mise, DB, etc.)  →  InfraLive Layer
```

* **Hexagonal / Ports & Adapters** – domain code imports only ports.
* **Effect Layers** – DI, resource scoping, cancellation.
* **CLI layer** uses Yargs for argument parsing and is not pluggable.

## 4 · Repository Layout

```
dev/
├─ bunfig.toml
├─ package.json
├─ tsconfig.json
├─ bin/
│  └─ dev                 # tiny shebang → dist/cli.js
├─ src/
│  ├─ index.ts            # bootstraps CLI
│  ├─ cli/
│  │  ├─ parser/
│  │  │  ├─ yargs.ts      # argument parsing
│  │  │  └─ types.ts      # internal typings
│  │  ├─ completions/
│  │  └─ wiring.ts        # CliLive
│  ├─ app/
│  │  ├─ commands/        # cd, clone, up, doctor, …
│  │  └─ wiring.ts        # AppLive
│  ├─ domain/
│  │  ├─ ports/
│  │  │  ├─ FileSystem.ts  …  RunStore.ts
│  │  ├─ models.ts
│  │  └─ errors.ts        # DevError + exit codes
│  ├─ infra/
│  │  ├─ fs/
│  │  ├─ git/
│  │  ├─ mise/
│  │  ├─ providers/
│  │  ├─ shell/
│  │  └─ db/
│  │      ├─ schema.ts
│  │      ├─ RunStoreLive.ts
│  │      └─ migrations/
│  ├─ config/
│  │  ├─ schema.ts
│  │  ├─ loader.ts
│  │  └─ migrations/      # 1_to_2.ts, 2_to_3.ts …
│  ├─ effect/             # LoggerLive, etc.
│  └─ plugins/            # runtime-discovered
├─ completions/
├─ scripts/
│  ├─ generate-completions.ts
│  └─ release.mjs
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
└─ .github/workflows/ci.yml
```

## 5 · Layers

| Layer         | Services Included                                                      |
| ------------- | ---------------------------------------------------------------------- |
| **InfraLive** | FileSystem, RepoProvider, Mise, Shell, Keychain, Network, **RunStore** |
| **AppLive**   | Config, Logger, Clock **+ InfraLive**                                  |
| **CliLive**   | Console, Telemetry *(optional)* **+ AppLive**                          |

Tests compose only needed layers (e.g. swap `FileSystemLive` with in-memory fake).

## 6 · Domain Error Model

```ts
export type DevError =
  | { _tag: "ConfigError";   reason: string }
  | { _tag: "GitError";      reason: string }
  | { _tag: "NetworkError";  reason: string }
  | { _tag: "AuthError";     reason: string }
  | { _tag: "UnknownError";  reason: unknown };

export const exitCode = (e: DevError): number => ({
  ConfigError: 2,
  GitError:    3,
  NetworkError:4,
  AuthError:   5,
  UnknownError:1,
}[e._tag]);
```

All command handlers must raise one of these variants.

## 7 · Local Run Analytics

### 7.1 Drizzle Schema

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

### 7.2 Port & Adapter

* **Port** `RunStore` with `record` & `prune`.
* **Adapter** `RunStoreLive` stores rows in `~/.dev/state/dev.db` (WAL mode).
* Insert row *before* executing handler (`started_at`), finalise on exit (`finished_at`, `exit_code`).

*Local store is independent of telemetry; it never leaves the machine.*

## 8 · Config File (Schema v3)

```jsonc
{
  "version": 3,
  "configUrl": "https://raw.githubusercontent.com/acme/dev-configs/main/org.json",
  "defaultOrg": "acme",
  "paths": { "base": "~/src" },
  "telemetry": { "enabled": true },
  "plugins": {
    "git": [
      "https://github.com/acme/dev-plugin-docker.git",
      "ssh://git@example.com/custom/dev-plugin-foo.git"
    ]
  }
}
```

* Loader steps: read → migrate chain → validate.
* `configUrl` is stored; **`dev upgrade`** re-fetches, migrates and overwrites if content changed.

## 9 · Plugins

### 9.1 AppModule Contract

```ts
export interface AppModule {
  commands: CliCommandSpec[];                  // new commands
  layers?:  Layer.Layer<any, never, any>;      // extra services
  hooks?:   { onStart?: Effect.Effect<any, never, void> };
}
```

### 9.2 Discovery

1. Local folder `~/.dev/plugins/**`.
2. `node_modules/@*/dev-plugin-*`.
3. **Git URLs** from `config.plugins.git`:

   * Clone/fetch into `$XDG_CACHE_HOME/dev/plugins/<hash>`.
   * Checked on every `dev upgrade`.
4. Load plugin via dynamic `import()`; verify it exports `default` as `AppModule`.

## 10 · Commands

| Command             | Synopsis                                 | Primary Ports                 |
| ------------------- | ---------------------------------------- | ----------------------------- |
| **cd**              | `dev cd [name]`                          | FileSystem, Shell             |
| **clone**           | `dev clone <repo>`                       | RepoProvider, Git             |
| **up**              | `dev up`                                 | Mise                          |
| **auth**            | `dev auth [svc]`                         | Keychain, Network             |
| **status / doctor** | `dev doctor`                             | Many                          |
| **run**             | `dev run <task>`                         | Mise                          |
| **upgrade**         | `dev upgrade [--regenerate-completions]` | Network, Config, PluginLoader |
| **help**            | `dev help`                               | –                             |

`doctor` returns JSON on `--json`, exits `3` if any error item.

## 11 · Shell Completions

* `scripts/generate-completions.ts` dumps Zsh/Bash/Fish to `/completions`.
* Installer copies to user shell paths or falls back to `eval "$(dev completion zsh)"`.
* `--regenerate-completions` flag on `dev upgrade`.

## 12 · `dev upgrade` Sequence

1. Download latest binary.
2. Fetch remote **configUrl**, migrate & overwrite local.
3. For each Git plugin URL → fetch or clone.
4. Generate completions if `--regenerate-completions`.
5. Report final version.

In a hexagonal, layered CLI like yours, you actually want **both**:

1. **Co-located unit tests** right next to the code they’re testing, so it’s dead easy to see “implementation ↔ tests” at a glance.
2. **Higher-level integration or end-to-end suites** in your existing top-level `tests/` folder.

## Testing

### 1. Co-located unit tests (pure Effect modules)

Under `src/…`, wherever you have a small module—say `src/app/commands/clone.ts`—drop a `clone.test.ts` immediately beside it:

```
src/
└─ app/
   └─ commands/
      ├ clone.ts
      └ clone.test.ts      ← fast, pure-Effect tests using in-memory fakes
```

These tests should spin up just the layers they need (e.g. swapping out `FileSystemLive` for a fake) and verify your `Effect`-returning functions in isolation.

### 2. Top-level integration & e2e

Reserve your existing:

```
tests/
├─ unit/         ← optional, for any legacy bulk unit tests
├─ integration/  ← tests that wire up several layers together (e.g. AppLive + InfraLive fakes)
└─ e2e/          ← driving the real binary via `bin/dev`
```

for anything that:

* **Integration** tests multiple ports/adapters together (e.g. talking to a real SQLite on disk),
* or **E2E** spins up the CLI binary, invokes commands in a temp dir, and inspects the file system, exit codes, migrations, etc.

### Why this split?

* **Co-located tests** keep you honest on small units, make refactoring safe, and give you instant feedback on the precise module you’re working on.
* **`tests/integration` & `tests/e2e`** give you confidence that all of your layers wire up correctly in broader scenarios, without cluttering your `src/` tree with heavyweight test harness code.

That way you get **both** your fast, co-located unit tests and your slower integration/E2E suites under one runner.
