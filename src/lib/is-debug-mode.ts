/**
 * Checks if the CLI is running in debug mode.
 * Debug mode is enabled when the DEV_CLI_DEBUG environment variable is set to "1".
 *
 * @returns true if debug mode is enabled, false otherwise
 */
export function isDebugMode(): boolean {
  return process.env.DEV_CLI_DEBUG === "1";
}
