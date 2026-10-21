import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildSnapshot, fetchAccounts, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../src/snapshot.js";

const MINT = "KOGmint111111111111111111111111111111111111";
const OTHER_MINT = "Othermint111111111111111111111111111111111";

function account(pubkey, owner, mint, amount, options = {}) {
  const program = options.program || "spl-token";
  const info = {
    mint,
    owner,
    state: options.state || "initialized",
    tokenAmount: { amount: String(amount), decimals: 6, uiAmount: null, uiAmountString: "" },
  };
  if (options.extensions) info.extensions = options.extensions;
  return {
    pubkey,
    account: {
      owner: options.programId || TOKEN_PROGRAM_ID,
      lamports: 2039280,
      data: { program, parsed: { type: "account", info }, space: 165 },
    },
  };
}

function snapshotOf(accounts, extra = {}) {
  return buildSnapshot({ mint: MINT, slot: 1234, accounts, ...extra });
}

function expectedHash(holders) {
  const text = holders.map((h) => `${h.rank},${h.owner},${h.amount}`).join("\n");
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

test("A1 accounts are grouped by owner across both token programs; other mints, zero balances and non-accounts are ignored", () => {
  const accounts = [
    account("accA1", "OwnerA", MINT, "100"),
    account("accA2", "OwnerA", MINT, "50", { program: "spl-token-2022", programId: TOKEN_2022_PROGRAM_ID }),
    account("accB1", "OwnerB", MINT, "200"),
    account("accOther", "OwnerC", OTHER_MINT, "999"),
    account("accZero", "OwnerD", MINT, "0"),
    {
      pubkey: "mintItself",
      account: {
        owner: TOKEN_PROGRAM_ID,
        data: { program: "spl-token", parsed: { type: "mint", info: { mint: MINT, decimals: 6 } } },
      },
    },
    { pubkey: "notAnAccount", account: { owner: TOKEN_PROGRAM_ID, data: { program: "system", parsed: null } } },
  ];

  const snap = snapshotOf(accounts);
  assert.deepEqual(snap.holders, [
    { rank: 1, owner: "OwnerB", amount: "200" },
    { rank: 2, owner: "OwnerA", amount: "150" },
  ]);
  assert.equal(snap.total, "350");
  assert.equal(snap.mint, MINT);
  assert.equal(snap.slot, 1234);
});

test("A2 exclusions by owner and by token account are applied", () => {
  const accounts = [
    account("accA1", "OwnerA", MINT, "100"),
    account("accA2", "OwnerA", MINT, "50"),
    account("accB1", "OwnerB", MINT, "200"),
    account("accC1", "OwnerC", MINT, "70"),
  ];

  const byOwner = snapshotOf(accounts, { exclusions: { owners: ["OwnerB"], token_accounts: [] } });
  assert.deepEqual(byOwner.holders.map((h) => h.owner), ["OwnerA", "OwnerC"]);
  assert.equal(byOwner.total, "220");

  const byAccount = snapshotOf(accounts, { exclusions: { owners: [], token_accounts: ["accA1"] } });
  assert.deepEqual(byAccount.holders, [
    { rank: 1, owner: "OwnerB", amount: "200" },
    { rank: 2, owner: "OwnerC", amount: "70" },
    { rank: 3, owner: "OwnerA", amount: "50" },
  ]);
  assert.equal(byAccount.total, "320");
});

test("A3 ranking is by amount with ties by owner, and top keeps the first N", () => {
  const accounts = [
    account("a1", "zeta", MINT, "10"),
    account("a2", "alpha", MINT, "10"),
    account("a3", "beta", MINT, "30"),
    account("a4", "gamma", MINT, "5"),
  ];

  const snap = snapshotOf(accounts);
  assert.deepEqual(snap.holders, [
    { rank: 1, owner: "beta", amount: "30" },
    { rank: 2, owner: "alpha", amount: "10" },
    { rank: 3, owner: "zeta", amount: "10" },
    { rank: 4, owner: "gamma", amount: "5" },
  ]);

  const top2 = snapshotOf(accounts, { top: 2 });
  assert.deepEqual(top2.holders, [
    { rank: 1, owner: "beta", amount: "30" },
    { rank: 2, owner: "alpha", amount: "10" },
  ]);
  assert.equal(top2.total, "55", "total counts every owner after exclusions, not only the kept rows");
});

test("A4 the hash follows the rank,owner,amount rule and any account order gives the same hash", () => {
  const accounts = [
    account("a1", "OwnerA", MINT, "1000"),
    account("a2", "OwnerB", MINT, "2000"),
    account("a3", "OwnerC", MINT, "3000"),
  ];

  const snap = snapshotOf(accounts);
  assert.equal(snap.hash, expectedHash(snap.holders));
  assert.match(snap.hash, /^[0-9a-f]{64}$/);

  const shuffled = snapshotOf([accounts[2], accounts[0], accounts[1]]);
  assert.equal(shuffled.hash, snap.hash);
  assert.deepEqual(shuffled.holders, snap.holders);

  const sliced = snapshotOf(accounts, { top: 2 });
  assert.equal(sliced.hash, expectedHash(sliced.holders));
  assert.notEqual(sliced.hash, snap.hash);
});

test("A5 Token 2022 accounts with extensions, including a frozen state, are counted by their amount", () => {
  const accounts = [
    account("t22a", "OwnerFee", MINT, "777", {
      program: "spl-token-2022",
      programId: TOKEN_2022_PROGRAM_ID,
      extensions: [{ extension: "transferFeeAmount", state: { withheldAmount: 0 } }],
    }),
    account("t22b", "OwnerImmutable", MINT, "88", {
      program: "spl-token-2022",
      programId: TOKEN_2022_PROGRAM_ID,
      extensions: [{ extension: "immutableOwner" }],
    }),
    account("t22c", "OwnerFrozen", MINT, "5", {
      program: "spl-token-2022",
      programId: TOKEN_2022_PROGRAM_ID,
      state: "frozen",
      extensions: [{ extension: "immutableOwner" }],
    }),
  ];

  const snap = snapshotOf(accounts);
  assert.deepEqual(snap.holders, [
    { rank: 1, owner: "OwnerFee", amount: "777" },
    { rank: 2, owner: "OwnerImmutable", amount: "88" },
    { rank: 3, owner: "OwnerFrozen", amount: "5" },
  ]);
  assert.equal(snap.total, "870");
});
