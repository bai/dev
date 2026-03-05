import { Context, type Effect } from "effect";

import type { UnknownError } from "./errors";

export interface AutoUpgradeTrigger {
  trigger(): Effect.Effect<void, UnknownError>;
}

export class AutoUpgradeTriggerTag extends Context.Tag("AutoUpgradeTrigger")<AutoUpgradeTriggerTag, AutoUpgradeTrigger>() {}
