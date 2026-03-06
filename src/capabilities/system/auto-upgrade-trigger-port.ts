import { Effect } from "effect";

import type { UnknownError } from "~/core/errors";

export class AutoUpgradeTrigger extends Effect.Tag("AutoUpgradeTrigger")<
  AutoUpgradeTrigger,
  {
    trigger(): Effect.Effect<void, UnknownError>;
  }
>() {}

export type AutoUpgradeTriggerService = (typeof AutoUpgradeTrigger)["Service"];
