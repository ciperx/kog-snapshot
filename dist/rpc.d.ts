import { type TokenAccountItem } from "./snapshot.js";
export interface FetchInput {
    rpcUrl?: string;
    mint: string;
    slot?: number;
    fetch?: typeof globalThis.fetch;
}
export interface FetchResult {
    slot: number;
    accounts: TokenAccountItem[];
}
/**
 * One getProgramAccounts call per token program, jsonParsed, withContext true and a
 * memcmp filter on the mint at offset 0. The reported slot is the lowest context slot.
 */
export declare function fetchAccounts(input: FetchInput): Promise<FetchResult>;
