import { Context, type Effect } from "effect";

import type { UnknownError } from "../errors";

/**
 * Domain port for interactive selection functionality
 * This abstracts the specific implementation (fzf, inquirer, etc.)
 */
export interface InteractiveSelector {
  /**
   * Present a list of choices to the user for interactive selection
   * Returns the selected choice, or null if the user cancels
   */
  selectFromList(choices: string[]): Effect.Effect<string | null, UnknownError>;
}

// Service tag for Effect Context system
export class InteractiveSelectorService extends Context.Tag("InteractiveSelectorService")<
  InteractiveSelectorService,
  InteractiveSelector
>() {}
