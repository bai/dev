import { Layer } from "effect";

import { RuntimeContextTag, type RuntimeContext } from "~/core/runtime/runtime-context-port";

export const RuntimeContextLive: RuntimeContext = {
  getArgv: () => [...process.argv],
  getCwd: () => process.cwd(),
};

export const RuntimeContextLiveLayer = Layer.succeed(RuntimeContextTag, RuntimeContextLive);
