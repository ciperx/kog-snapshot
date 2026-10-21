/**
 * TypeScript entry point. The implementation lives in snapshot.js so the package
 * runs on plain Node 20 without a build step; these declarations make the same
 * functions available to TypeScript consumers (tsx, tsc).
 */
export {
  buildSnapshot,
  fetchAccounts,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./snapshot.js";

export type Exclusions = {
  owners?: string[];
  token_accounts?: string[];
};

export type TokenAccount = {
  pubkey: string;
  account: {
    owner?: string;
    data?: any;
    lamports?: number;
    space?: number;
  };
};

export type Holder = { rank: number; owner: string; amount: string };

export type Snapshot = {
  mint: string;
  slot: number | null;
  total: string;
  holders: Holder[];
  hash: string;
};

export type FetchAccountsInput = {
  rpcUrl?: string;
  mint: string;
  fetch?: typeof fetch;
  minContextSlot?: number | null;
};

export type FetchAccountsResult = {
  slot: number;
  accounts: TokenAccount[];
  total: string;
};
