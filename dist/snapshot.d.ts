export declare const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export declare const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
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
            parsed: {
                type: string;
                info: ParsedInfo;
            };
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
export declare function hashHolders(holders: Holder[]): string;
export declare function buildSnapshot(input: BuildInput): Snapshot;
/**
 * Spec entry point: snapshot({accounts, exclusions, top}) -> {holders[], hash}.
 *
 * The accounts carry their mint, so mint and slot are optional here; when they
 * are absent the snapshot is not pinned to a mint and reads the mint from the
 * accounts themselves. The result is the same shape buildSnapshot returns.
 */
export declare function snapshot(input: Partial<BuildInput> & {
    accounts: TokenAccountItem[];
    slot?: number | null;
}): Snapshot;
