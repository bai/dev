/**
 * Semver-style version comparison.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Handles versions with any number of dot-separated numeric segments.
 */
export const compareVersions = (a: string, b: string): number => {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;
    if (aPart < bPart) return -1;
    if (aPart > bPart) return 1;
  }

  return 0;
};
