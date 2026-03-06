import { Effect } from "effect";

import type { UnknownError } from "~/core/errors";

export class AutoUpgradeTriggerTag extends Effect.Tag("AutoUpgradeTrigger")<
  AutoUpgradeTriggerTag,
  {
    trigger(): Effect.Effect<void, UnknownError>;
  }
>() {}

export type AutoUpgradeTrigger = (typeof AutoUpgradeTriggerTag)["Service"];
