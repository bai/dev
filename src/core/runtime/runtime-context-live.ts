import { Layer } from "effect";

import { RuntimeContext, type RuntimeContextService } from "~/core/runtime/runtime-context-port";

export const RuntimeContextLive: RuntimeContextService = {
  getArgv: () => [...process.argv],
  getCwd: () => process.cwd(),
};

export const RuntimeContextLiveLayer = Layer.succeed(RuntimeContext, RuntimeContextLive);
