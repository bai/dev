import { Context, type Effect } from "effect";

import type { AuthError, UnknownError } from "../errors";

export interface Keychain {
  /**
   * Store a credential in the keychain
   */
  setCredential(service: string, account: string, password: string): Effect.Effect<void, AuthError | UnknownError>;

  /**
   * Retrieve a credential from the keychain
   */
  getCredential(service: string, account: string): Effect.Effect<string, AuthError | UnknownError>;

  /**
   * Remove a credential from the keychain
   */
  removeCredential(service: string, account: string): Effect.Effect<void, AuthError | UnknownError>;

  /**
   * Check if a credential exists in the keychain
   */
  hasCredential(service: string, account: string): Effect.Effect<boolean>;
}

// Service tag for Effect Context system
export class KeychainTag extends Context.Tag("Keychain")<KeychainTag, Keychain>() {}
