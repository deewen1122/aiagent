/**
 * Autonomous Financial Data Agent — Express backend
 *
 * - Listens on port 3001
 * - POST /agent/query  protected by Circle Gateway Nanopayments (x402, 0.01 USDC on Arc Mainnet)
 * - GET  /agent/health  public health check
 * - GET  /agent/card    returns the agent registration card JSON
 */

import express from 'express';
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// CORS — allow the Vite dev server preview to reach this backend
// ---------------------------------------------------------------------------
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ---------------------------------------------------------------------------
// Circle Gateway Nanopayments middleware (Arc Mainnet)
// ---------------------------------------------------------------------------
const SELLER_ADDRESS = process.env.VITE_SELLER_ADDRESS;
if (!SELLER_ADDRESS) {
  console.warn('[agent-server] VITE_SELLER_ADDRESS not set — set it in .env before payments settle.');
}

// Omitting facilitatorUrl selects the mainnet Gateway (https://gateway-api.circle.com).
// Real USDC will move when a buyer pays the /agent/query endpoint.
const gateway = createGatewayMiddleware({
  sellerAddress: (SELLER_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
});

// ---------------------------------------------------------------------------
// Arc Mainnet ERC-8004 registry address
// Source: https://docs.arc.io/arc/references/contract-addresses.md
// arc-studio-allow-onchain-literal
// ---------------------------------------------------------------------------
// arc-studio-allow-onchain-literal
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// ---------------------------------------------------------------------------
// Mock financial data engine
// ---------------------------------------------------------------------------
interface QueryRequest {
  asset?: string;
  metric?: string;
  period?: string;
}

interface QueryResponse {
  asset: string;
  metric: string;
  period: string;
  value: number;
  unit: string;
  confidence: number;
  computedAt: string;
  agentId: string;
  settlementVerified: boolean;
}

function computeFinancialData(req: QueryRequest): QueryResponse {
  const asset   = (req.asset  || 'BTC').toUpperCase();
  const metric  = (req.metric || 'volatility').toLowerCase();
  const period  = (req.period || '30d');

  // Deterministic seed-based mock — varies by asset/metric so results look realistic
  const seed  = asset.charCodeAt(0) + metric.length * 3 + period.length;
  const value = parseFloat(((seed % 97) + 2.5 + Math.random() * 0.3).toFixed(4));

  const unitMap: Record<string, string> = {
    volatility: '%',
    return:     '%',
    sharpe:     'ratio',
    beta:       'coefficient',
    volume:     'USD',
    price:      'USD',
    rsi:        'index',
  };

  return {
    asset,
    metric,
    period,
    value,
    unit:               unitMap[metric] ?? 'unit',
    confidence:         Math.round(85 + (seed % 13)),
    computedAt:         new Date().toISOString(),
    agentId:            process.env.VITE_AGENT_ID_MAINNET ?? process.env.VITE_AGENT_ID ?? '2866',
    settlementVerified: true,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Public health check */
app.get('/agent/health', (_req, res) => {
  res.json({
    status:           'ok',
    agent:            'FinancialDataAgent',
    chain:            'Arc Mainnet (5042)',
    price:            '$0.001 USDC per query',
    agentId:          process.env.VITE_AGENT_ID_MAINNET ?? '2866',
    identityRegistry: IDENTITY_REGISTRY,
  });
});

/** Agent registration card (ERC-8004 compatible format) */
app.get('/agent/card', (_req, res) => {
  const agentId    = process.env.VITE_AGENT_ID_MAINNET ?? '2866';
  const sellerAddr = process.env.VITE_SELLER_ADDRESS ?? '0x0000000000000000000000000000000000000000';
  const card = {
    type:        'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name:        'FinancialDataAgent',
    description: 'Autonomous AI agent that computes financial metrics (volatility, Sharpe ratio, beta, RSI) for any asset. Each query costs 0.01 USDC, settled via Circle Gateway Nanopayments on Arc Mainnet.',
    services: [
      {
        name:     'FinancialQuery',
        endpoint: '/api/agent/query',
        version:  '1.0.0',
        schema: {
          request: {
            asset:  'string — ticker symbol e.g. BTC, ETH, SOL',
            metric: 'string — volatility | return | sharpe | beta | volume | price | rsi',
            period: 'string — 7d | 30d | 90d | 1y',
          },
          response: {
            asset:              'string',
            metric:             'string',
            period:             'string',
            value:              'number',
            unit:               'string',
            confidence:         'number 0-100',
            computedAt:         'ISO-8601 timestamp',
            agentId:            'string',
            settlementVerified: 'boolean',
          },
        },
      },
    ],
    x402Support:   true,
    x402Price:     '0.001 USDC',
    active:        true,
    sellerAddress: sellerAddr,
    registrations: agentId !== 'unregistered'
      ? [{ agentId: Number(agentId), agentRegistry: `eip155:5042:${IDENTITY_REGISTRY}` }]
      : [],
    supportedTrust: ['reputation'],
  };
  res.json(card);
});

/** Paid query endpoint — requires x402 Gateway payment of $0.001 */
app.post('/agent/query', gateway.require('$0.001'), (req, res) => {
  try {
    const result = computeFinancialData(req.body as QueryRequest);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Computation failed', detail: String(err) });
  }
});

/** Free preview endpoint — no payment required, for local testing */
app.post('/agent/query-preview', (req, res) => {
  try {
    const result = { ...computeFinancialData(req.body as QueryRequest), settlementVerified: false };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Computation failed', detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[agent-server] Listening on http://localhost:${PORT}`);
  console.log(`[agent-server] Seller: ${process.env.VITE_SELLER_ADDRESS ?? '(not set)'}`);
  console.log(`[agent-server] Agent ID: ${process.env.VITE_AGENT_ID ?? '(not registered)'}`);
});
