import { Effect } from "effect";

export class RuntimeContextTag extends Effect.Tag("RuntimeContext")<
  RuntimeContextTag,
  {
    readonly getArgv: () => readonly string[];
    readonly getCwd: () => string;
  }
>() {}

export type RuntimeContext = (typeof RuntimeContextTag)["Service"];
