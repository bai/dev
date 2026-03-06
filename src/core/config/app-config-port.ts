import { Effect } from "effect";

import type { Config } from "~/core/config/config-schema";

export class AppConfigTag extends Effect.Tag("AppConfig")<AppConfigTag, Config>() {}
