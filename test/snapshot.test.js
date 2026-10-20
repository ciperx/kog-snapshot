import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, hashHolders } from "../dist/snapshot.js";

const MINT = "So11111111111111111111111111111111111111112";
const OTHER = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function item(pubkey, owner, amount, options = {}) {
  const { mint = MINT, type = "account", program = "spl-token", extensions } = options;
  const info = { mint, owner, state: "initialized", tokenAmount: { amount, decimals: 9 } };
  if (extensions) info.extensions = extensions;
  return { pubkey, account: { owner: "ProgramOwner", data: { program, parsed: { type, info } } } };
}

test("A1 groups by owner across both programs and ignores other mints, zero balances and non accounts", () => {
  const accounts = [
    item("acc1", "ownerB", "100"),
    item("acc2", "ownerA", "300", { program: "spl-token-2022" }),
    item("acc3", "ownerA", "200"),
    item("acc4", "ownerC", "0"),
    item("acc5", "ownerD", "500", { mint: OTHER }),
    item("acc6", "ownerE", "700", { type: "mint" }),
  ];
  const snap = buildSnapshot({ mint: MINT, slot: 10, accounts });
  assert.deepEqual(snap.holders, [
    { rank: 1, owner: "ownerA", amount: "500" },
    { rank: 2, owner: "ownerB", amount: "100" },
  ]);
  assert.equal(snap.total, "600");
});

test("A2 applies exclusions by owner and by token account", () => {
  const accounts = [item("acc1", "ownerA", "100"), item("acc2", "ownerB", "100"), item("acc3", "ownerC", "100")];
  const snap = buildSnapshot({
    mint: MINT,
    slot: 11,
    accounts,
    exclusions: { owners: ["ownerA"], token_accounts: ["acc2"] },
  });
  assert.deepEqual(snap.holders, [{ rank: 1, owner: "ownerC", amount: "100" }]);
  assert.equal(snap.total, "100");
});

test("A3 ranks by amount, breaks ties by owner string and keeps the first N", () => {
  const accounts = [
    item("acc1", "zoe", "50"),
    item("acc2", "amy", "50"),
    item("acc3", "bob", "90"),
    item("acc4", "cat", "10"),
  ];
  const all = buildSnapshot({ mint: MINT, slot: 12, accounts });
  assert.deepEqual(
    all.holders.map((h) => h.owner),
    ["bob", "amy", "zoe", "cat"],
  );
  const top = buildSnapshot({ mint: MINT, slot: 12, accounts, top: 2 });
  assert.deepEqual(top.holders.map((h) => h.owner), ["bob", "amy"]);
  assert.equal(top.total, "200");
});

test("A4 hashes rank,owner,amount lines without a trailing newline and ignores input order", () => {
  const accounts = [item("acc1", "ownerA", "3"), item("acc2", "ownerB", "1")];
  const one = buildSnapshot({ mint: MINT, slot: 13, accounts });
  const two = buildSnapshot({ mint: MINT, slot: 13, accounts: [...accounts].reverse() });
  assert.equal(one.hash, two.hash);
  const expected = hashHolders([
    { rank: 1, owner: "ownerA", amount: "3" },
    { rank: 2, owner: "ownerB", amount: "1" },
  ]);
  assert.equal(one.hash, expected);
  assert.match(one.hash, /^[0-9a-f]{64}$/);
});

test("A5 counts Token 2022 accounts with extensions, including a frozen state", () => {
  const accounts = [
    item("acc1", "ownerA", "1000", {
      program: "spl-token-2022",
      extensions: [{ extension: "transferFeeAmount", state: { withheldAmount: "5" } }, { extension: "immutableOwner" }],
    }),
    { ...item("acc2", "ownerA", "500", { program: "spl-token-2022" }) },
  ];
  accounts[1].account.data.parsed.info.state = "frozen";
  const snap = buildSnapshot({ mint: MINT, slot: 14, accounts });
  assert.deepEqual(snap.holders, [{ rank: 1, owner: "ownerA", amount: "1500" }]);
});
