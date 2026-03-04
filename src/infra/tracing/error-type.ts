import { ATTR_ERROR_TYPE, ERROR_TYPE_VALUE_OTHER } from "@opentelemetry/semantic-conventions";
import { Effect } from "effect";

const extractErrorType = (error: unknown): string => {
  if (error && typeof error === "object" && "_tag" in error) {
    const tag = (error as { readonly _tag: unknown })._tag;
    if (typeof tag === "string" && tag.length > 0) {
      return tag;
    }
  }

  if (error instanceof Error && error.name) {
    return error.name;
  }

  return ERROR_TYPE_VALUE_OTHER;
};

export const annotateErrorTypeOnFailure = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  effect.pipe(Effect.tapError((error) => Effect.annotateCurrentSpan(ATTR_ERROR_TYPE, extractErrorType(error))));
