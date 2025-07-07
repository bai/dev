# Import Path Migration Summary

This document summarizes all the import path changes made to reflect the new flat directory structure.

## Changes Made

### 1. Domain Imports
- `domain/ports/*` → `domain/*-port`
- `domain/services/*` → `domain/*-service`
- `domain/types/drizzle` → `domain/drizzle-types`

### 2. App Imports
- `app/commands/*` → `app/*-command`
- `app/services/*` → `app/*-service`

### 3. Infrastructure Imports
- `infra/db/*` → `infra/*-live`
- `infra/fs/*` → `infra/*-live`
- `infra/git/*` → `infra/*-live`
- `infra/health/*` → `infra/*-live`
  - Special case: `tool-health-registry.ts` → `tool-health-registry-live.ts`
- `infra/keychain/*` → `infra/*-live`
- `infra/mise/*` → `infra/*-live`
- `infra/network/*` → `infra/*-live`
- `infra/providers/*` → `infra/*-live`
  - Special case: `github-provider` → `github-provider-live`
- `infra/selector/*` → `infra/*-live`
- `infra/shell/*` → `infra/*-live`
- `infra/tools/*` → `infra/*-tools-live`
  - Exception: `tool-management-live.ts` stays as `tool-management-live.ts`

### 4. Config Imports
- `config/migrations/index` → `config/migrations`

## Relative Import Adjustments

### Within Domain Directory
- Imports between domain files use `./` prefix (same directory)
- Example: `from "../errors"` → `from "./errors"`

### From App to Domain
- Use `../domain/` prefix
- Example: `from "../../domain/errors"` → `from "../domain/errors"`

### From Infra to Domain
- Use `../domain/` prefix
- Example: `from "../../domain/errors"` → `from "../domain/errors"`

### From Config to Domain/App
- Domain imports use `../domain/` prefix
- App imports use `../app/` prefix

### Dynamic Imports
- Fixed drizzle schema imports: `../../../drizzle/schema` → `../../drizzle/schema`

## Verification

After all changes, the TypeScript compiler runs without any import errors:
- 0 import errors (TS2307)
- All paths correctly resolved
- Type checking passes successfully