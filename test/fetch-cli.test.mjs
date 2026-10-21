import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchAccounts, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "../src/snapshot.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BIN = join(ROOT, "bin", "kog-snapshot.mjs");
const MINT = "KOGmint111111111111111111111111111111111111";

function rpcResponse(slot, accounts) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: { context: { slot }, value: accounts } }),
  };
}

test("A6 fetchAccounts sends one jsonParsed getProgramAccounts call per token program and takes the lowest context slot", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const is2022 = body.params[0] === TOKEN_2022_PROGRAM_ID;
    return rpcResponse(is2022 ? 900 : 1000, [
      {
        pubkey: is2022 ? "acc2022" : "acclegacy",
        account: {
          owner: body.params[0],
          data: {
            program: is2022 ? "spl-token-2022" : "spl-token",
            parsed: {
              type: "account",
              info: {
                mint: MINT,
                owner: is2022 ? "Owner2022" : "OwnerLegacy",
                state: "initialized",
                tokenAmount: { amount: is2022 ? "7" : "3", decimals: 6 },
              },
            },
          },
        },
      },
    ]);
  };

  const result = await fetchAccounts({ rpcUrl: "https://rpc.example.invalid", mint: MINT, fetch: fakeFetch });

  assert.equal(calls.length, 2);
  const programs = calls.map((c) => c.body.params[0]).sort();
  assert.deepEqual(programs, [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].sort());
  for (const call of calls) {
    assert.equal(call.body.method, "getProgramAccounts");
    assert.equal(call.body.params[1].encoding, "jsonParsed");
    assert.equal(call.body.params[1].withContext, true);
    assert.deepEqual(call.body.params[1].filters, [{ memcmp: { offset: 0, bytes: MINT } }]);
  }
  assert.equal(result.slot, 900, "the lowest of the two context slots");
  assert.equal(result.accounts.length, 2);

  const snapshot = (await import("../src/snapshot.js")).buildSnapshot({
    mint: MINT,
    slot: result.slot,
    accounts: result.accounts,
  });
  assert.equal(snapshot.total, "10");
  assert.deepEqual(snapshot.holders.map((h) => h.owner), ["Owner2022", "OwnerLegacy"]);
});

test("A6 the CLI writes the snapshot from a recorded fixture with no network, and exits 1 with a message on bad input", () => {
  const dir = mkdtempSync(join(tmpdir(), "kog-snapshot-"));
  const exclusionsPath = join(dir, "exclusions.json");
  writeFileSync(exclusionsPath, JSON.stringify({ owners: ["OwnerB"], token_accounts: [] }));

  const fixture = {
    slot: 4242,
    accounts: [
      {
        pubkey: "accA",
        account: {
          owner: TOKEN_PROGRAM_ID,
          data: {
            program: "spl-token",
            parsed: {
              type: "account",
              info: {
                mint: MINT,
                owner: "OwnerA",
                state: "initialized",
                tokenAmount: { amount: "100", decimals: 6 },
              },
            },
          },
        },
      },
      {
        pubkey: "accB",
        account: {
          owner: TOKEN_PROGRAM_ID,
          data: {
            program: "spl-token",
            parsed: {
              type: "account",
              info: {
                mint: MINT,
                owner: "OwnerB",
                state: "initialized",
                tokenAmount: { amount: "900", decimals: 6 },
              },
            },
          },
        },
      },
    ],
  };
  const fixturePath = join(dir, "fixture.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));

  const ok = spawnSync(process.execPath, [
    BIN, "--mint", MINT, "--exclusions", exclusionsPath, "--fixture", fixturePath, "--top", "10",
  ], { env: { ...process.env, SOLANA_RPC_URL: "http://127.0.0.1:9/never" }, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const parsed = JSON.parse(ok.stdout);
  assert.equal(parsed.slot, 4242);
  assert.equal(parsed.total, "100", "the excluded owner is not part of the total");
  assert.deepEqual(parsed.holders, [{ rank: 1, owner: "OwnerA", amount: "100" }]);

  const outPath = join(dir, "snapshot.json");
  const withOut = spawnSync(process.execPath, [
    BIN, "--mint", MINT, "--exclusions", exclusionsPath, "--fixture", fixturePath, "--out", outPath,
  ], { encoding: "utf8" });
  assert.equal(withOut.status, 0, withOut.stderr);
  assert.equal(JSON.parse(readFileSync(outPath, "utf8")).hash.length, 64);

  const missingMint = spawnSync(process.execPath, [BIN, "--exclusions", exclusionsPath],
    { encoding: "utf8" });
  assert.equal(missingMint.status, 1);
  assert.match(missingMint.stderr, /missing --mint/);

  const unreadable = spawnSync(process.execPath, [
    BIN, "--mint", MINT, "--exclusions", join(dir, "nope.json"), "--fixture", fixturePath,
  ], { encoding: "utf8" });
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.stderr, /cannot read exclusions file/);

  const badSlot = spawnSync(process.execPath, [
    BIN, "--mint", MINT, "--exclusions", exclusionsPath, "--fixture", fixturePath, "--slot", "abc",
  ], { encoding: "utf8" });
  assert.equal(badSlot.status, 1);
  assert.match(badSlot.stderr, /--slot/);

  assert.doesNotMatch(ok.stdout + ok.stderr + missingMint.stderr, /never/, "the RPC URL is never printed");
});
