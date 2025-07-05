---
alwaysApply: true
---

Adhere to the following naming conventions for an idiomatic Effect.ts codebase.

# Effect.ts Naming Conventions

### 1. Domain Interfaces

* **Name** as a plain noun reflecting the core capability or role (e.g. `Email`, `Auth`, `Database`).
* **Do not** add a trailing "Service" unless "Service" is literally part of your ubiquitous language (e.g. a wrapped third-party `PaymentService`).
* **File naming**: `domain/[interface-name].ts` (kebab-case)

```ts
// domain/email.ts
export interface Email {
  send(to: string, body: string): Effect<never, EmailError, void>
}
export class EmailTag extends Context.Tag("Email")<Email>() {}

// domain/auth.ts
export interface Auth {
  authenticate(credentials: Credentials): Effect<never, AuthError, User>
}
export class AuthTag extends Context.Tag("Auth")<Auth>() {}
```

---

### 2. Tags

* **Always** suffix with `Tag` (e.g. `EmailTag`, `DatabaseTag`).
* Use class-based tags extending `Context.Tag` for better type inference.
* The string identifier should **exactly** match the interface name.
* **File naming**: Export from the same file as the interface

```ts
// domain/database.ts
export interface Database {
  query<T>(sql: string): Effect<never, DatabaseError, T[]>
}
export class DatabaseTag extends Context.Tag("Database")<Database>() {}

// domain/user-repository.ts
export interface UserRepository {
  findById(id: UserId): Effect<never, NotFoundError, User>
}
export class UserRepositoryTag extends Context.Tag("UserRepository")<UserRepository>() {}
```

---

### 3. Live Implementations

* **Suffix** with `Live` (never `Impl`), e.g. `EmailLive`, `DatabaseLive`.
* Expose via a layer named `<Interface>LiveLayer`.
* **File naming**: `infra/[category]/[interface-name]-live.ts`

```ts
// infra/email/email-live.ts
export class SmtpEmail implements Email {
  // implementation
}
export const EmailLiveLayer = Layer.succeed(EmailTag, new SmtpEmail())

// infra/auth/auth-live.ts
export class JwtAuth implements Auth {
  // implementation
}
export const AuthLiveLayer = Layer.succeed(AuthTag, new JwtAuth())

// infra/db/database-live.ts
export class PostgresDatabase implements Database {
  // implementation
}
export const DatabaseLiveLayer = Layer.succeed(DatabaseTag, new PostgresDatabase())
```

---

### 4. Layers

* **Suffix** with `Layer`, e.g. `ConfigLayer`, `EmailLiveLayer`.
* Bundle related services and configs into a single injectable module.
* Show dependencies explicitly when composing layers.
* **File naming**: Export from implementation files or `wiring.ts` for composed layers
* **Composition order**: Dependencies flow from right to left with `provide`, use `merge` for siblings

```ts
// wiring.ts
export const AppLayer = Layer.mergeAll(
  ConfigLayer,
  DatabaseLiveLayer,
  EmailLiveLayer,
  AuthLiveLayer
)

// config/bootstrap.ts
export const ConfigLayer = Layer.mergeAll(
  Layer.succeed(DbConfigTag, { url: ENV.DB_URL, poolSize: 10 }),
  Layer.succeed(SmtpConfigTag, { host: ENV.SMTP_HOST, port: 587, secure: true })
)

// infra/email/email-live.ts (showing proper dependency order)
export const EmailLiveLayer = Layer.effect(
  EmailTag,
  Effect.gen(function* (_) {
    const config = yield* _(SmtpConfigTag)
    return new SmtpEmail(config)
  })
).pipe(
  Layer.provide(ConfigLayer) // Dependencies flow right-to-left
)
```

---

### 5. Config Objects

* **Define** an interface named `…Config` (e.g. `SmtpConfig`, `DbConfig`).
* **Create** a matching tag: `…ConfigTag`.
* **Optionally** group multiple config tags into a shared `ConfigLayer`.
* **File naming**: `config/[feature]-config.ts` or `config/schema.ts` for schema-based configs

```ts
// config/db-config.ts
export interface DbConfig {
  url: string
  poolSize: number
}
export class DbConfigTag extends Context.Tag("DbConfig")<DbConfig>() {}

// config/smtp-config.ts
export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
}
export class SmtpConfigTag extends Context.Tag("SmtpConfig")<SmtpConfig>() {}

// config/schema.ts (using Schema for validation)
export const AppConfigSchema = Schema.Struct({
  database: Schema.Struct({
    url: Schema.String,
    poolSize: Schema.Number
  }),
  smtp: Schema.Struct({
    host: Schema.String,
    port: Schema.Number
  })
})
export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>
```

---

### 6. Error Types

* **Model** domain errors using Effect's `Data.TaggedError` for better traces and integration.
* **Suffix** with `Error` (e.g. `EmailError`, `DbError`).
* **Use** discriminated unions for related error variants.
* **File naming**: `domain/errors.ts` for grouped errors or export from domain interface file

```ts
// domain/errors.ts
import { Data } from "effect"

// Simple tagged errors with payload
export class EmailError extends Data.TaggedError("EmailError")<{
  reason: string
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  url: string
  statusCode?: number
}> {}

// Error unions with variants
export class ConnectionError extends Data.TaggedError("ConnectionError")<{
  host: string
  port: number
}> {}

export class QueryError extends Data.TaggedError("QueryError")<{
  query: string
  message: string
}> {}

export class TransactionError extends Data.TaggedError("TransactionError")<{
  transactionId: string
}> {}

export type DbError = ConnectionError | QueryError | TransactionError

// For simple cases without payload
export class NotFoundError extends Data.TaggedClass("NotFoundError")() {}
export class UnauthorizedError extends Data.TaggedClass("UnauthorizedError")() {}
```

---

### 7. Qualifiers

* For multiple implementations of the same interface, use distinct tags named for their role.
* **Keep** the class name and string identifier consistent.
* **File naming**: Export from the relevant implementation files

```ts
// infra/db/primary-db-live.ts
export class PrimaryDbTag extends Context.Tag("PrimaryDb")<Database>() {}
export const PrimaryDbLiveLayer = Layer.succeed(
  PrimaryDbTag,
  new PostgresDatabase(primaryConfig)
)

// infra/db/replica-db-live.ts
export class ReplicaDbTag extends Context.Tag("ReplicaDb")<Database>() {}
export const ReplicaDbLiveLayer = Layer.succeed(
  ReplicaDbTag,
  new PostgresDatabase(replicaConfig)
)

// infra/cache/redis-cache-live.ts
export class RedisCacheTag extends Context.Tag("RedisCache")<Cache>() {}

// infra/cache/memory-cache-live.ts
export class MemoryCacheTag extends Context.Tag("MemoryCache")<Cache>() {}
```

---

### 8. Test/Mock Layers

* **Suffix** with `MockLayer` or `TestLayer` (to mirror `LiveLayer` naming).
* Provide in-memory or mock implementations for testing.
* **File naming**: `test/mocks/[interface-name]-mock.ts`

```ts
// test/mocks/user-repository-mock.ts
export class InMemoryUserRepository implements UserRepository {
  private users = new Map<UserId, User>()

  findById(id: UserId) {
    const user = this.users.get(id)
    return user ? Effect.succeed(user) : Effect.fail(new NotFoundError())
  }
}
export const UserRepositoryMockLayer = Layer.succeed(
  UserRepositoryTag,
  new InMemoryUserRepository()
)

// test/mocks/email-mock.ts
export const EmailMockLayer = Layer.succeed(EmailTag, {
  send: () => Effect.succeed(undefined)
})

// test/mocks/database-mock.ts
export const DatabaseTestLayer = Layer.succeed(DatabaseTag, {
  query: () => Effect.succeed([]),
  executeTransaction: () => Effect.succeed(undefined)
})
```

---

### 9. Streams, Queues, Hubs

* **Suffix** with the resource type (`…Stream`, `…Queue`, `…Hub`).
* **Combine** with tags: `…StreamTag`, etc.
* **File naming**: Export from relevant service files

```ts
// domain/services/event-service.ts
export class LogEventStreamTag extends Context.Tag("LogEventStream")<Stream<LogEvent>>() {}

// domain/services/task-service.ts
export class TaskQueueTag extends Context.Tag("TaskQueue")<Queue<Task>>() {}

// domain/services/notification-service.ts
export class NotificationHubTag extends Context.Tag("NotificationHub")<Hub<Notification>>() {}

// app/services/command-tracking-service.ts
export class CommandStreamTag extends Context.Tag("CommandStream")<Stream<Command>>() {}
```

---

### 10. Schemas and Validation

* **Name** schemas after the type they validate, suffixed with `Schema`.
* **Derive** types from schemas using `Schema.Type`.
* **File naming**: `config/schema.ts` for config schemas, or `domain/models.ts` for domain schemas

```ts
// domain/models.ts
export const UserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date
})
export type User = Schema.Schema.Type<typeof UserSchema>

export const RepositorySchema = Schema.Struct({
  name: Schema.String,
  owner: Schema.String,
  isPrivate: Schema.Boolean
})
export type Repository = Schema.Schema.Type<typeof RepositorySchema>

// config/schema.ts
export const ConfigSchema = Schema.Struct({
  port: Schema.Number,
  environment: Schema.Literal("development", "production"),
  features: Schema.Record(Schema.String, Schema.Boolean)
})
```

---

### 11. Branded Types

* **Use** branded types for domain modeling to ensure type safety.
* **Export** both the type and its constructor/validator.
* **Avoid** name collisions with interfaces (e.g. use `EmailAddress` for branded string, not `Email`).
* **File naming**: `domain/types/[type-name].ts` or `domain/models.ts` for grouped types

```ts
// domain/types/user-id.ts
export type UserId = string & Brand.Brand<"UserId">
export const UserId = Brand.nominal<UserId>()

// domain/types/email-address.ts (avoiding collision with Email interface)
export type EmailAddress = string & Brand.Brand<"EmailAddress">
export const EmailAddress = Brand.refined<EmailAddress>(
  (s) => s.includes("@"),
  (s) => Brand.error(`Invalid email: ${s}`)
)

// domain/models.ts (grouping related branded types)
export type RepositoryId = string & Brand.Brand<"RepositoryId">
export const RepositoryId = Brand.nominal<RepositoryId>()

export type CommitHash = string & Brand.Brand<"CommitHash">
export const CommitHash = Brand.refined<CommitHash>(
  (s) => /^[a-f0-9]{40}$/i.test(s),
  (s) => Brand.error(`Invalid commit hash: ${s}`)
)
```

---

### 12. Ports (Hexagonal Architecture)

* **Suffix** port interfaces with `Port` to distinguish from domain interfaces.
* **Place** in `domain/ports/` directory to separate from core domain.
* **Use** the same Tag naming convention with the full interface name.
* **File naming**: `domain/ports/[port-name].ts` (kebab-case)

```ts
// domain/ports/database-port.ts
export interface DatabasePort {
  query<T>(sql: string): Effect<never, DatabaseError, T[]>
  transaction<R, E, A>(effect: Effect<R, E, A>): Effect<R, E | DatabaseError, A>
}
export class DatabasePortTag extends Context.Tag("DatabasePort")<DatabasePort>() {}

// domain/ports/file-system-port.ts
export interface FileSystemPort {
  readFile(path: string): Effect<never, FileSystemError, string>
  writeFile(path: string, content: string): Effect<never, FileSystemError, void>
}
export class FileSystemPortTag extends Context.Tag("FileSystemPort")<FileSystemPort>() {}

// domain/ports/git-port.ts
export interface GitPort {
  clone(url: string, path: string): Effect<never, GitError, void>
  checkout(branch: string): Effect<never, GitError, void>
}
export class GitPortTag extends Context.Tag("GitPort")<GitPort>() {}

// domain/ports/keychain-port.ts
export interface KeychainPort {
  get(key: string): Effect<never, KeychainError, string | null>
  set(key: string, value: string): Effect<never, KeychainError, void>
}
export class KeychainPortTag extends Context.Tag("KeychainPort")<KeychainPort>() {}
```

---

### 13. Adapters (Hexagonal Architecture)

* **Place** adapter implementations in `infra/` directory, organized by infrastructure type.
* **Name** adapters descriptively based on the technology they use.
* **Follow** the `Live` suffix pattern for layer exports.
* **File naming**: `infra/[category]/[technology]-[adapter-name]-live.ts` for clarity

```ts
// infra/db/postgres-database-live.ts
export class PostgresDatabase implements DatabasePort {
  // implementation
}
export const DatabasePortLiveLayer = Layer.effect(
  DatabasePortTag,
  Effect.gen(function* (_) {
    const config = yield* _(DbConfigTag)
    return new PostgresDatabase(config)
  })
)

// infra/fs/node-filesystem-live.ts
export class NodeFileSystem implements FileSystemPort {
  // implementation
}
export const FileSystemPortLiveLayer = Layer.succeed(
  FileSystemPortTag,
  new NodeFileSystem()
)

// infra/git/simple-git-live.ts
export class SimpleGit implements GitPort {
  // implementation
}
export const GitPortLiveLayer = Layer.succeed(GitPortTag, new SimpleGit())

// infra/keychain/macos-keychain-live.ts
export class MacOSKeychain implements KeychainPort {
  // implementation
}
export const KeychainPortLiveLayer = Layer.succeed(
  KeychainPortTag,
  new MacOSKeychain()
)
```

---

#### Additional Tips

* **Method Names**: Use lower-camelCase (`sendEmail`, `fetchUser`, `executeQuery`, etc.).

* **Avoid** `I`-prefix on interfaces; plain nouns are preferred.

* **File organization**: Keep related exports together (interface + tag in same file, implementation + layer in same file).

* **Composed App Layer**: Re-export a "stack" when many small layers always wire together:

  ```ts
  export const AppLayer = Layer.mergeAll(
    ConfigLayer,
    DatabaseLiveLayer,
    FileSystemLiveLayer,
    LoggerLiveLayer
  )
  ```

* **Port vs Domain Interface**: Use ports for infrastructure boundaries (database, external APIs, file system). Keep domain interfaces for core business logic that might be implemented within the domain itself.

* **Error handling**: Prefer `Data.TaggedError` for errors with payload or `Data.TaggedClass` for simple errors without payload.
