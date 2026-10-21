import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSnapshot } from "../src/snapshot.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "token2022-pyusd.json");

test("A7 recorded fixtures of a real Token 2022 mint: grouping, extensions and a stable hash", () => {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(typeof fixture.slot, "number");
  assert.ok(fixture.accounts.length > 0, "the fixture holds real accounts");

  const mint = fixture.source.mint;
  assert.match(mint, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "a real base58 mint address");

  for (const item of fixture.accounts) {
    const info = item.account.data.parsed.info;
    assert.equal(item.account.data.parsed.type, "account");
    assert.equal(info.mint, mint, "every recorded item belongs to the fixture mint");
    assert.ok(BigInt(info.tokenAmount.amount) > 0n, "only positive balances were recorded");
  }

  const extensionNames = new Set();
  for (const item of fixture.accounts) {
    for (const ext of item.account.data.parsed.info.extensions || []) {
      extensionNames.add(ext.extension);
    }
  }
  assert.ok(extensionNames.has("transferFeeAmount"), "a transfer fee extension is present");
  assert.ok(extensionNames.has("immutableOwner"), "an immutable owner extension is present");

  const snap = buildSnapshot({ mint, slot: fixture.slot, accounts: fixture.accounts });
  assert.equal(snap.holders.length, fixture.accounts.length, "each recorded owner is distinct");
  assert.equal(snap.hash.length, 64);

  const expected = createHash("sha256")
    .update(Buffer.from(snap.holders.map((h) => `${h.rank},${h.owner},${h.amount}`).join("\n"), "utf8"))
    .digest("hex");
  assert.equal(snap.hash, expected);

  const reversed = buildSnapshot({
    mint, slot: fixture.slot, accounts: [...fixture.accounts].reverse(),
  });
  assert.equal(reversed.hash, snap.hash, "the same accounts in any order give the same hash");

  const top10 = buildSnapshot({ mint, slot: fixture.slot, accounts: fixture.accounts, top: 10 });
  assert.equal(top10.holders.length, Math.min(10, fixture.accounts.length));
  assert.equal(top10.total, snap.total, "total covers every owner, not only the kept rows");
});
