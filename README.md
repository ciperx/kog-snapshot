# kog-snapshot

A ranked holder snapshot for a Solana token mint, reproducible from recorded data.

It reads token accounts from both token programs, groups them by owner, sums base units with
BigInt, applies exclusions, ranks the result and prints a sha256 over the kept list. The same
accounts in any order give the same hash.

## Use

```sh
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
kog-snapshot --mint <mint> --exclusions exclusions.json --out snapshot.json
```

Options:

- `--mint <address>` required.
- `--exclusions <file>` required, `{"owners": [], "token_accounts": []}`.
- `--slot <n>` passed as `minContextSlot` to both calls.
- `--top <n>` keeps the first n holders after ranking, default 100.
- `--out <file>` writes there, otherwise stdout.
- `--fixture <file>` reads `{slot, accounts}` instead of the RPC, so a run needs no network.
- `--save-fixture <file>` writes what the RPC answered, for a later offline run.

Exit code 0 on success, 1 with a one line message on a missing mint, an unreadable or invalid
file, or an RPC error. The RPC URL is read from `SOLANA_RPC_URL` and is never printed.

## Library

```js
import { buildSnapshot } from "@ciperx/kog-snapshot";
import { fetchAccounts } from "@ciperx/kog-snapshot/rpc";

const { slot, accounts } = await fetchAccounts({ mint });
const snapshot = buildSnapshot({ mint, slot, accounts, exclusions: { owners: [], token_accounts: [] }, top: 100 });
// {mint, slot, total, holders: [{rank, owner, amount}], hash}
```

`buildSnapshot({mint, slot, accounts, exclusions, top})` is pure. Only items with
`parsed.type === "account"`, the same mint and a positive `tokenAmount.amount` count. Amounts
stay decimal strings, summed per owner with BigInt, so no float ever touches a balance.
Ranking is amount descending and ties by owner ascending. `total` sums every counted owner
after exclusions, not only the holders kept by `top`.

`hash` is the lowercase hex sha256 of the UTF-8 text with one line per kept holder,
`rank,owner,amount`, joined by a newline, with no trailing newline.

## RPC shape

`fetchAccounts({rpcUrl, mint, slot, fetch})` sends one `getProgramAccounts` per token program
(`Tokenkeg...` and `Tokenz...`), `encoding: "jsonParsed"`, `withContext: true` and a memcmp
filter on the mint at offset 0. The reported slot is the lowest of the two context slots. A
`fetch` can be injected, which is how the tests run without a network.

## Fixture

`fixtures/t22-recorded.json` was recorded with `scripts/record-fixture.mjs` from a live Token
2022 mint, then trimmed to 48 accounts to keep the repository small. It keeps the original
slot and the number of accounts seen, so a reader can tell what was trimmed. The mint is a
Token 2022 mint with extension carrying accounts, which is what A5 needs.

## Tests

```sh
npm test
```

Eight tests, named after the acceptance item they prove: A1 grouping, A2 exclusions, A3
ranking and top, A4 hash rule and order independence, A5 Token 2022 extensions and a frozen
state, A6 the two RPC calls and the CLI with a fixture plus its error paths, A7 the recorded
fixture producing a stable snapshot.
