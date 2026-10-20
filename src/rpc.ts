import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM, type TokenAccountItem } from "./snapshot.js";

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

interface RpcAnswer {
  result?: {
    context?: { slot?: number };
    value?: TokenAccountItem[];
  };
  error?: { code?: number; message?: string };
}

/**
 * One getProgramAccounts call per token program, jsonParsed, withContext true and a
 * memcmp filter on the mint at offset 0. The reported slot is the lowest context slot.
 */
export async function fetchAccounts(input: FetchInput): Promise<FetchResult> {
  const { mint, slot: minContextSlot } = input;
  const rpcUrl = input.rpcUrl ?? process.env.SOLANA_RPC_URL;
  const doFetch = input.fetch ?? globalThis.fetch;
  if (!mint) throw new Error("mint is required");
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL is not set");
  if (typeof doFetch !== "function") throw new Error("fetch is not available");

  const accounts: TokenAccountItem[] = [];
  const slots: number[] = [];

  for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    const config: Record<string, unknown> = {
      encoding: "jsonParsed",
      withContext: true,
      filters: [{ memcmp: { offset: 0, bytes: mint } }],
    };
    if (minContextSlot !== undefined) config.minContextSlot = minContextSlot;

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: program === TOKEN_PROGRAM ? 1 : 2,
      method: "getProgramAccounts",
      params: [program, config],
    });

    let response: Response;
    try {
      response = await doFetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch (error) {
      throw new Error(`rpc request failed: ${(error as Error).message}`);
    }

    if (!response.ok) throw new Error(`rpc answered ${response.status}`);

    let answer: RpcAnswer;
    try {
      answer = (await response.json()) as RpcAnswer;
    } catch {
      throw new Error("rpc answered with malformed json");
    }

    if (answer.error) throw new Error(`rpc error ${answer.error.code ?? ""}: ${answer.error.message ?? "unknown"}`);
    if (!answer.result) throw new Error("rpc answer has no result");

    const contextSlot = answer.result.context?.slot;
    if (typeof contextSlot === "number") slots.push(contextSlot);
    const value = answer.result.value ?? [];
    if (!Array.isArray(value)) throw new Error("rpc answer value is not a list");
    accounts.push(...value);
  }

  if (slots.length === 0) throw new Error("rpc answer has no context slot");
  return { slot: Math.min(...slots), accounts };
}
