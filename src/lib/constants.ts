import os from "os";
import path from "path";

export const homeDir = os.homedir();
export const baseSearchDir = path.join(homeDir, "src");
export const miseConfigDir = path.join(homeDir, ".config", "mise");
export const miseConfigPath = path.join(miseConfigDir, "config.toml");
export const devDir = path.join(homeDir, ".dev");
export const devConfigPath = path.join(devDir, "config.json");

export const stdioInherit: ["inherit", "inherit", "inherit"] = ["inherit", "inherit", "inherit"];
export const stdioPipe: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
