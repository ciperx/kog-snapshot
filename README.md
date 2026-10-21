# kog-snapshot

A reproducible, deterministic snapshot of a Solana token's top holders.

SPL Token and Token 2022 aware, token accounts grouped by owner, amounts summed in
base units with BigInt (no floats), and a sha256 over the ranked rows so two runs on
the same recorded data can be compared byte for byte.

Self-sufficiency: no runtime dependencies, Node 20 or later. The implementation is
plain ESM JavaScript with TypeScript types in `src/snapshot.ts`, so the package works
without a build step and is still importable from TypeScript (tsx, tsc, vitest).

## Install

```bash
git clone <this repo> kog-snapshot
cd kog-snapshot
node --version   # 20 or later
```

## Interface

```js
import { buildSnapshot, fetchAccounts } from "kog-snapshot";

buildSnapshot({ mint, slot, accounts, exclusions, top });
// -> { mint, slot, total, holders: [{ rank, owner, amount }], hash }

await fetchAccounts({ rpcUrl, mint, fetch, minContextSlot });
// -> { slot, accounts, total }
```

`accounts` are `getProgramAccounts` items in `jsonParsed` encoding, from both token
programs:

```json
{ "pubkey": "...", "account": { "owner": "...", "data": { "program": "spl-token",
  "parsed": { "type": "account", "info": { "mint": "...", "owner": "...", "state": "initialized",
    "tokenAmount": { "amount": "123", "decimals": 6 }, "extensions": [] } } } } }
```

Rules, exactly:

- only items of `type: "account"`, of the requested mint, with a positive amount count;
  other mints, zero balances and non-token-account items are ignored;
- amounts are base units as decimal strings, summed per owner with BigInt;
- `exclusions` is `{ owners: string[], token_accounts: string[] }`: an excluded owner or
  an excluded token account is left out of the snapshot and of `total`;
- ranking is by amount descending, ties by owner ascending (plain string comparison);
  `rank` starts at 1; `top` (default 100) keeps the first holders;
- `total` is the sum over every counted owner after exclusions, not only the kept rows;
- `hash` is the sha256, lowercase hex, of the UTF-8 text with one line per kept holder,
  `rank,owner,amount`, joined by a newline with no trailing newline.

`fetchAccounts` sends one `getProgramAccounts` JSON-RPC request per token program
(`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` and
`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) with `encoding: "jsonParsed"`,
`withContext: true` and a `memcmp` filter on the mint at offset 0. The returned `slot`
is the lowest context slot of the two answers. `minContextSlot` is forwarded when set.
The RPC URL comes from the argument or the `SOLANA_RPC_URL` environment variable and is
never printed.

## CLI

```bash
export SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
node bin/kog-snapshot.mjs --mint <address> --exclusions <file> \
  [--slot <n>] [--top <n>] [--out <file>] [--fixture <file>] [--save-fixture <file>]
```

- `--slot` is passed to the RPC as `minContextSlot`;
- `--fixture` reads `{ slot, accounts }` (exactly what `fetchAccounts` returns) from a
  file instead of the RPC, so a snapshot is reproducible with no network;
- `--save-fixture` writes the fetched `{ slot, accounts }` for later offline replays;
- the snapshot JSON goes to `--out` or stdout;
- exit code 0 on success, 1 with a plain message on an error (missing mint, unreadable
  file, RPC error).

## Tests

```bash
npm test          # node --test test/*.test.mjs
```

Each test is named after the acceptance item it proves:

- A1 grouping by owner across both token programs, with other mints, zero balances and
  non-account items ignored
- A2 exclusions by owner and by token account
- A3 ranking by amount with ties by owner, and `top` keeping the first N
- A4 the hash rule, and the same accounts in any order giving the same hash
- A5 Token 2022 accounts with extensions (transfer fee, immutable owner, frozen state)
  counted by their amount
- A6 `fetchAccounts` sending the two calls, and the CLI writing from a recorded fixture
  with no network and exiting 1 on bad input
- A7 tests on a recorded fixture of a real Token 2022 mint

The committed fixture `fixtures/token2022-pyusd.json` was recorded from Solana mainnet
with `getProgramAccounts` (`jsonParsed`, `withContext`) filtered on the PYUSD Token 2022
mint `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`; only positive balances were kept,
and the accounts carry `transferFeeAmount`, `immutableOwner` and `transferHookAccount`
extensions. The `source` block in the file records the program, mint and RPC method.

## Reproducing a snapshot

```bash
# record once
node bin/kog-snapshot.mjs --mint <mint> --exclusions exclusions.json \
  --top 100 --save-fixture fixture.json --out snapshot.json

# replay offline, same hash
node bin/kog-snapshot.mjs --mint <mint> --exclusions exclusions.json \
  --fixture fixture.json --top 100 --out snapshot-replay.json
```

## License

MIT
