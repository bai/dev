# **`dev` CLI – Engineering Implementation Specification**

**Version 1.1 – 2 July 2025**

---

## 0 · Change Log

| Version | Date       | Summary                                                                                                                                                                                                              |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.0** | 1 Jul 2025 | Initial spec                                                                                                                                                                                                         |
| **1.1** | 2 Jul 2025 | • Replace ESLint + Prettier → **Biome 2.0**  • Vitest 3.2.4 • Local SQLite tracking via drizzle-orm • `configUrl` auto-refresh on `dev upgrade` • Git-based plugin loader • Clarified adapter swap (build-time only) |

---

## 1 · Purpose

`dev` is a single-binary macOS CLI that streamlines navigation, repo cloning, environment setup and diagnostics while remaining **hexagonal**, **test-friendly** and **plugin-extensible**.

---

## 2 · Technology Stack

| Concern            | Choice                           | Locked Version  |
| ------------------ | -------------------------------- | --------------- |
| Runtime / Compiler | **Bun**                          | 1.2.17          |
| Language           | **TypeScript**                   | 5.8.3           |
| FP Runtime         | **Effect**                       | 3.16.11         |
| Lint + Format      | **Biome**                        | 2.0 “ultracite” |
| Test Runner        | **Vitest**                       | 3.2.4           |
| Relational Store   | **SQLite 3** via **drizzle-orm** | latest          |
| Git CLI            | `git` ≥ 2.40                     | —               |

---

## 3 · Architectural Overview

```
bin/dev  →  CLI Adapter (Commander)  →  CliLive Layer
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
* **CLI adapter** is isolated behind `CliAdapter` interface (swap requires rebuild, not runtime switch).

---

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
│  │  ├─ adapter/
│  │  │  ├─ commander.ts
│  │  │  └─ types.ts      # interface CliAdapter
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

---

## 5 · Layers

| Layer         | Services Included                                                      |
| ------------- | ---------------------------------------------------------------------- |
| **InfraLive** | FileSystem, RepoProvider, Mise, Shell, Keychain, Network, **RunStore** |
| **AppLive**   | Config, Logger, Clock **+ InfraLive**                                  |
| **CliLive**   | Console, Telemetry *(optional)* **+ AppLive**                          |

Tests compose only needed layers (e.g. swap `FileSystemLive` with in-memory fake).

---

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

---

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
* Respect `DEV_CLI_STORE=0` → supply no-op implementation.

*Local store is independent of telemetry; it never leaves the machine.*

---

## 8 · Config File (Schema v 3)

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

---

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

---

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

---

## 11 · Shell Completions

* `scripts/generate-completions.ts` dumps Zsh/Bash/Fish to `/completions`.
* Installer copies to user shell paths or falls back to `eval "$(dev completion zsh)"`.
* `--regenerate-completions` flag on `dev upgrade`.

---

## 12 · `dev upgrade` Sequence

1. Download latest binary.
2. Fetch remote **configUrl**, migrate & overwrite local.
3. For each Git plugin URL → fetch or clone.
4. Generate completions if `--regenerate-completions`.
5. Report final version.

---

## 13 · Tooling

### 13.1 Biome

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/biome.json",
  "formatter": { "enabled": true },
  "linter": { "recommended": true },
  "organizeImports": true
}
```

* Scripts:

  * `bun lint`  → `biome ci .`
  * `bun format` → `biome format . --write`

### 13.2 Vitest

* Config (`vitest.config.ts`) – default ESM, threads = 4.
* Version pinned to 3.2.4.

---

## 14 · CI (GitHub Actions)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v1
    with: { bun-version: '1.2.17' }
  - run: bun install --frozen-lockfile
  - run: bun lint            # Biome
  - run: bun test            # Vitest
  - run: bun run build:release
```

---

## 15 · Acceptance Checklist

1. **`dev doctor`** passes on fresh macOS.
2. Executing any command appends row to `~/.dev/state/dev.db`.
3. `dev upgrade` pulls new binary + updates config + refreshes plugins.
4. Plugins from Git URLs appear in `dev help` after upgrade.
5. `biome ci .` has no errors; `vitest` reports 0 failures.
6. Exit codes follow `DevError → exitCode()` table.

---

### ✅ Ready for engineering implementation   🚀
