# FinancialDataAgent — Agent Memory

> Built with Arc Studio — money-powered apps in minutes

## What This App Does

Autonomous AI agent service that:
1. Registers its identity with ERC-8004 on Arc Testnet (identity registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`)
2. Protects `POST /agent/query` with Circle Gateway Nanopayments (x402, 0.01 USDC per call)
3. Executes mock financial metric calculations (volatility, Sharpe ratio, beta, RSI, etc.)
4. Returns the result payload upon verified x402 settlement

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS (Arc Dark theme)
- Web3: wagmi v2, viem v2, ConnectKit
- Backend: Bun + Express + `@circle-fin/x402-batching`
- Chain: Arc Testnet (Chain ID: 5042002, USDC gas)
- Agent Identity: ERC-8004 (IdentityRegistry on Arc Testnet)
- Payments: Circle Gateway Nanopayments (x402 HTTP 402 / X-PAYMENT header flow)
- Toasts: Sonner

## Key Files

- `server/agent-server.ts`          — Express backend with x402 middleware + mock computation engine
- `src/components/AgentDashboard.tsx` — Main React UI (agent card, query panel, activity log)
- `scripts/register-agent.ts`       — ERC-8004 registration script (run once, writes VITE_AGENT_ID to .env)
- `src/App.tsx`                     — App entry, mounts AgentDashboard

## Contract / Registry Addresses (Arc Testnet)

| Name | Address |
|------|---------|
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ERC-8004 ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` |

## Deployed Agent

| Field | Value |
|-------|-------|
| Agent ID | _(set after running `bun run agent:register`)_ |
| agentURI | `https://iz8b1a8jcsxcsat7h9m0v.preview.studio.arc.io/api/agent/card` |
| Seller Address | _(set in VITE_SELLER_ADDRESS in .env)_ |

## Environment Variables

| Key | Purpose |
|-----|---------|
| `VITE_SELLER_ADDRESS` | EVM wallet address to receive settled USDC payments |
| `VITE_AGENT_ID` | ERC-8004 agentId (written by `bun run agent:register`) |
| `AGENT_OWNER_PRIVATE_KEY` | Private key of the wallet that owns the agent (registration only) |

## Decisions

- Using Circle Gateway testnet facilitator (`https://gateway-api-testnet.circle.com`) — no mainnet USDC involved
- `agentURI` points at our live `/api/agent/card` endpoint (development). Production should use an IPFS URI.
- Mock computation engine seeds from asset/metric chars so results vary deterministically; no real oracle feed needed for the demo.
- The demo UI calls `/api/agent/query` directly (without a Circle wallet), so browsers get the raw 402 response. The CLI flow shows how an agent buyer would pay via `circle services pay`.
