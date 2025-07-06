import { Context, Effect } from "effect";

import type { HealthCheckError } from "../errors";
import type { BuiltInHealthCheck, Config } from "../models";

export interface HealthCheckConfig {
  readonly toolName: string;
  readonly command: string;
  readonly versionPattern?: string;
  readonly timeout?: number;
  readonly parseOutput?: (stdout: string, stderr: string) => {
    readonly version?: string;
    readonly status?: "ok" | "warn" | "fail";
    readonly notes?: string;
  };
  readonly isCustom: boolean;
}

export interface HealthCheckService {
  /**
   * Get all health check configurations (built-in + custom)
   */
  getHealthCheckConfigs(config?: Config): Effect.Effect<readonly HealthCheckConfig[], HealthCheckError>;

  /**
   * Get default built-in health check configurations
   */
  getDefaultHealthCheckConfigs(): Effect.Effect<readonly HealthCheckConfig[], never>;
}

export class HealthCheckServiceTag extends Context.Tag("HealthCheckService")<HealthCheckServiceTag, HealthCheckService>() {}

// Default built-in health check configurations
const DEFAULT_HEALTH_CHECKS: Record<string, BuiltInHealthCheck> = {
  bun: {
    command: "bun --version",
  },
  git: {
    command: "git --version",
    versionPattern: "git version (.+)",
  },
  mise: {
    command: "mise --version",
  },
  fzf: {
    command: "fzf --version",
  },
  gcloud: {
    command: "gcloud --version",
    versionPattern: "Google Cloud SDK (.+)",
  },
  network: {
    command: "ping -c1 8.8.8.8",
    parseOutput: (stdout: string, stderr: string) => {
      const rttMatch = stdout.match(/time=([0-9.]+)\s*ms/);
      const rtt = rttMatch?.[1] ? parseFloat(rttMatch[1]) : null;

      if (rtt !== null) {
        return {
          version: `${rtt}ms RTT`,
          status: rtt > 100 ? "warn" : "ok",
          notes: rtt > 100 ? "High network latency" : undefined,
        };
      }
      
      return {
        status: "warn",
        notes: "Unable to parse ping response",
      };
    },
  },
} as const;

export const makeHealthCheckService = (): HealthCheckService => ({
  getHealthCheckConfigs: (config?: Config): Effect.Effect<readonly HealthCheckConfig[], HealthCheckError> =>
    Effect.gen(function* () {
      const defaultConfigs = yield* makeHealthCheckService().getDefaultHealthCheckConfigs();
      
      if (!config) {
        return defaultConfigs;
      }

      // Override built-in checks with config if provided
      const builtInOverrides = config.builtInHealthChecks || {};
      const customChecks = config.customHealthChecks || {};

      const allConfigs: HealthCheckConfig[] = [];

      // Add built-in checks (with potential overrides)
      for (const [toolName, defaultCheck] of Object.entries(DEFAULT_HEALTH_CHECKS)) {
        const override = builtInOverrides[toolName];
        const finalCheck = override ? { ...defaultCheck, ...override } : defaultCheck;
        
        allConfigs.push({
          toolName,
          command: finalCheck.command,
          versionPattern: finalCheck.versionPattern,
          timeout: finalCheck.timeout,
          parseOutput: finalCheck.parseOutput,
          isCustom: false,
        });
      }

      // Add custom checks
      for (const [toolName, customCheck] of Object.entries(customChecks)) {
        allConfigs.push({
          toolName,
          command: customCheck.command,
          versionPattern: customCheck.versionPattern,
          timeout: customCheck.timeout,
          parseOutput: customCheck.parseOutput,
          isCustom: true,
        });
      }

      return allConfigs;
    }),

  getDefaultHealthCheckConfigs: (): Effect.Effect<readonly HealthCheckConfig[], never> =>
    Effect.succeed(
      Object.entries(DEFAULT_HEALTH_CHECKS).map(([toolName, check]) => ({
        toolName,
        command: check.command,
        versionPattern: check.versionPattern,
        timeout: check.timeout,
        parseOutput: check.parseOutput,
        isCustom: false,
      }))
    ),
});