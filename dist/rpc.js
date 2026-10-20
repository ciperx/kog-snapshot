import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from "./snapshot.js";
/**
 * One getProgramAccounts call per token program, jsonParsed, withContext true and a
 * memcmp filter on the mint at offset 0. The reported slot is the lowest context slot.
 */
export async function fetchAccounts(input) {
    const { mint, slot: minContextSlot } = input;
    const rpcUrl = input.rpcUrl ?? process.env.SOLANA_RPC_URL;
    const doFetch = input.fetch ?? globalThis.fetch;
    if (!mint)
        throw new Error("mint is required");
    if (!rpcUrl)
        throw new Error("SOLANA_RPC_URL is not set");
    if (typeof doFetch !== "function")
        throw new Error("fetch is not available");
    const accounts = [];
    const slots = [];
    for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
        const config = {
            encoding: "jsonParsed",
            withContext: true,
            filters: [{ memcmp: { offset: 0, bytes: mint } }],
        };
        if (minContextSlot !== undefined)
            config.minContextSlot = minContextSlot;
        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: program === TOKEN_PROGRAM ? 1 : 2,
            method: "getProgramAccounts",
            params: [program, config],
        });
        let response;
        try {
            response = await doFetch(rpcUrl, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            });
        }
        catch (error) {
            throw new Error(`rpc request failed: ${error.message}`);
        }
        if (!response.ok)
            throw new Error(`rpc answered ${response.status}`);
        let answer;
        try {
            answer = (await response.json());
        }
        catch {
            throw new Error("rpc answered with malformed json");
        }
        if (answer.error)
            throw new Error(`rpc error ${answer.error.code ?? ""}: ${answer.error.message ?? "unknown"}`);
        if (!answer.result)
            throw new Error("rpc answer has no result");
        const contextSlot = answer.result.context?.slot;
        if (typeof contextSlot === "number")
            slots.push(contextSlot);
        const value = answer.result.value ?? [];
        if (!Array.isArray(value))
            throw new Error("rpc answer value is not a list");
        accounts.push(...value);
    }
    if (slots.length === 0)
        throw new Error("rpc answer has no context slot");
    return { slot: Math.min(...slots), accounts };
}
