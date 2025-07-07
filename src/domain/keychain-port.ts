import { Context, type Effect } from "effect";

import type { AuthError, ShellExecutionError } from "./errors";

export interface KeychainPort {
  /**
   * Store a credential in the keychain
   */
  setCredential(
    service: string,
    account: string,
    password: string,
  ): Effect.Effect<void, AuthError | ShellExecutionError>;

  /**
   * Retrieve a credential from the keychain
   */
  getCredential(service: string, account: string): Effect.Effect<string, AuthError | ShellExecutionError>;

  /**
   * Remove a credential from the keychain
   */
  removeCredential(service: string, account: string): Effect.Effect<void, AuthError | ShellExecutionError>;

  /**
   * Check if a credential exists in the keychain
   */
  hasCredential(service: string, account: string): Effect.Effect<boolean>;
}

export class KeychainPortTag extends Context.Tag("KeychainPort")<KeychainPortTag, KeychainPort>() {}
