import { Context } from "effect";

export interface RuntimeContext {
  readonly getArgv: () => readonly string[];
  readonly getCwd: () => string;
}

export class RuntimeContextTag extends Context.Tag("RuntimeContext")<RuntimeContextTag, RuntimeContext>() {}
