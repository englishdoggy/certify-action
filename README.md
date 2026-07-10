# 402coffee-certify-action

A GitHub Action that **certifies your x402 paying agent against [402.coffee](https://api.402.coffee/integrations) on every push** — so a code change can't silently break how your agent pays. It runs the real conformance test (a real, gasless USDC payment on Base), writes the result to the job summary, and can **fail the build if your agent's risk-score tier drops**.

Every result is a fact observed on-chain — it drives the real payment flow, nothing is faked.

## Usage

```yaml
# .github/workflows/certify.yml
name: certify agent
on: [push]
jobs:
  certify:
    runs-on: ubuntu-latest
    steps:
      - uses: englishdoggy/certify-action@v1
        with:
          wallet-key: ${{ secrets.CERTIFY_WALLET_KEY }}   # a FUNDED test wallet, stored as a secret
          tests: basic            # or "basic,suite"
          min-tier: B             # optional: fail if the wallet scores below tier B
```

### Setup (one time)
1. Create a throwaway test wallet and fund it with a little **USDC on Base** (gasless — no ETH needed). `basic` costs $0.25 per run; `min-tier` adds $0.10 for the score lookup.
2. In your repo: **Settings → Secrets and variables → Actions → New secret** → name it `CERTIFY_WALLET_KEY`, value = that wallet's private key (`0x…`). **Never commit the key.**
3. Add the workflow above.

## Inputs

| input | required | default | what |
|---|---|---|---|
| `wallet-key` | yes | — | private key of a funded test wallet (from a secret) |
| `tests` | no | `basic` | comma list: `basic`, `suite` |
| `min-tier` | no | — | `A`–`F`; fail the job below this tier (adds a $0.10 score lookup) |
| `api-base` | no | `https://api.402.coffee` | advanced/testing |

## Outputs

| output | what |
|---|---|
| `cert-url` | public certificate URL of the last test |
| `tier` | risk-score tier (when `min-tier` was set) |
| `passed` | `true` if every test was conformant and the tier gate passed |

## What it costs
Real USDC on Base, per run: `basic` $0.25, `suite` $0.75, plus $0.10 if `min-tier` is set. Keep the test wallet funded. Use `on:` triggers deliberately (e.g. only on `main` or a weekly schedule) if you want to limit spend.

## Why
Certificates are fresh-dated (30 days) and reflect *current* behaviour. Running this in CI keeps your credential fresh automatically and catches a regression — e.g. a refactor that makes your agent pay a scam price — the moment it lands, not after a counterparty gets burned.

MIT © 402.coffee
