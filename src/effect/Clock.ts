import { Effect, Layer, type Duration } from "effect";

import { ClockService } from "../domain/models";

export interface Clock {
  now(): Effect.Effect<Date>;
  timestamp(): Effect.Effect<number>;
  delay(duration: Duration.Duration): Effect.Effect<void>;
}

// Individual effect functions
const now = (): Effect.Effect<Date> => Effect.sync(() => new Date());

const timestamp = (): Effect.Effect<number> => Effect.sync(() => Date.now());

const delay = (duration: Duration.Duration): Effect.Effect<void> => Effect.delay(Effect.void, duration);

// Plain object implementation
export const ClockLiveImpl: Clock = {
  now,
  timestamp,
  delay,
};

// Effect Layer for dependency injection
export const ClockLiveLayer = Layer.succeed(ClockService, ClockLiveImpl);
