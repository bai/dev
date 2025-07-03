import { Duration, Effect, Layer } from "effect";

import { ClockService } from "../domain/models";

export interface Clock {
  now(): Effect.Effect<Date>;
  timestamp(): Effect.Effect<number>;
  delay(duration: Duration.Duration): Effect.Effect<void>;
}

export class ClockLive implements Clock {
  now(): Effect.Effect<Date> {
    return Effect.sync(() => new Date());
  }

  timestamp(): Effect.Effect<number> {
    return Effect.sync(() => Date.now());
  }

  delay(duration: Duration.Duration): Effect.Effect<void> {
    return Effect.delay(Effect.void, duration);
  }
}

// Effect Layer for dependency injection
export const ClockLiveLayer = Layer.succeed(ClockService, new ClockLive());
