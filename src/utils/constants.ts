import os from "os";
import path from "path";

export const homeDir = os.homedir();
export const baseSearchDir = path.join(homeDir, "src");
export const devDir = path.join(homeDir, ".dev");

export type GitProvider = "github" | "gitlab";

// Read config.json at runtime using Bun API
const configPath = path.join(devDir, "config.json");
const configFile = Bun.file(configPath);
const config = await configFile.json();

export const defaultOrg = config.defaultOrg;
export const orgToProvider: Record<string, GitProvider> = config.orgToProvider as Record<string, GitProvider>;

export const stdioInherit: ["inherit", "inherit", "inherit"] = [
  "inherit",
  "inherit",
  "inherit",
];
export const stdioPipe: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
