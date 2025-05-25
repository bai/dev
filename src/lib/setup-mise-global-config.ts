import path from "path";

import { stringify } from "@iarna/toml";

import { devDir, miseConfigPath } from "~/lib/constants";
import { devConfig } from "~/lib/dev-config";
import { miseConfigSchema } from "~/lib/types";

export async function setupMiseGlobalConfig() {
  try {
    // Load baseline global mise TOML config
    const miseGlobalConfig = await Bun.file(path.join(devDir, "hack", "configs", "mise-config-global.toml")).text();
    const parsedMiseGlobalConfig = miseConfigSchema.safeParse(Bun.TOML.parse(miseGlobalConfig));

    if (!parsedMiseGlobalConfig.success) {
      throw new Error("Failed to parse mise config");
    }

    // Amend the TOML config with trusted_config_paths from dev JSON config
    if (devConfig.mise && devConfig.mise.trusted_config_paths) {
      parsedMiseGlobalConfig.data.settings.trusted_config_paths = devConfig.mise.trusted_config_paths;
    }

    // Serialize the final config as TOML and write to file
    const tomlText = stringify(parsedMiseGlobalConfig.data);
    await Bun.write(miseConfigPath, tomlText + "\n");
  } catch (err) {
    console.error(err);
  }
}
