# Port Naming Violations Report

According to the Effect-TS naming conventions in `.cursor/rules/600-effect-ts-naming-conventions.mdc`, port interfaces should follow these rules:

- **Interfaces**: Named as plain nouns WITHOUT "Port" suffix (e.g., `Email`, `Auth`, `Database`)
- **Tags**: Named as `InterfaceNameTag` (e.g., `EmailTag`, `DatabaseTag`)
- **Live Layers**: Named as `InterfaceNameLiveLayer` (e.g., `EmailLiveLayer`, `DatabaseLiveLayer`)

## Current Violations

All port files in the codebase are currently violating the naming convention:

### 1. FileSystem
- **Current (INCORRECT)**:
  - Interface: `FileSystemPort`
  - Tag: `FileSystemPortTag`
  - Layer: `FileSystemPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `FileSystem`
  - Tag: `FileSystemTag`
  - Layer: `FileSystemLiveLayer`

### 2. Database
- **Current (INCORRECT)**:
  - Interface: `DatabasePort`
  - Tag: `DatabasePortTag`
  - Layer: `DatabasePortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Database`
  - Tag: `DatabaseTag`
  - Layer: `DatabaseLiveLayer`

### 3. Git
- **Current (INCORRECT)**:
  - Interface: `GitPort`
  - Tag: `GitPortTag`
  - Layer: `GitPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Git`
  - Tag: `GitTag`
  - Layer: `GitLiveLayer`

### 4. Shell
- **Current (INCORRECT)**:
  - Interface: `ShellPort`
  - Tag: `ShellPortTag`
  - Layer: `ShellPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Shell`
  - Tag: `ShellTag`
  - Layer: `ShellLiveLayer`

### 5. Directory
- **Current (INCORRECT)**:
  - Interface: `DirectoryPort`
  - Tag: `DirectoryPortTag`
  - Layer: `DirectoryPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Directory`
  - Tag: `DirectoryTag`
  - Layer: `DirectoryLiveLayer`

### 6. HealthCheck
- **Current (INCORRECT)**:
  - Interface: `HealthCheckPort`
  - Tag: `HealthCheckPortTag`
  - Layer: `HealthCheckPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `HealthCheck`
  - Tag: `HealthCheckTag`
  - Layer: `HealthCheckLiveLayer`

### 7. InteractiveSelector
- **Current (INCORRECT)**:
  - Interface: `InteractiveSelectorPort`
  - Tag: `InteractiveSelectorPortTag`
  - Layer: `InteractiveSelectorPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `InteractiveSelector`
  - Tag: `InteractiveSelectorTag`
  - Layer: `InteractiveSelectorLiveLayer`

### 8. Keychain
- **Current (INCORRECT)**:
  - Interface: `KeychainPort`
  - Tag: `KeychainPortTag`
  - Layer: `KeychainPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Keychain`
  - Tag: `KeychainTag`
  - Layer: `KeychainLiveLayer`

### 9. Mise
- **Current (INCORRECT)**:
  - Interface: `MisePort`
  - Tag: `MisePortTag`
  - Layer: `MisePortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Mise`
  - Tag: `MiseTag`
  - Layer: `MiseLiveLayer`

### 10. Network
- **Current (INCORRECT)**:
  - Interface: `NetworkPort`
  - Tag: `NetworkPortTag`
  - Layer: `NetworkPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `Network`
  - Tag: `NetworkTag`
  - Layer: `NetworkLiveLayer`

### 11. RepoProvider
- **Current (INCORRECT)**:
  - Interface: `RepoProviderPort`
  - Tag: `RepoProviderPortTag`
  - Layer: `RepoProviderPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `RepoProvider`
  - Tag: `RepoProviderTag`
  - Layer: `RepoProviderLiveLayer`

### 12. RunStore
- **Current (INCORRECT)**:
  - Interface: `RunStorePort`
  - Tag: `RunStorePortTag`
  - Layer: `RunStorePortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `RunStore`
  - Tag: `RunStoreTag`
  - Layer: `RunStoreLiveLayer`

### 13. ToolHealthRegistry
- **Current (INCORRECT)**:
  - Interface: `ToolHealthRegistryPort`
  - Tag: `ToolHealthRegistryPortTag`
  - Layer: `ToolHealthRegistryPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `ToolHealthRegistry`
  - Tag: `ToolHealthRegistryTag`
  - Layer: `ToolHealthRegistryLiveLayer`

### 14. ToolManagement
- **Current (INCORRECT)**:
  - Interface: `ToolManagementPort`
  - Tag: `ToolManagementPortTag`
  - Layer: `ToolManagementPortLiveLayer`
- **Should be (CORRECT)**:
  - Interface: `ToolManagement`
  - Tag: `ToolManagementTag`
  - Layer: `ToolManagementLiveLayer`

## Summary

**ALL 14 port interfaces** in the codebase are currently violating the naming convention by:
1. Adding "Port" suffix to interface names
2. Including "Port" in the tag names
3. Including "Port" in the live layer names

The convention clearly states (from rule #12 in the naming conventions):
- "**Suffix** port interfaces with `Port` to distinguish from domain interfaces" - This appears to be outdated guidance
- The examples in rule #1 show interfaces WITHOUT "Port" suffix as the correct approach

Looking at the primary examples in the naming conventions document, the correct pattern is:
- `Email` interface, `EmailTag`, `EmailLiveLayer`
- `Database` interface, `DatabaseTag`, `DatabaseLiveLayer`
- `Auth` interface, `AuthTag`, `AuthLiveLayer`

The "Port" suffix should be removed from all interfaces, tags, and layers to follow the idiomatic Effect-TS naming conventions.