import path from "path";

import { describe, expect, it } from "vitest";

import { baseSearchDir } from "~/lib/constants";
import { expandToFullGitUrl, parseRepoUrlToPath } from "~/lib/get-repo-url";

describe("parseRepoUrlToPath", () => {
  it("handles SSH URLs with dots in repository name", () => {
    const url = "git@github.com:foo/my.repo.git";
    const expected = path.join(baseSearchDir, "github.com", "foo", "my.repo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles standard SSH URLs", () => {
    const url = "git@github.com:foo/myrepo.git";
    const expected = path.join(baseSearchDir, "github.com", "foo", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles ssh protocol URLs", () => {
    const url = "ssh://git@github.com/foo/myrepo.git";
    const expected = path.join(baseSearchDir, "github.com", "foo", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles git+ssh protocol URLs", () => {
    const url = "git+ssh://git@github.com/foo/myrepo.git";
    const expected = path.join(baseSearchDir, "github.com", "foo", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles HTTPS URLs", () => {
    const url = "https://github.com/foo/myrepo.git";
    const expected = path.join(baseSearchDir, "github.com", "foo", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles HTTPS URLs without .git", () => {
    const url = "https://github.com/foo/myrepo";
    const expected = path.join(baseSearchDir, "github.com", "foo", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles git protocol URLs", () => {
    const url = "git://github.com/foo/myrepo.git";
    const expected = path.join(baseSearchDir, "github.com", "foo", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles GitLab HTTPS URLs", () => {
    const url = "https://gitlab.com/bar/myrepo.git";
    const expected = path.join(baseSearchDir, "gitlab.com", "bar", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles GitLab SSH URLs", () => {
    const url = "git@gitlab.com:bar/myrepo.git";
    const expected = path.join(baseSearchDir, "gitlab.com", "bar", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles GitLab ssh protocol URLs", () => {
    const url = "ssh://git@gitlab.com/bar/myrepo.git";
    const expected = path.join(baseSearchDir, "gitlab.com", "bar", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  it("handles GitLab git protocol URLs", () => {
    const url = "git://gitlab.com/bar/myrepo.git";
    const expected = path.join(baseSearchDir, "gitlab.com", "bar", "myrepo");
    expect(parseRepoUrlToPath(url)).toBe(expected);
  });

  describe("invalid inputs", () => {
    it("throws error for empty string", () => {
      expect(() => parseRepoUrlToPath("")).toThrow("Invalid repository URL");
    });

    it("throws error for plain domain without org/repo", () => {
      expect(() => parseRepoUrlToPath("https://github.com")).toThrow("Invalid repository URL");
    });

    it("throws error for URL with only one path segment", () => {
      expect(() => parseRepoUrlToPath("https://github.com/foo")).toThrow("Invalid repository URL");
    });

    it("throws error for URL with only slashes", () => {
      expect(() => parseRepoUrlToPath("https://github.com/")).toThrow("Invalid repository URL");
    });

    it("throws error for malformed SSH URL without colon", () => {
      expect(() => parseRepoUrlToPath("git@github.com/foo/repo.git")).toThrow("Invalid repository URL");
    });

    it("throws error for SSH URL with missing org", () => {
      expect(() => parseRepoUrlToPath("git@github.com:repo.git")).toThrow("Invalid repository URL");
    });

    it("throws error for SSH URL with missing repo", () => {
      expect(() => parseRepoUrlToPath("git@github.com:foo/")).toThrow("Invalid repository URL");
    });

    it("throws error for non-URL string", () => {
      expect(() => parseRepoUrlToPath("not-a-url")).toThrow("Invalid repository URL");
    });

    it("throws error for random text", () => {
      expect(() => parseRepoUrlToPath("just some random text")).toThrow("Invalid repository URL");
    });

    it("throws error for invalid URL format", () => {
      expect(() => parseRepoUrlToPath("://invalid-url")).toThrow("Invalid repository URL");
    });

    it("throws error for malformed SSH URL without username", () => {
      expect(() => parseRepoUrlToPath("@github.com:foo/repo.git")).toThrow("Invalid repository URL");
    });

    it("throws error for malformed SSH URL without host", () => {
      expect(() => parseRepoUrlToPath("git@:foo/repo.git")).toThrow("Invalid repository URL");
    });

    it("throws error for URL with invalid scheme format", () => {
      expect(() => parseRepoUrlToPath("ht!tp://github.com/foo/repo")).toThrow("Invalid repository URL");
    });

    it("throws error for incomplete https URL", () => {
      expect(() => parseRepoUrlToPath("https://")).toThrow("Invalid repository URL");
    });

    it("throws error for URL with empty path segments", () => {
      expect(() => parseRepoUrlToPath("https://github.com//")).toThrow("Invalid repository URL");
    });
  });
});

describe("expandToFullGitUrl", () => {
  const defaultOrg = "myorg";
  const orgToProvider = {
    "gitlab-org": "gitlab",
    "custom-org": "gitlab",
  };

  describe("shorthand repository names", () => {
    it("expands simple repo name to GitHub with default org", () => {
      const result = expandToFullGitUrl("myrepo", defaultOrg, orgToProvider);
      expect(result).toBe("https://github.com/myorg/myrepo");
    });

    it("expands simple repo name to GitLab when default org has GitLab mapping", () => {
      const gitlabOrgToProvider = { myorg: "gitlab" };
      const result = expandToFullGitUrl("myrepo", defaultOrg, gitlabOrgToProvider);
      expect(result).toBe("https://gitlab.com/myorg/myrepo");
    });

    it("expands org/repo format to GitHub by default", () => {
      const result = expandToFullGitUrl("someorg/myrepo", defaultOrg, orgToProvider);
      expect(result).toBe("https://github.com/someorg/myrepo");
    });

    it("expands explicit org/repo to GitHub even when default org maps to GitLab", () => {
      const gitlabDefaultOrgToProvider = { myorg: "gitlab" };
      const result = expandToFullGitUrl("bai/config", "myorg", gitlabDefaultOrgToProvider);
      expect(result).toBe("https://github.com/bai/config");
    });

    it("expands org/repo format to GitLab when org has GitLab mapping", () => {
      const result = expandToFullGitUrl("gitlab-org/myrepo", defaultOrg, orgToProvider);
      expect(result).toBe("https://gitlab.com/gitlab-org/myrepo");
    });

    it("expands org/repo format to GitLab when org has custom GitLab mapping", () => {
      const result = expandToFullGitUrl("custom-org/myrepo", defaultOrg, orgToProvider);
      expect(result).toBe("https://gitlab.com/custom-org/myrepo");
    });
  });

  describe("forced provider options", () => {
    it("forces GitHub provider regardless of org mapping", () => {
      const result = expandToFullGitUrl("gitlab-org/myrepo", defaultOrg, orgToProvider, "github");
      expect(result).toBe("https://github.com/gitlab-org/myrepo");
    });

    it("forces GitLab provider regardless of default org", () => {
      const result = expandToFullGitUrl("myrepo", defaultOrg, orgToProvider, "gitlab");
      expect(result).toBe("https://gitlab.com/myorg/myrepo");
    });

    it("forces GitLab provider for org/repo format", () => {
      const result = expandToFullGitUrl("someorg/myrepo", defaultOrg, orgToProvider, "gitlab");
      expect(result).toBe("https://gitlab.com/someorg/myrepo");
    });

    it("forces GitHub provider for simple repo name", () => {
      const gitlabOrgToProvider = { myorg: "gitlab" };
      const result = expandToFullGitUrl("myrepo", defaultOrg, gitlabOrgToProvider, "github");
      expect(result).toBe("https://github.com/myorg/myrepo");
    });
  });

  describe("full URLs", () => {
    it("returns HTTPS URLs as-is", () => {
      const url = "https://github.com/foo/bar.git";
      const result = expandToFullGitUrl(url, defaultOrg, orgToProvider);
      expect(result).toBe(url);
    });

    it("returns SSH URLs as-is", () => {
      const url = "git@github.com:foo/bar.git";
      const result = expandToFullGitUrl(url, defaultOrg, orgToProvider);
      expect(result).toBe(url);
    });

    it("returns git protocol URLs as-is", () => {
      const url = "git://github.com/foo/bar.git";
      const result = expandToFullGitUrl(url, defaultOrg, orgToProvider);
      expect(result).toBe(url);
    });

    it("returns ssh protocol URLs as-is", () => {
      const url = "ssh://git@github.com/foo/bar.git";
      const result = expandToFullGitUrl(url, defaultOrg, orgToProvider);
      expect(result).toBe(url);
    });

    it("returns git+ssh protocol URLs as-is", () => {
      const url = "git+ssh://git@github.com/foo/bar.git";
      const result = expandToFullGitUrl(url, defaultOrg, orgToProvider);
      expect(result).toBe(url);
    });
  });

  describe("edge cases", () => {
    it("handles empty org mapping gracefully", () => {
      const result = expandToFullGitUrl("myrepo", defaultOrg, {});
      expect(result).toBe("https://github.com/myorg/myrepo");
    });

    it("handles repo names with special characters", () => {
      const result = expandToFullGitUrl("my-repo.name", defaultOrg, orgToProvider);
      expect(result).toBe("https://github.com/myorg/my-repo.name");
    });

    it("handles org names with special characters", () => {
      const result = expandToFullGitUrl("my-org/my-repo", defaultOrg, orgToProvider);
      expect(result).toBe("https://github.com/my-org/my-repo");
    });
  });
});

describe("integration: shorthand clone to full path", () => {
  const defaultOrg = "myorg";
  const orgToProvider = {
    "gitlab-org": "gitlab",
  };

  it("handles simple repo name clone", () => {
    const repoInput = "myrepo";
    const fullUrl = expandToFullGitUrl(repoInput, defaultOrg, orgToProvider);
    const localPath = parseRepoUrlToPath(fullUrl);

    expect(fullUrl).toBe("https://github.com/myorg/myrepo");
    expect(localPath).toBe(path.join(baseSearchDir, "github.com", "myorg", "myrepo"));
  });

  it("handles org/repo clone", () => {
    const repoInput = "someorg/myrepo";
    const fullUrl = expandToFullGitUrl(repoInput, defaultOrg, orgToProvider);
    const localPath = parseRepoUrlToPath(fullUrl);

    expect(fullUrl).toBe("https://github.com/someorg/myrepo");
    expect(localPath).toBe(path.join(baseSearchDir, "github.com", "someorg", "myrepo"));
  });

  it("handles GitLab org/repo clone", () => {
    const repoInput = "gitlab-org/myrepo";
    const fullUrl = expandToFullGitUrl(repoInput, defaultOrg, orgToProvider);
    const localPath = parseRepoUrlToPath(fullUrl);

    expect(fullUrl).toBe("https://gitlab.com/gitlab-org/myrepo");
    expect(localPath).toBe(path.join(baseSearchDir, "gitlab.com", "gitlab-org", "myrepo"));
  });

  it("handles forced GitLab provider", () => {
    const repoInput = "myrepo";
    const fullUrl = expandToFullGitUrl(repoInput, defaultOrg, orgToProvider, "gitlab");
    const localPath = parseRepoUrlToPath(fullUrl);

    expect(fullUrl).toBe("https://gitlab.com/myorg/myrepo");
    expect(localPath).toBe(path.join(baseSearchDir, "gitlab.com", "myorg", "myrepo"));
  });

  it("handles forced GitHub provider with GitLab org", () => {
    const repoInput = "gitlab-org/myrepo";
    const fullUrl = expandToFullGitUrl(repoInput, defaultOrg, orgToProvider, "github");
    const localPath = parseRepoUrlToPath(fullUrl);

    expect(fullUrl).toBe("https://github.com/gitlab-org/myrepo");
    expect(localPath).toBe(path.join(baseSearchDir, "github.com", "gitlab-org", "myrepo"));
  });
});
