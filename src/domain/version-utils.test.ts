import { describe, expect, it } from "vitest";

import { compareVersions } from "./version-utils";

describe("version-utils", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns -1 when first version is lower", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("1.2.3", "1.3.0")).toBe(-1);
    expect(compareVersions("1.2.3", "2.0.0")).toBe(-1);
  });

  it("returns 1 when first version is higher", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("handles versions with different segment counts", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });

  it("handles calver-style versions", () => {
    expect(compareVersions("2026.1.5", "2026.1.5")).toBe(0);
    expect(compareVersions("2026.1.4", "2026.1.5")).toBe(-1);
    expect(compareVersions("2026.2.0", "2026.1.5")).toBe(1);
  });

  it("handles single-segment versions", () => {
    expect(compareVersions("5", "5")).toBe(0);
    expect(compareVersions("4", "5")).toBe(-1);
  });
});
