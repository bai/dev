import { Effect } from "effect";

export interface RuntimeContext {
  readonly getArgv: () => readonly string[];
  readonly getCwd: () => string;
}

export class RuntimeContextTag extends Effect.Tag("RuntimeContext")<RuntimeContextTag, RuntimeContext>() {}
