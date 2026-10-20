import { createHash } from "node:crypto";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmountString?: string;
}

export interface ParsedInfo {
  mint: string;
  owner: string;
  state?: string;
  tokenAmount?: TokenAmount;
  extensions?: unknown[];
}

export interface TokenAccountItem {
  pubkey: string;
  account: {
    owner: string;
    data: {
      program: string;
      parsed: { type: string; info: ParsedInfo };
    };
  };
}

export interface Exclusions {
  owners?: string[];
  token_accounts?: string[];
}

export interface Holder {
  rank: number;
  owner: string;
  amount: string;
}

export interface Snapshot {
  mint: string;
  slot: number;
  total: string;
  holders: Holder[];
  hash: string;
}

export interface BuildInput {
  mint: string;
  slot: number;
  accounts: TokenAccountItem[];
  exclusions?: Exclusions;
  top?: number;
}

/**
 * Hash rule from the spec: sha256, lowercase hex, over one line per kept holder
 * "rank,owner,amount" joined by a newline with no trailing newline.
 */
export function hashHolders(holders: Holder[]): string {
  const text = holders.map((h) => `${h.rank},${h.owner},${h.amount}`).join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function counted(item: TokenAccountItem, mint: string): boolean {
  const parsed = item?.account?.data?.parsed;
  if (!parsed || parsed.type !== "account") return false;
  const info = parsed.info;
  if (!info || info.mint !== mint) return false;
  const amount = info.tokenAmount?.amount;
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) return false;
  return BigInt(amount) > 0n;
}

export function buildSnapshot(input: BuildInput): Snapshot {
  const { mint, slot } = input;
  if (!mint || typeof mint !== "string") throw new Error("mint is required");
  if (!Number.isFinite(slot)) throw new Error("slot must be a number");
  const accounts = input.accounts ?? [];
  const owners = new Set(input.exclusions?.owners ?? []);
  const tokenAccounts = new Set(input.exclusions?.token_accounts ?? []);
  const top = input.top === undefined ? 100 : input.top;
  if (!Number.isInteger(top) || top < 0) throw new Error("top must be a non negative integer");

  const sums = new Map<string, bigint>();
  for (const item of accounts) {
    if (!counted(item, mint)) continue;
    const info = item.account.data.parsed.info;
    if (owners.has(info.owner)) continue;
    if (tokenAccounts.has(item.pubkey)) continue;
    const value = BigInt(info.tokenAmount!.amount);
    sums.set(info.owner, (sums.get(info.owner) ?? 0n) + value);
  }

  let total = 0n;
  for (const value of sums.values()) total += value;

  const ranked = [...sums.entries()]
    .sort((a, b) => (a[1] === b[1] ? (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) : a[1] > b[1] ? -1 : 1))
    .map(([owner, amount], index) => ({ rank: index + 1, owner, amount: amount.toString() }));

  const holders = ranked.slice(0, top);
  return { mint, slot, total: total.toString(), holders, hash: hashHolders(holders) };
}
