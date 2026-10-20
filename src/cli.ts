#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { buildSnapshot, type Exclusions, type TokenAccountItem } from "./snapshot.js";
import { fetchAccounts } from "./rpc.js";

interface Options {
  mint?: string;
  exclusions?: string;
  slot?: number;
  top?: number;
  out?: string;
  fixture?: string;
  saveFixture?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--mint":
        options.mint = next();
        break;
      case "--exclusions":
        options.exclusions = next();
        break;
      case "--slot":
        options.slot = Number(next());
        break;
      case "--top":
        options.top = Number(next());
        break;
      case "--out":
        options.out = next();
        break;
      case "--fixture":
        options.fixture = next();
        break;
      case "--save-fixture":
        options.saveFixture = next();
        break;
      case "--help":
      case "-h":
        throw new Error(
          "usage: kog-snapshot --mint <address> --exclusions <file> [--slot <n>] [--top <n>] [--out <file>] [--fixture <file>] [--save-fixture <file>]",
        );
      default:
        throw new Error(`unknown option ${arg}`);
    }
  }
  return options;
}

async function readJson<T>(path: string, what: string): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`cannot read the ${what} file ${path}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`the ${what} file ${path} is not valid json`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.mint) throw new Error("missing --mint");
  if (options.slot !== undefined && (!Number.isInteger(options.slot) || options.slot < 0)) {
    throw new Error("--slot must be a non negative integer");
  }
  if (options.top !== undefined && (!Number.isInteger(options.top) || options.top < 0)) {
    throw new Error("--top must be a non negative integer");
  }

  let exclusions: Exclusions = {};
  if (options.exclusions) exclusions = await readJson<Exclusions>(options.exclusions, "exclusions");

  let slot: number;
  let accounts: TokenAccountItem[];

  if (options.fixture) {
    const recorded = await readJson<{ slot: number; accounts: TokenAccountItem[] }>(options.fixture, "fixture");
    if (typeof recorded.slot !== "number" || !Array.isArray(recorded.accounts)) {
      throw new Error("the fixture must hold {slot, accounts}");
    }
    slot = recorded.slot;
    accounts = recorded.accounts;
  } else {
    const fetched = await fetchAccounts({ mint: options.mint, slot: options.slot });
    slot = fetched.slot;
    accounts = fetched.accounts;
    if (options.saveFixture) {
      await writeFile(options.saveFixture, `${JSON.stringify({ slot, accounts })}\n`, "utf8");
    }
  }

  const snapshot = buildSnapshot({ mint: options.mint, slot, accounts, exclusions, top: options.top });
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (options.out) await writeFile(options.out, text, "utf8");
  else process.stdout.write(text);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
