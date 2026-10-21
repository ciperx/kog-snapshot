/**
 * kog-snapshot core: a reproducible, deterministic holder snapshot for SPL Token
 * and Token 2022 accounts, grouped by owner, with a sha256 over the kept rows.
 *
 * All amount arithmetic is BigInt over base units (decimal strings). No floats.
 */
import { createHash } from "node:crypto";

/** SPL Token program id. */
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** Token 2022 program id. */
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * @typedef {{owners?: string[], token_accounts?: string[]}} Exclusions
 * @typedef {{pubkey: string, account: {owner?: string, data?: any, lamports?: number, space?: number}}} TokenAccount
 * @typedef {{rank: number, owner: string, amount: string}} Holder
 * @typedef {{mint: string, slot: number|null, total: string, holders: Holder[], hash: string}} Snapshot
 */

/**
 * Extract the parsed token-account info we care about, or null when the item is
 * not a token account of `mint` or holds a non-positive amount.
 * @param {TokenAccount} item
 * @param {string} mint
 */
function usableInfo(item, mint) {
  if (!item || typeof item !== "object") return null;
  const pubkey = typeof item.pubkey === "string" ? item.pubkey : null;
  const data = item.account && item.account.data;
  if (!pubkey || !data || typeof data !== "object") return null;
  const parsed = data.parsed;
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.type !== "account") return null;
  const info = parsed.info;
  if (!info || typeof info !== "object") return null;
  if (typeof info.mint !== "string" || info.mint !== mint) return null;
  if (typeof info.owner !== "string" || info.owner === "") return null;
  const amount = info.tokenAmount && info.tokenAmount.amount;
  if (typeof amount !== "string" || !/^-?\d+$/.test(amount)) return null;
  const value = BigInt(amount);
  if (value <= 0n) return null;
  return { pubkey, owner: info.owner, amount: value };
}

/**
 * Build a deterministic holder snapshot.
 *
 * @param {{mint: string, slot?: number|null, accounts: TokenAccount[], exclusions?: Exclusions, top?: number}} input
 * @returns {Snapshot}
 */
export function buildSnapshot({ mint, slot = null, accounts, exclusions, top } = {}) {
  if (typeof mint !== "string" || mint === "") {
    throw new Error("mint is required");
  }
  if (!Array.isArray(accounts)) {
    throw new Error("accounts must be an array");
  }
  const ex = exclusions || {};
  const excludedOwners = new Set(
    (Array.isArray(ex.owners) ? ex.owners : []).filter((o) => typeof o === "string")
  );
  const excludedAccounts = new Set(
    (Array.isArray(ex.token_accounts) ? ex.token_accounts : []).filter((a) => typeof a === "string")
  );

  /** @type {Map<string, bigint>} */
  const perOwner = new Map();
  for (const item of accounts) {
    const info = usableInfo(item, mint);
    if (!info) continue;
    if (excludedAccounts.has(info.pubkey)) continue;
    if (excludedOwners.has(info.owner)) continue;
    perOwner.set(info.owner, (perOwner.get(info.owner) || 0n) + info.amount);
  }

  const counted = [];
  let total = 0n;
  for (const [owner, amount] of perOwner) {
    if (amount <= 0n) continue;
    counted.push({ owner, amount });
    total += amount;
  }

  counted.sort((a, b) => {
    if (a.amount > b.amount) return -1;
    if (a.amount < b.amount) return 1;
    if (a.owner < b.owner) return -1;
    if (a.owner > b.owner) return 1;
    return 0;
  });

  let limit = counted.length;
  if (top !== undefined && top !== null) {
    const n = Number(top);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error("top must be a non-negative number");
    }
    limit = Math.min(counted.length, Math.floor(n));
  }

  /** @type {Holder[]} */
  const holders = counted.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    owner: entry.owner,
    amount: entry.amount.toString(),
  }));

  const text = holders.map((h) => `${h.rank},${h.owner},${h.amount}`).join("\n");
  const hash = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

  return {
    mint,
    slot: typeof slot === "number" ? slot : null,
    total: total.toString(),
    holders,
    hash,
  };
}

/**
 * One getProgramAccounts JSON-RPC call per token program, jsonParsed, memcmp on
 * the mint at offset 0. `slot` is the lowest context slot of the two answers.
 *
 * @param {{rpcUrl: string, mint: string, fetch?: typeof fetch, minContextSlot?: number|null}} input
 * @returns {Promise<{slot: number, accounts: TokenAccount[], total: string}>}
 */
export async function fetchAccounts({ rpcUrl, mint, fetch: fetchImpl, minContextSlot } = {}) {
  if (typeof mint !== "string" || mint === "") throw new Error("mint is required");
  const url = rpcUrl || process.env.SOLANA_RPC_URL;
  if (typeof url !== "string" || url === "") {
    throw new Error("SOLANA_RPC_URL is not set");
  }
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") throw new Error("no fetch available");

  const call = async (programId) => {
    const config = {
      encoding: "jsonParsed",
      withContext: true,
      filters: [{ memcmp: { offset: 0, bytes: mint } }],
    };
    if (typeof minContextSlot === "number") config.minContextSlot = minContextSlot;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [programId, config],
    });
    const response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!response) {
      throw new Error("rpc request failed");
    }
    if (response.ok === false) {
      throw new Error("rpc request failed with status " + response.status);
    }
    const payload = await response.json();
    if (!payload || payload.error) {
      throw new Error("rpc error: " + (payload && payload.error && payload.error.message ? payload.error.message : "unknown"));
    }
    const result = payload.result;
    if (!result || !result.context || !Array.isArray(result.value)) {
      throw new Error("unexpected rpc response");
    }
    return { slot: Number(result.context.slot), accounts: result.value };
  };

  const [a, b] = await Promise.all([call(TOKEN_PROGRAM_ID), call(TOKEN_2022_PROGRAM_ID)]);
  const slot = Math.min(a.slot, b.slot);
  const accounts = [...a.accounts, ...b.accounts];
  return { slot, accounts, total: String(accounts.length) };
}

export default { buildSnapshot, fetchAccounts, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID };
