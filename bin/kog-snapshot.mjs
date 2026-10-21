#!/usr/bin/env node
/**
 * kog-snapshot CLI.
 *
 *   kog-snapshot --mint <address> --exclusions <file> [--slot <n>] [--top <n>]
 *                [--out <file>] [--fixture <file>] [--save-fixture <file>]
 *
 * The RPC URL comes from SOLANA_RPC_URL and is never printed.
 * Exit 0 on success, 1 with a plain message on a missing mint, an unreadable
 * file or an RPC error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSnapshot, fetchAccounts } from "../src/snapshot.js";

function usage() {
  return "usage: kog-snapshot --mint <address> --exclusions <file> " +
    "[--slot <n>] [--top <n>] [--out <file>] [--fixture <file>] [--save-fixture <file>]";
}

function parseArgs(argv) {
  const known = new Set([
    "mint", "exclusions", "slot", "top", "out", "fixture", "save-fixture",
  ]);
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new Error("unexpected argument: " + raw);
    const name = raw.slice(2);
    if (!known.has(name)) throw new Error("unknown option: " + raw);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("missing value for " + raw);
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error("cannot read " + what + ": " + path);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid JSON in " + what + ": " + path);
  }
}

function toInt(value, name) {
  if (!/^\d+$/.test(String(value))) throw new Error(name + " must be a non-negative integer");
  return Number(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mint) throw new Error("missing --mint");

  const exclusions = args.exclusions ? readJson(args.exclusions, "exclusions file") : {};
  const top = args.top !== undefined ? toInt(args.top, "--top") : undefined;
  const requestedSlot = args.slot !== undefined ? toInt(args.slot, "--slot") : undefined;

  let slot = requestedSlot === undefined ? null : requestedSlot;
  let accounts;

  if (args.fixture) {
    const fixture = readJson(args.fixture, "fixture file");
    if (!Array.isArray(fixture.accounts)) throw new Error("fixture has no accounts array");
    accounts = fixture.accounts;
    if (slot === null && typeof fixture.slot === "number") slot = fixture.slot;
  } else {
    const fetched = await fetchAccounts({
      rpcUrl: process.env.SOLANA_RPC_URL,
      mint: args.mint,
      minContextSlot: requestedSlot === undefined ? undefined : requestedSlot,
    });
    accounts = fetched.accounts;
    if (args["save-fixture"]) {
      writeFileSync(
        args["save-fixture"],
        JSON.stringify({ slot: fetched.slot, accounts: fetched.accounts }, null, 1) + "\n",
      );
    }
    if (slot === null) slot = fetched.slot;
  }

  const snapshot = buildSnapshot({ mint: args.mint, slot, accounts, exclusions, top });
  const text = JSON.stringify(snapshot, null, 2) + "\n";
  if (args.out) {
    writeFileSync(args.out, text);
  } else {
    process.stdout.write(text);
  }
}

main().catch((error) => {
  process.stderr.write("kog-snapshot: " + (error && error.message ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
