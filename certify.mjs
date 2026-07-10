// 402coffee-certify — GitHub Action runner.
// Runs the real 402.coffee conformance test(s) with a funded wallet, writes the
// results to the job summary, and (optionally) fails CI if the wallet's risk-score
// tier drops below a threshold. Honest by construction: it drives the real x402
// payment flow — no faking. https://api.402.coffee/integrations

import { appendFileSync } from "node:fs";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const KEY = process.env.INPUT_WALLET_KEY;
const BASE = (process.env.INPUT_API_BASE || "https://api.402.coffee").replace(/\/+$/, "");
const TESTS = (process.env.INPUT_TESTS || "basic")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const MIN_TIER = (process.env.INPUT_MIN_TIER || "").trim().toUpperCase();

const TIER_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1, UNRATED: 0 };
const ALLOWED_TESTS = new Set(["basic", "suite"]);

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}
function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
}
function output(k, v) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
}

if (!KEY || !/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
  fail("wallet-key is missing or malformed. Pass a funded test wallet's private key (0x + 64 hex) from a GitHub secret.");
}
for (const t of TESTS) {
  if (!ALLOWED_TESTS.has(t)) fail(`unsupported test "${t}". Supported: ${[...ALLOWED_TESTS].join(", ")}.`);
}

const account = privateKeyToAccount(KEY);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));
const payFetch = wrapFetchWithPayment(fetch, client);

const rows = [];
let allPassed = true;
let lastCertUrl = "";

for (const test of TESTS) {
  const url = `${BASE}/test/${test}`;
  try {
    const res = await payFetch(url, { method: "POST" });
    const cert = await res.json().catch(() => ({}));
    const ok = res.ok && !!cert.cert_url;
    if (ok) { lastCertUrl = cert.cert_url; }
    else { allPassed = false; }
    rows.push(`| ${test} | ${res.status} | ${ok ? "✅ conformant" : "❌ not conformant"} | ${cert.cert_url ? `[cert](${cert.cert_url})` : "—"} |`);
    console.log(`${test}: HTTP ${res.status} · ${ok ? "conformant" : "NOT conformant"} · ${cert.cert_url || ""}`);
  } catch (e) {
    allPassed = false;
    rows.push(`| ${test} | error | ❌ ${String(e).slice(0, 60)} | — |`);
    console.error(`${test}: ${e}`);
  }
}

let tier = "";
if (MIN_TIER) {
  if (!(MIN_TIER in TIER_RANK)) fail(`min-tier must be one of A, B, C, D, F (got "${MIN_TIER}").`);
  try {
    const res = await payFetch(`${BASE}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: account.address }),
    });
    const score = await res.json().catch(() => ({}));
    tier = String(score.tier || "unrated").toUpperCase();
    const have = TIER_RANK[tier] ?? 0;
    const need = TIER_RANK[MIN_TIER];
    const pass = have >= need;
    if (!pass) allPassed = false;
    rows.push(`| score | ${score.score ?? "?"} | ${pass ? "✅" : "❌"} tier ${tier} (need ≥ ${MIN_TIER}) | — |`);
    console.log(`score: ${score.score} · tier ${tier} · need ≥ ${MIN_TIER} · ${pass ? "PASS" : "FAIL"}`);
  } catch (e) {
    allPassed = false;
    rows.push(`| score | error | ❌ ${String(e).slice(0, 60)} | — |`);
    console.error(`score: ${e}`);
  }
}

summary(`## 402coffee certification\n\nWallet \`${account.address}\`\n\n| step | http | result | link |\n|---|---|---|---|\n${rows.join("\n")}\n`);
output("cert-url", lastCertUrl);
output("tier", tier);
output("passed", String(allPassed));

if (!allPassed) fail("402coffee certification failed — see the job summary.");
console.log("402coffee certification passed.");
