import type { GitProviderType } from "./models";

export const normalizeOrganizationName = (organization: string): string => organization.toLowerCase();

export const normalizeOrgToProviderMap = (orgToProvider: Record<string, GitProviderType>): Record<string, GitProviderType> =>
  Object.entries(orgToProvider).reduce<Record<string, GitProviderType>>((accumulator, [organization, provider]) => {
    accumulator[normalizeOrganizationName(organization)] = provider;
    return accumulator;
  }, {});
