import os from "os";
import path from "path";

export const homeDir = os.homedir();
export const baseSearchDir = path.join(homeDir, "src");

export type GitProvider = "github" | "gitlab";
export const defaultOrg = "flywheelsoftware";

export const orgToProvider: Record<string, GitProvider> = {
  flywheelsoftware: "gitlab",
};

export const stdioInherit: ["inherit", "inherit", "inherit"] = [
  "inherit",
  "inherit",
  "inherit",
];
export const stdioPipe: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
