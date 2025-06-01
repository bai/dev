import os from "os";
import path from "path";

export const homeDir = os.homedir();

export const baseSearchDir = path.join(homeDir, "src");

export const devDir = path.join(homeDir, ".dev");

export const devConfigDir = path.join(homeDir, ".config", "dev");
export const devConfigPath = path.join(devConfigDir, "config.json");

export const devDataDir = path.join(homeDir, ".local", "share", "dev");
export const devDbPath = path.join(devDataDir, "db.sqlite");
