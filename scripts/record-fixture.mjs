// Records a trimmed Token 2022 fixture for the tests. Runs once, needs the network.
import { mkdir, writeFile } from "node:fs/promises";
import { fetchAccounts } from "../dist/rpc.js";

const mint = process.argv[2];
const out = process.argv[3] ?? "fixtures/t22-recorded.json";
const keep = Number(process.argv[4] ?? 50);

if (!mint) {
  console.error("usage: node scripts/record-fixture.mjs <mint> [out] [keep]");
  process.exit(1);
}

const result = await fetchAccounts({ mint });
const withExtensions = result.accounts.filter((a) => (a.account.data.parsed.info.extensions ?? []).length > 0);
const plain = result.accounts.filter((a) => (a.account.data.parsed.info.extensions ?? []).length === 0);
const slice = [...withExtensions.slice(0, Math.ceil(keep / 2)), ...plain].slice(0, keep);

await mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(
  out,
  JSON.stringify(
    {
      note: "recorded from the live cluster with fetchAccounts, trimmed for repository size",
      mint,
      slot: result.slot,
      recorded_accounts: result.accounts.length,
      accounts: slice,
    },
    null,
    1,
  ),
);
console.log(`slot ${result.slot} total ${result.accounts.length} kept ${slice.length}`);
