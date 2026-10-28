# FinancialDataAgent

An autonomous AI agent service that registers its onchain identity with ERC-8004 on Arc Testnet and gates every financial data query behind a 0.01 USDC x402 nanopayment, settled via Circle Gateway.

Built with [Arc Studio](https://studio.arc.io)

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS (Arc Dark)
- **Backend**: Bun + Express + `@circle-fin/x402-batching`
- **Web3**: wagmi v2, viem v2, ConnectKit
- **Chain**: Arc Testnet (Chain ID 5042002 — USDC is the native gas token)
- **Agent Identity**: ERC-8004 IdentityRegistry on Arc Testnet
- **Payments**: Circle Gateway Nanopayments (HTTP 402 / x402 protocol)

## What it does

1. The Express backend exposes `POST /agent/query` behind Circle's Gateway Nanopayments middleware. Without a valid `X-PAYMENT` header, any call returns `HTTP 402` with Circle's payment requirements.
2. Buyers use the Circle CLI (`circle services pay`) or any x402-compatible client to attach a 0.01 USDC Gateway authorization. The middleware verifies settlement before the handler runs.
3. The handler computes a mock financial metric (volatility, Sharpe ratio, beta, RSI, etc.) and returns a JSON payload.
4. The React dashboard shows the agent's ERC-8004 identity card, a live query panel, and a step-by-step payment flow explainer.

## Development

### Prerequisites

- Bun ≥ 1.0
- A funded Arc Testnet wallet (get test USDC from the "Get test USDC" button in Arc Studio)

### Install

```bash
bun install
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_SELLER_ADDRESS` | EVM address that receives settled USDC payments |
| `VITE_AGENT_ID` | ERC-8004 agent token ID (auto-written by register script) |
| `AGENT_OWNER_PRIVATE_KEY` | Private key used to sign the registration tx (registration only) |

Create a `.env` file and populate `VITE_SELLER_ADDRESS` with your wallet address.

### Run (two terminals)

```bash
# Terminal 1 — Vite frontend
bun run dev

# Terminal 2 — Agent backend
bun run agent:dev
```

### Register the Agent on ERC-8004

```bash
# Add AGENT_OWNER_PRIVATE_KEY to .env first, then:
bun run agent:register
```

This registers the agent on the Arc Testnet IdentityRegistry and writes `VITE_AGENT_ID` to `.env`. Restart the backend after registration.

### Build

```bash
bunx vite build
```

## Paid API Usage

```bash
# Check the 402 payment requirement
curl -i -X POST http://localhost:3001/agent/query \
  -H "Content-Type: application/json" \
  -d '{"asset":"ETH","metric":"volatility","period":"30d"}'

# Pay and query (Circle CLI)
circle services pay "http://localhost:3001/agent/query" \
  -X POST \
  --address <your-wallet> \
  --chain ARC-TESTNET \
  --max-amount 0.01 \
  --data '{"asset":"ETH","metric":"volatility","period":"30d"}'
```

## Agent Card

`GET /api/agent/card` returns the ERC-8004 registration file (JSON) listing the service endpoint, x402 price, and onchain registration.
