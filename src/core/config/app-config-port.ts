import { Effect } from "effect";

import type { Config } from "~/core/config/config-schema";

export class AppConfig extends Effect.Tag("AppConfig")<AppConfig, Config>() {}
