import path from "path";

import { baseSearchDir } from "~/lib/constants";

/**
 * Parses repository URL to determine the local filesystem path.
 * Supports HTTPS and SSH URLs from GitHub/GitLab style hosts.
 */
export function parseRepoUrlToPath(repoUrl: string): string | null {
  try {
    let orgName = "";
    let repoName = "";
    let domain = "";

    // Handle scp-style SSH URLs (git@github.com:org/repo.git)
    const scpMatch = repoUrl.match(/^([^@]+)@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (scpMatch && scpMatch[2] && scpMatch[3] && scpMatch[4]) {
      domain = scpMatch[2];
      orgName = scpMatch[3];
      repoName = scpMatch[4];
      return path.join(baseSearchDir, domain, orgName, repoName);
    }

    // Normalize URLs like git+ssh:// and ssh://
    const cleaned = repoUrl.replace(/^git\+/, "");
    const url = new URL(cleaned);
    domain = url.hostname;
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      orgName = pathParts[0];
      repoName = pathParts[1].replace(/\.git$/, "");
      return path.join(baseSearchDir, domain, orgName, repoName);
    }

    throw new Error(`URL path does not contain organization and repository: ${repoUrl}`);
  } catch (error: any) {
    throw new Error(`Invalid repository URL: ${repoUrl} - ${error.message}`);
  }
}

/**
 * Expands shorthand repository formats to full git URLs.
 * Handles formats like:
 * - "myrepo" -> uses default org and provider
 * - "org/myrepo" -> uses specified org, auto-detects provider
 * - Full URLs are returned as-is
 */
export function expandToFullGitUrl(
  repoInput: string,
  defaultOrg: string,
  orgToProvider: Record<string, string>,
  forceProvider?: "github" | "gitlab",
): string {
  // If it's already a full URL, return as-is
  if (isFullUrl(repoInput)) {
    return repoInput;
  }

  let orgName = defaultOrg;
  let repoName = repoInput;
  let provider = "github"; // default provider

  // Check if input has org/repo format
  if (repoInput.includes("/")) {
    const parts = repoInput.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      orgName = parts[0];
      repoName = parts[1];
    }
  }

  // Determine provider based on forced option, org mapping, or default
  if (forceProvider) {
    provider = forceProvider;
  } else if (orgName in orgToProvider) {
    provider = orgToProvider[orgName] === "gitlab" ? "gitlab" : "github";
  } else if (defaultOrg in orgToProvider) {
    provider = orgToProvider[defaultOrg] === "gitlab" ? "gitlab" : "github";
  }

  // Construct the full URL
  const baseUrl = provider === "gitlab" ? "https://gitlab.com" : "https://github.com";
  return `${baseUrl}/${orgName}/${repoName}`;
}

/**
 * Checks if a string is a full URL (HTTP/HTTPS/SSH)
 */
function isFullUrl(str: string): boolean {
  return (
    str.startsWith("http://") ||
    str.startsWith("https://") ||
    str.startsWith("ssh://") ||
    str.startsWith("git://") ||
    str.startsWith("git+ssh://") ||
    str.includes("@")
  );
}
