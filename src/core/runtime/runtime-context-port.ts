import { Effect } from "effect";

export class RuntimeContext extends Effect.Tag("RuntimeContext")<
  RuntimeContext,
  {
    readonly getArgv: () => readonly string[];
    readonly getCwd: () => string;
  }
>() {}

export type RuntimeContextService = (typeof RuntimeContext)["Service"];
