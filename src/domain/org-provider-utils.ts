import type { GitProviderType } from "./models";

export const normalizeOrganizationName = (organization: string): string => organization.toLowerCase();

export const normalizeOrgToProviderMap = (orgToProvider: Record<string, GitProviderType>): Record<string, GitProviderType> =>
  Object.entries(orgToProvider).reduce<Record<string, GitProviderType>>((accumulator, [organization, provider]) => {
    accumulator[normalizeOrganizationName(organization)] = provider;
    return accumulator;
  }, {});

export const resolveProviderForOrganization = (
  organization: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
): GitProviderType => {
  const normalizedMap = normalizeOrgToProviderMap(orgToProvider);
  return normalizedMap[normalizeOrganizationName(organization)] ?? defaultProvider;
};

export const resolveRepositoryInput = (
  repoInput: string,
  defaultOrg: string,
  defaultProvider: GitProviderType,
  orgToProvider: Record<string, GitProviderType>,
  forceProvider?: "github" | "gitlab",
): {
  readonly organization: string;
  readonly repositoryName: string;
  readonly provider: GitProviderType;
} => {
  let organization = defaultOrg;
  let repositoryName = repoInput;

  if (repoInput.includes("/")) {
    const parts = repoInput.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      organization = parts[0];
      repositoryName = parts[1];
    }
  }

  const provider = forceProvider ?? resolveProviderForOrganization(organization, defaultProvider, orgToProvider);

  return {
    organization,
    repositoryName,
    provider,
  };
};
