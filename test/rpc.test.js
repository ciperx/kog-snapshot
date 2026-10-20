import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchAccounts } from "../dist/rpc.js";
import { buildSnapshot } from "../dist/snapshot.js";

const run = promisify(execFile);
const CLI = new URL("../dist/cli.js", import.meta.url).pathname;

const MINT = "Am8iBffqgaedfdK5XhtorbcRrKzwH9nyL3ySikQfpump";

test("A6 fetchAccounts sends one getProgramAccounts per token program with jsonParsed, withContext and the mint filter", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const program = calls.length === 1 ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" : "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: program.startsWith("Tokenz") ? 500 : 400 },
          value: [
            {
              pubkey: `acc${calls.length}`,
              account: {
                owner: program,
                data: {
                  program: "spl-token",
                  parsed: { type: "account", info: { mint: MINT, owner: "ownerA", tokenAmount: { amount: "7", decimals: 0 } } },
                },
              },
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const out = await fetchAccounts({ rpcUrl: "https://rpc.invalid", mint: MINT, slot: 123, fetch: fakeFetch });
  assert.equal(calls.length, 2);
  assert.equal(out.slot, 400);
  assert.equal(out.accounts.length, 2);
  for (const call of calls) {
    const [program, config] = call.body.params;
    assert.match(program, /^Token/);
    assert.equal(call.body.method, "getProgramAccounts");
    assert.equal(config.encoding, "jsonParsed");
    assert.equal(config.withContext, true);
    assert.equal(config.minContextSlot, 123);
    assert.deepEqual(config.filters, [{ memcmp: { offset: 0, bytes: MINT } }]);
  }
});

test("A6 the CLI writes a snapshot from a recorded fixture and exits 1 on bad input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kog-"));
  const fixture = join(dir, "fixture.json");
  const exclusions = join(dir, "exclusions.json");
  const out = join(dir, "snapshot.json");
  const recorded = {
    slot: 459405374,
    accounts: [
      {
        pubkey: "13XxeAtqWnEt3Psj69gYYGPenrtQTvmeEKtba82oKJs",
        account: {
          owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          data: {
            program: "spl-token-2022",
            parsed: {
              type: "account",
              info: {
                mint: MINT,
                owner: "GA4m6eazpd27mdzHLDmGVFVPt6n1v",
                state: "initialized",
                tokenAmount: { amount: "1234", decimals: 6 },
                extensions: [{ extension: "immutableOwner" }],
              },
            },
          },
        },
      },
    ],
  };
  await writeFile(fixture, JSON.stringify(recorded));
  await writeFile(exclusions, JSON.stringify({ owners: [], token_accounts: [] }));

  const ok = await run("node", [CLI, "--mint", MINT, "--exclusions", exclusions, "--fixture", fixture, "--out", out]);
  assert.equal(ok.stderr, "");
  const written = JSON.parse(await readFile(out, "utf8"));
  assert.equal(written.mint, MINT);
  assert.equal(written.slot, 459405374);
  assert.equal(written.total, "1234");
  assert.equal(written.holders.length, 1);

  await assert.rejects(run("node", [CLI, "--exclusions", exclusions, "--fixture", fixture]), /missing --mint/);
  await assert.rejects(run("node", [CLI, "--mint", MINT, "--exclusions", join(dir, "nope.json"), "--fixture", fixture]), /cannot read the exclusions file/);
});

test("A7 a recorded Token 2022 fixture produces a stable snapshot", async () => {
  const fixturePath = new URL("../fixtures/t22-recorded.json", import.meta.url).pathname;
  const recorded = JSON.parse(await readFile(fixturePath, "utf8"));
  const snap = buildSnapshot({
    mint: recorded.mint,
    slot: recorded.slot,
    accounts: recorded.accounts,
    exclusions: { owners: [], token_accounts: [] },
    top: recorded.accounts.length,
  });
  assert.equal(snap.mint, recorded.mint);
  assert.ok(snap.holders.length > 0, "the recorded fixture must hold at least one holder");
  assert.match(snap.hash, /^[0-9a-f]{64}$/);
  const again = buildSnapshot({
    mint: recorded.mint,
    slot: recorded.slot,
    accounts: [...recorded.accounts].reverse(),
    exclusions: { owners: [], token_accounts: [] },
    top: recorded.accounts.length,
  });
  assert.equal(snap.hash, again.hash);
  assert.ok(BigInt(snap.total) > 0n);
});
