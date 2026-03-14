import type {
  AccountCollectMethod,
  AccountPosts,
  SourceCandidate,
  SourceLink,
  WebCollectMethod,
  XSearchResult,
} from "../../types";

export interface AccountCollectRepository {
  readonly method: AccountCollectMethod;
  fetchAccountPosts(accounts: string[], iteration: number): Promise<AccountPosts[]>;
  searchPosts(queries: string[], iteration: number): Promise<XSearchResult[]>;
}

export interface WebCollectRepository {
  readonly method: WebCollectMethod;
  searchPosts(queries: string[], iteration: number): Promise<XSearchResult[]>;
  searchCandidates(queries: string[]): Promise<SourceCandidate[]>;
  searchLinks(queries: string[]): Promise<SourceLink[]>;
}

export interface WebSearchProviderRepository {
  searchPosts(queries: string[], iteration: number): Promise<XSearchResult[]>;
  searchCandidates(queries: string[]): Promise<SourceCandidate[]>;
  searchLinks(queries: string[]): Promise<SourceLink[]>;
}
