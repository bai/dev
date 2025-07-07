import { z } from "zod/v4";

import type { Repository } from "./models";

/**
 * GitHub API response schemas
 */
export const GitHubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
  }),
  clone_url: z.string(),
  ssh_url: z.string(),
  html_url: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
});

export const GitHubSearchResponseSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean().optional(),
  items: z.array(GitHubRepoSchema),
});

/**
 * GitLab API response schemas
 */
export const GitLabProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string(),
  path_with_namespace: z.string(),
  namespace: z.object({
    full_path: z.string(),
  }),
  http_url_to_repo: z.string(),
  ssh_url_to_repo: z.string(),
  web_url: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(["private", "internal", "public"]).optional(),
});

export const GitLabSearchResponseSchema = z.array(GitLabProjectSchema);

/**
 * Type-safe parsing functions that return discriminated unions
 */
export const parseGitHubRepo = (
  data: unknown,
): { success: true; data: z.infer<typeof GitHubRepoSchema> } | { success: false; error: string } => {
  const result = GitHubRepoSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: `Invalid GitHub repository data: ${result.error.message}`,
    };
  }
  return { success: true, data: result.data };
};

export const parseGitHubSearchResponse = (
  data: unknown,
): { success: true; data: z.infer<typeof GitHubSearchResponseSchema> } | { success: false; error: string } => {
  const result = GitHubSearchResponseSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: `Invalid GitHub search response: ${result.error.message}`,
    };
  }
  return { success: true, data: result.data };
};

export const parseGitLabProject = (
  data: unknown,
): { success: true; data: z.infer<typeof GitLabProjectSchema> } | { success: false; error: string } => {
  const result = GitLabProjectSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: `Invalid GitLab project data: ${result.error.message}`,
    };
  }
  return { success: true, data: result.data };
};

export const parseGitLabSearchResponse = (
  data: unknown,
): { success: true; data: z.infer<typeof GitLabSearchResponseSchema> } | { success: false; error: string } => {
  const result = GitLabSearchResponseSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: `Invalid GitLab search response: ${result.error.message}`,
    };
  }
  return { success: true, data: result.data };
};

/**
 * Transform functions to convert API responses to domain models
 */
export const gitHubRepoToRepository = (
  repo: z.infer<typeof GitHubRepoSchema>,
  provider: { name: "github"; baseUrl: string },
): Repository => ({
  name: repo.name,
  organization: repo.owner.login,
  provider,
  cloneUrl: repo.clone_url,
});

export const gitLabProjectToRepository = (
  project: z.infer<typeof GitLabProjectSchema>,
  provider: { name: "gitlab"; baseUrl: string },
): Repository => ({
  name: project.name,
  organization: project.namespace.full_path,
  provider,
  cloneUrl: project.http_url_to_repo,
});
