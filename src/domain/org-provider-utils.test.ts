import { describe, expect, it } from "vitest";

import { normalizeOrganizationName, resolveProviderForOrganization, resolveRepositoryInput } from "./org-provider-utils";

describe("org-provider-utils", () => {
  it("normalizes organization names to lowercase", () => {
    expect(normalizeOrganizationName("AcMeSoftware")).toBe("acmesoftware");
  });

  it("resolves provider using case-insensitive organization mappings", () => {
    const provider = resolveProviderForOrganization("AcMeSoftware", "github", {
      acmesoftware: "gitlab",
    });

    expect(provider).toBe("gitlab");
  });

  it("falls back to the default provider when organization is not mapped", () => {
    const provider = resolveProviderForOrganization("unknown-org", "github", {
      acmesoftware: "gitlab",
    });

    expect(provider).toBe("github");
  });

  it("resolves plain repository names with default organization/provider", () => {
    const resolved = resolveRepositoryInput("dev", "acme", "github", {
      acmesoftware: "gitlab",
    });

    expect(resolved).toEqual({
      organization: "acme",
      repositoryName: "dev",
      provider: "github",
    });
  });

  it("resolves org/repo input and honors mapped provider", () => {
    const resolved = resolveRepositoryInput("AcMeSoftware/dev", "default-org", "github", {
      acmesoftware: "gitlab",
    });

    expect(resolved).toEqual({
      organization: "AcMeSoftware",
      repositoryName: "dev",
      provider: "gitlab",
    });
  });

  it("force provider overrides organization mapping", () => {
    const resolved = resolveRepositoryInput("acmesoftware/dev", "default-org", "github", {
      acmesoftware: "gitlab",
    }, "github");

    expect(resolved).toEqual({
      organization: "acmesoftware",
      repositoryName: "dev",
      provider: "github",
    });
  });
});
